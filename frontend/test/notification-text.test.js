import test from 'node:test';
import assert from 'node:assert/strict';
import { registerCatalog, translate } from '../src/lib/i18n.js';
import english from '../src/locales/en/notifications.js';
import dutch from '../src/locales/nl/notifications.js';
import italian from '../src/locales/it/notifications.js';
import { groupNotificationKinds, notificationKindLabel, notificationText } from '../src/lib/notification-text.js';
import { notificationKinds } from '../../backend/src/engines/notification-catalog.js';

registerCatalog('en', 'notifications', english);
registerCatalog('nl', 'notifications', dutch);
registerCatalog('it', 'notifications', italian);
const i18n = locale => ({
  t: (key, params) => translate(locale, key, params),
  formatNumber: value => new Intl.NumberFormat(locale).format(value),
});

const shape = value => (value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item)]))
  : typeof value);

test('every locale translates the same notification keys and placeholders', () => {
  for (const catalog of [dutch, italian]) {
    assert.deepEqual(shape(catalog), shape(english));
    for (const [kind, messages] of Object.entries(english.kinds)) {
      const names = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
      for (const key of ['title', 'detail']) {
        assert.deepEqual(names(catalog.kinds[kind][key]), names(messages[key]), `${kind}.${key}`);
      }
      for (const [value, title] of Object.entries(messages.cases ?? {})) {
        assert.deepEqual(names(catalog.kinds[kind].cases[value]), names(title), `${kind}.cases.${value}`);
      }
    }
  }
});

test('notifications render localized text from kind and params with a title fallback', () => {
  const stats = notificationText(i18n('it'), {
    kind: 'announcement_stats', title: 'Weekly statistics', params: { views: 12000, likes: 3, saves: 1 },
  });
  assert.equal(stats.title, 'Le statistiche settimanali dei tuoi annunci');
  assert.equal(stats.detail, 'Ultimi 7 giorni: 12.000 visualizzazioni, 3 mi piace, 1 salvataggi.');
  const follower = notificationText(i18n('en'), { kind: 'new_follower', title: 'You have a new follower', params: {} });
  assert.deepEqual(follower, { title: 'You have a new follower', detail: '' }, 'details need every parameter');
  assert.deepEqual(notificationText(i18n('nl'), { kind: 'from_a_newer_server', title: 'Server title', params: { name: 'x' } }),
    { title: 'Server title', detail: '' });
  assert.equal(notificationText(i18n('en'), { kind: 'announcement', title: 'x', params: { title: 'Synthetic call' } }).detail, 'Synthetic call');
});

test('preference kinds are grouped and unknown kinds stay visible', () => {
  const groups = groupNotificationKinds(['message', 'events', 'brand_new_kind', 'comment'].map(kind => ({ kind })));
  assert.deepEqual(groups.map(group => [group.group, group.kinds.map(item => item.kind)]), [
    ['messages', ['message']], ['activity', ['comment']], ['community', ['events']], ['other', ['brand_new_kind']],
  ]);
  assert.equal(notificationKindLabel(i18n('en').t, 'brand_new_kind'), 'Brand new kind');
  assert.equal(notificationKindLabel(i18n('nl').t, 'come_back'), 'Herinnering na een lange pauze');
});

test('every server notification kind has client text, a preference label, and a group in every locale', () => {
  for (const kind of Object.keys(notificationKinds)) {
    for (const [locale, catalog] of [['en', english], ['nl', dutch], ['it', italian]]) {
      const messages = catalog.kinds[kind];
      assert.ok(messages, `${locale} notifications.kinds.${kind}`);
      assert.ok(messages.label?.trim(), `${locale} ${kind} preference label`);
      assert.ok(messages.title?.trim(), `${locale} ${kind} title`);
      assert.equal(typeof messages.detail, 'string', `${locale} ${kind} detail`);
    }
    assert.notEqual(groupNotificationKinds([{ kind }])[0].group, 'other', `${kind} belongs to a preference group`);
  }
});

test('enumerated params pick a localized title and incomplete params fall back', () => {
  assert.equal(notificationText(i18n('it'), {
    kind: 'application_status', title: 'Your application was accepted', params: { status: 'accepted', title: 'Synthetic call' },
  }).title, 'La tua candidatura è stata accettata');
  assert.equal(notificationText(i18n('nl'), {
    kind: 'organization_membership', title: 'x', params: { change: 'leader', organizationName: 'Synthetic band' },
  }).title, 'Je bent nu de leider van Synthetic band');
  assert.equal(notificationText(i18n('en'), {
    kind: 'organization_membership', title: 'x', params: { response: 'accepted', name: null, organizationName: 'Synthetic band' },
  }).title, 'Your membership of Synthetic band changed', 'a case missing a param uses the generic localized title');
  assert.equal(notificationText(i18n('en'), {
    kind: 'security_alert', title: 'Server title', params: { event: 'hasOwnProperty' },
  }).title, 'Security alert for your account');
  assert.equal(notificationText(i18n('en'), {
    kind: 'organization_claim', title: 'Server title', params: { outcome: 'approved' },
  }).title, 'Server title');
  assert.equal(notificationKindLabel(i18n('it').t, 'security_alert'), 'Avvisi di sicurezza');
});
