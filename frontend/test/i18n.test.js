import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLocale, registerCatalog, translate } from '../src/lib/i18n.js';

registerCatalog('en', 'sample', {
  greeting: 'Hello {name}',
  only: 'English only',
  songs: { one: '{count} song', other: '{count} songs' },
});
registerCatalog('it', 'sample', { greeting: 'Ciao {name}', songs: { one: '{count} brano', other: '{count} brani' } });

test('interpolates parameters and selects plural forms per locale', () => {
  assert.equal(translate('it', 'sample.greeting', { name: 'Ada' }), 'Ciao Ada');
  assert.equal(translate('en', 'sample.songs', { count: 1 }), '1 song');
  assert.equal(translate('it', 'sample.songs', { count: 3 }), '3 brani');
});

test('falls back to English, then to the visible key', () => {
  assert.equal(translate('it', 'sample.only'), 'English only');
  assert.equal(translate('nl', 'sample.missing'), 'sample.missing');
  assert.equal(translate('en', 'sample.greeting'), 'Hello {name}');
});

test('detects a stored or browser locale and defaults to English', () => {
  assert.equal(detectLocale('nl', ['it-IT']), 'nl');
  assert.equal(detectLocale(null, ['fr-FR', 'it-IT']), 'it');
  assert.equal(detectLocale('xx', ['fr-FR']), 'en');
});
