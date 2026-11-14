import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const source = fileURLToPath(new URL('../src/', import.meta.url));
const localesDirectory = join(source, 'locales');
const LOCALES = ['en', 'nl', 'it'];
const PLURAL_FORMS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

const isPlural = value => typeof value === 'object' && value !== null
  && Object.keys(value).length > 0 && Object.keys(value).every(key => PLURAL_FORMS.has(key));

function leaves(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = `${prefix}${key}`;
    if (typeof child === 'string') return [[path, child]];
    assert.ok(typeof child === 'object' && child !== null, `${path} must be a string or an object`);
    return leaves(child, `${path}.`);
  });
}

async function loadCatalogs() {
  const catalogs = {};
  for (const locale of LOCALES) {
    catalogs[locale] = {};
    for (const file of readdirSync(join(localesDirectory, locale)).filter(name => name.endsWith('.js')).sort()) {
      const module = await import(pathToFileURL(join(localesDirectory, locale, file)));
      catalogs[locale][file.slice(0, -3)] = module.default;
    }
  }
  return catalogs;
}

function sourceFiles(directory = source) {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === 'locales' ? [] : sourceFiles(path);
    return /\.(jsx?|mjs)$/.test(name) ? [path] : [];
  });
}

const resolve = (catalog, key) => key.split('.').reduce((value, part) => value?.[part], catalog);
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
const catalogs = await loadCatalogs();

test('every locale has the same namespaces, keys, plural forms, and placeholders as English', () => {
  const namespaces = Object.keys(catalogs.en).sort();
  for (const locale of LOCALES.slice(1)) {
    assert.deepEqual(Object.keys(catalogs[locale]).sort(), namespaces, `${locale} namespaces`);
    for (const namespace of namespaces) {
      const english = new Map(leaves(catalogs.en[namespace]));
      const translated = new Map(leaves(catalogs[locale][namespace]));
      const missing = [...english.keys()].filter(key => !translated.has(key));
      const extra = [...translated.keys()].filter(key => !english.has(key));
      assert.deepEqual({ missing, extra }, { missing: [], extra: [] }, `${locale}/${namespace}.js keys`);
      for (const [key, text] of english) {
        // A plural form may leave the count implicit ("il primo link").
        const pluralForm = isPlural(resolve(catalogs.en[namespace], key.split('.').slice(0, -1).join('.')));
        const expected = placeholders(text).filter(name => !pluralForm || name !== 'count');
        const actual = placeholders(translated.get(key)).filter(name => !pluralForm || name !== 'count');
        assert.deepEqual(actual, expected, `${locale} ${namespace}.${key} placeholders`);
      }
    }
  }
});

test('plural messages define at least the one and other forms in every locale', () => {
  const visit = (value, path, locale) => {
    if (isPlural(value)) {
      for (const form of ['one', 'other']) assert.equal(typeof value[form], 'string', `${locale} ${path}.${form}`);
      return;
    }
    if (typeof value === 'object' && value !== null) for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`, locale);
  };
  for (const locale of LOCALES) for (const [namespace, catalog] of Object.entries(catalogs[locale])) visit(catalog, namespace, locale);
});

test('every literal key used in the source exists in the English catalog', () => {
  const literal = /\b(?:t\(|translate\([^,()]+,)\s*['"]([a-z][\w-]*(?:\.[\w-]+)+)['"]/g;
  const prefix = /\b(?:t\(|translate\([^,()]+,)\s*`([a-z][\w-]*(?:\.[\w-]+)*)\.\$\{/g;
  const missing = [];
  for (const file of sourceFiles()) {
    const text = readFileSync(file, 'utf8');
    const where = file.slice(source.length);
    for (const [, key] of text.matchAll(literal)) {
      const message = resolve(catalogs.en, key);
      if (typeof message !== 'string' && !(isPlural(message) && typeof message.other === 'string')) missing.push(`${where}: ${key}`);
    }
    for (const [, key] of text.matchAll(prefix)) {
      const branch = resolve(catalogs.en, key);
      if (typeof branch !== 'object' || branch === null) missing.push(`${where}: ${key}.*`);
    }
  }
  assert.deepEqual(missing, []);
});
