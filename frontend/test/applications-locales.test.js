import test from 'node:test';
import assert from 'node:assert/strict';
import en from '../src/locales/en/applications.js';
import nl from '../src/locales/nl/applications.js';
import it from '../src/locales/it/applications.js';

const keys = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) => (
  typeof child === 'object' ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`]
)).sort();

test('application translations cover every English key with matching placeholders', () => {
  const english = keys(en);
  for (const [locale, catalog] of Object.entries({ nl, it })) {
    assert.deepEqual(keys(catalog), english, `${locale} keys`);
    for (const key of english) {
      const read = source => key.split('.').reduce((value, part) => value[part], source);
      const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
      assert.deepEqual(placeholders(read(catalog)), placeholders(read(en)), `${locale} ${key} placeholders`);
    }
  }
});
