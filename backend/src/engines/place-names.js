// Shared by the GeoNames generator, the seed loader and place search so that
// stored search names and user queries are folded identically.
export function foldPlaceName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[æ]/g, 'ae')
    .replace(/[œ]/g, 'oe')
    .replace(/[ø]/g, 'o')
    .replace(/[đð]/g, 'd')
    .replace(/[ł]/g, 'l')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const LATIN_NAME = /^[\p{Script=Latin}\p{M}\s'\u2019.\-()]+$/u;

// Alternate names worth searching: capitalized Latin-script exonyms such as
// "Milano" or "Den Haag", not lowercase transliterations or airport codes.
export function searchableAlternate(name) {
  return Boolean(name) && name.length <= 60 && LATIN_NAME.test(name)
    && /^[\p{Lu}'\u2019]/u.test(name) && !/^[A-Z]{2,4}$/.test(name);
}

export function searchNames(name, asciiName, alternates = []) {
  const names = [];
  for (const candidate of [name, asciiName, ...alternates.filter(searchableAlternate)]) {
    const folded = foldPlaceName(candidate);
    if (folded.length > 1 && !names.includes(folded)) names.push(folded);
  }
  return names;
}

export const PLACE_SEED_COLUMNS = [
  'id', 'name', 'country_code', 'country_name', 'region_code', 'region_name',
  'latitude', 'longitude', 'population', 'search_names',
];
