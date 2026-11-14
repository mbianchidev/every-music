import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, detectPlatform, versionStatus } from '../src/lib/app-version.js';
import { cardPosition, localTourStatus, rememberTour, resolveTarget, shouldStartTour, TOUR_STEPS } from '../src/lib/tour.js';
import { backFallback, goBack } from '../src/lib/back-navigation.js';
import enHelp from '../src/locales/en/help.js';
import nlHelp from '../src/locales/nl/help.js';
import itHelp from '../src/locales/it/help.js';
import enLegal from '../src/locales/en/legal.js';
import nlLegal from '../src/locales/nl/legal.js';
import itLegal from '../src/locales/it/legal.js';
import enOnboarding from '../src/locales/en/onboarding.js';
import nlOnboarding from '../src/locales/nl/onboarding.js';
import itOnboarding from '../src/locales/it/onboarding.js';

const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
};

test('client versions decide between current, available, and required updates', () => {
  assert.equal(compareVersions('1.10.0', '1.9.3'), 1);
  assert.equal(compareVersions('1.2.0', '1.2.0-rc.1'), 0);
  assert.equal(versionStatus(null, '1.0.0'), 'unknown');
  assert.equal(versionStatus({ minimumClientVersion: null, latestClientVersion: null }, '1.0.0'), 'current');
  assert.equal(versionStatus({ minimumClientVersion: '1.0.0', latestClientVersion: '1.2.0' }, '1.1.0'), 'available');
  assert.equal(versionStatus({ minimumClientVersion: '1.1.0', latestClientVersion: '1.2.0' }, '1.0.9'), 'required');
  assert.equal(versionStatus({ minimumClientVersion: null, latestClientVersion: '1.2.0' }, '1.3.0'), 'current');
});

test('platform detection separates native shells, installed web apps, and browsers', () => {
  const scope = (agent, extra = {}) => ({ navigator: { userAgent: agent }, matchMedia: () => ({ matches: false }), ...extra });
  assert.equal(detectPlatform(scope('Mozilla/5.0 (Linux; Android 15)', { __TAURI_INTERNALS__: {} })), 'android');
  assert.equal(detectPlatform(scope('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', { __TAURI_INTERNALS__: {} })), 'ios');
  assert.equal(detectPlatform(scope('Mozilla/5.0 (Macintosh)', { __TAURI_INTERNALS__: {} })), 'desktop');
  assert.equal(detectPlatform({ ...scope('Mozilla/5.0'), matchMedia: () => ({ matches: true }) }), 'pwa');
  assert.equal(detectPlatform(scope('Mozilla/5.0')), 'web');
});

test('the tour starts only for pending accounts and remembers completion locally', () => {
  assert.equal(shouldStartTour('pending', null), true);
  assert.equal(shouldStartTour('pending', 'completed'), false, 'a local record prevents a repeat when saving failed');
  assert.equal(shouldStartTour(null, null), false);
  assert.equal(shouldStartTour('skipped', null), false);
  const storage = memoryStorage();
  assert.equal(localTourStatus('user-1', storage), null);
  assert.equal(rememberTour('user-1', 'skipped', storage), true);
  assert.equal(localTourStatus('user-1', storage), 'skipped');
  assert.equal(rememberTour('user-1', 'started', storage), false);
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(localTourStatus('user-1', broken), null);
    assert.equal(rememberTour('user-1', 'completed', broken), false);
  } finally { console.warn = warn; }
});

test('tour targets fall back to the next visible element', () => {
  const element = (visible, insideClosedDialog = false) => ({
    isConnected: true, getClientRects: () => (visible ? [{}] : []), closest: () => (insideClosedDialog ? {} : null),
  });
  const more = element(true);
  const root = { querySelectorAll: selector => ({
    '.desktop-nav a[href="#settings"]': [element(false)],
    '.mobile-nav a[href="#settings"]': [],
    '.mobile-nav [aria-controls="workspace-navigation"]': [more],
  })[selector] ?? [] };
  assert.equal(resolveTarget(TOUR_STEPS.find(step => step.id === 'settings'), root), more);
  assert.equal(resolveTarget({ targets: ['.missing'] }, root), null);
  assert.deepEqual(TOUR_STEPS.map(step => step.id), ['feed', 'musicians', 'post', 'messages', 'profile', 'settings', 'help']);
});

