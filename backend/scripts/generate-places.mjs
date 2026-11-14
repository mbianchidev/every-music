// Builds backend/database/seeds/places.tsv.gz from the GeoNames cities15000,
// admin1 and country exports (CC BY 4.0, https://www.geonames.org/).
//
//   node scripts/generate-places.mjs                 # download current exports
//   node scripts/generate-places.mjs --source DIR    # reuse pinned local copies
//
// The same inputs always produce the same TSV content; the manifest records
// input checksums so a generated seed can be traced and regenerated.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, inflateRawSync } from 'node:zlib';
import { PLACE_SEED_COLUMNS, searchNames } from '../src/engines/place-names.js';

const SOURCE = 'https://download.geonames.org/export/dump/';
const INPUTS = ['cities15000.zip', 'admin1CodesASCII.txt', 'countryInfo.txt'];
const seeds = join(dirname(fileURLToPath(import.meta.url)), '../database/seeds');

export function unzipEntry(archive, wanted) {
  let end = archive.length - 22;
  while (end >= 0 && archive.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('Not a zip archive');
  const entries = archive.readUInt16LE(end + 10);
  let offset = archive.readUInt32LE(end + 16);
  for (let index = 0; index < entries; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new Error('Corrupt zip central directory');
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (name !== wanted) continue;
    const start = localOffset + 30 + archive.readUInt16LE(localOffset + 26) + archive.readUInt16LE(localOffset + 28);
    const data = archive.subarray(start, start + compressedSize);
    if (method === 0) return data;
    if (method === 8) return inflateRawSync(data);
    throw new Error(`Unsupported zip compression method ${method}`);
  }
  throw new Error(`${wanted} not found in archive`);
}

function tsv(text) {
  return text.split('\n').filter(line => line && !line.startsWith('#')).map(line => line.replace(/\r$/, '').split('\t'));
}

export function buildPlaces({ cities, admin1, countries }) {
  const regionNames = new Map(tsv(admin1).map(([code, name]) => [code, name]));
  const countryNames = new Map(tsv(countries).map(columns => [columns[0], columns[4]]));
  const rows = [];
  for (const columns of tsv(cities)) {
    const [id, name, asciiName, alternates, latitude, longitude] = columns;
    const countryCode = columns[8];
    const regionCode = columns[10] || '';
    const population = Number.parseInt(columns[14] || '0', 10) || 0;
    const countryName = countryNames.get(countryCode);
    if (!/^\d+$/.test(id) || !/^[A-Z]{2}$/.test(countryCode) || !countryName) continue;
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const names = searchNames(name, asciiName, alternates ? alternates.split(',') : []);
    const values = [
      id, name, countryCode, countryName, regionCode,
      regionNames.get(`${countryCode}.${regionCode}`) || '', latitude, longitude, String(population), `|${names.join('|')}|`,
    ];
    if (values.some(value => /[\t\n\r]/.test(value))) throw new Error(`Unexpected control character in GeoNames row ${id}`);
    rows.push(values);
  }
  rows.sort((first, second) => Number(first[0]) - Number(second[0]));
  return `${[PLACE_SEED_COLUMNS, ...rows].map(row => row.join('\t')).join('\n')}\n`;
}

async function readInputs(source) {
  const files = {};
  const metadata = {};
  for (const name of INPUTS) {
    if (source) {
      files[name] = await readFile(join(source, name));
      metadata[name] = { sha256: createHash('sha256').update(files[name]).digest('hex') };
    } else {
      const response = await fetch(`${SOURCE}${name}`);
      if (!response.ok) throw new Error(`Download of ${name} failed with HTTP ${response.status}`);
      files[name] = Buffer.from(await response.arrayBuffer());
      metadata[name] = {
        sha256: createHash('sha256').update(files[name]).digest('hex'),
        lastModified: response.headers.get('last-modified'),
      };
    }
  }
  return { files, metadata };
}

async function main() {
  const sourceIndex = process.argv.indexOf('--source');
  const source = sourceIndex > 0 ? process.argv[sourceIndex + 1] : null;
  const { files, metadata } = await readInputs(source);
  const content = buildPlaces({
    cities: unzipEntry(files['cities15000.zip'], 'cities15000.txt').toString('utf8'),
    admin1: files['admin1CodesASCII.txt'].toString('utf8'),
    countries: files['countryInfo.txt'].toString('utf8'),
  });
  await mkdir(seeds, { recursive: true });
  await writeFile(join(seeds, 'places.tsv.gz'), gzipSync(content, { level: 9 }));
  const manifest = {
    dataset: 'GeoNames cities15000 with admin1 regions and country names',
    license: 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)',
    attribution: 'GeoNames (https://www.geonames.org/)',
    source: SOURCE,
    inputs: metadata,
    rows: content.split('\n').length - 2,
    contentSha256: createHash('sha256').update(content).digest('hex'),
  };
  await writeFile(join(seeds, 'places.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${manifest.rows} places (${manifest.contentSha256.slice(0, 12)})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Place dataset generation failed:', error);
    process.exitCode = 1;
  });
}