test('tour cards sit beside sidebar targets, above bottom navigation, and inside the viewport', () => {
  const viewport = { width: 1280, height: 800 };
  const sidebar = { top: 200, left: 20, width: 190, height: 44, right: 210, bottom: 244 };
  assert.deepEqual(cardPosition(sidebar, { width: 360, height: 200 }, viewport), { top: 122, left: 222, width: 360 });
  const phone = { width: 320, height: 640 };
  const bottom = { top: 580, left: 70, width: 60, height: 52, right: 130, bottom: 632 };
  const placed = cardPosition(bottom, { width: 360, height: 220 }, phone);
  assert.equal(placed.width, 304);
  assert.equal(placed.left, 8);
  assert.equal(placed.top, 580 - 12 - 220);
  assert.deepEqual(cardPosition(null, { width: 360, height: 200 }, phone), { top: 220, left: 8, width: 304 });
});

test('back navigation uses in-app history and otherwise a sensible fallback', () => {
  const route = (name, query = '') => ({ name, query: new URLSearchParams(query) });
  assert.equal(backFallback(route('announcement', 'id=1'), true), '#feed');
  assert.equal(backFallback(route('musician', 'id=1'), true), '#musicians');
  assert.equal(backFallback(route('edit-announcement', 'id=1'), true), '#my-posts');
  assert.equal(backFallback(route('legal', 'page=terms'), false), '#help');
  assert.equal(backFallback(route('help'), false), '#login');
  assert.equal(backFallback(route('help', 'view=bug'), true), '#help');
  assert.equal(backFallback(route('feed'), true), null);
  const scope = (previous, canGoBack = true) => {
    const calls = [];
    return {
      calls,
      location: { origin: 'https://every.example', hash: '#musician?id=1' },
      history: { back: () => calls.push('back') },
      navigation: { canGoBack, currentEntry: { index: 1 }, entries: () => [{ url: previous }, {}] },
    };
  };
  const inApp = scope('https://every.example/#musicians');
  assert.equal(goBack('#musicians', inApp), 'history');
  assert.deepEqual(inApp.calls, ['back']);
  const fromSignIn = scope('https://every.example/#login');
  assert.equal(goBack('#musicians', fromSignIn), 'fallback');
  assert.equal(fromSignIn.location.hash, '#musicians');
  const external = scope('https://elsewhere.example/#feed');
  assert.equal(goBack('#feed', external), 'fallback');
  const legacy = { location: { origin: 'https://every.example', hash: '' }, history: {} };
  assert.equal(goBack('#help', legacy), 'fallback');
  assert.equal(legacy.location.hash, '#help');
});

function keys(value, prefix = '') {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key)).sort();
}

test('help, legal, and onboarding catalogs are complete in Dutch and Italian', () => {
  for (const [name, en, nl, it] of [['help', enHelp, nlHelp, itHelp], ['legal', enLegal, nlLegal, itLegal], ['onboarding', enOnboarding, nlOnboarding, itOnboarding]]) {
    assert.deepEqual(keys(nl), keys(en), `nl/${name}`);
    assert.deepEqual(keys(it), keys(en), `it/${name}`);
  }
  const placeholders = text => [...String(text).matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort().join();
  const pairs = (en, other) => keys(en).map(key => [key, key.split('.').reduce((node, part) => node[part], en), key.split('.').reduce((node, part) => node[part], other)]);
  for (const [en, other] of [[enLegal, nlLegal], [enLegal, itLegal], [enHelp, nlHelp], [enHelp, itHelp], [enOnboarding, nlOnboarding], [enOnboarding, itOnboarding]]) {
    for (const [key, source, translation] of pairs(en, other)) assert.equal(placeholders(translation), placeholders(source), key);
  }
});
