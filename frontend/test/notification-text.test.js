import test from 'node:test';
import assert from 'node:assert/strict';
import { registerCatalog, translate } from '../src/lib/i18n.js';
import english from '../src/locales/en/notifications.js';
import dutch from '../src/locales/nl/notifications.js';
import italian from '../src/locales/it/notifications.js';
import { groupNotificationKinds, notificationKindLabel, notificationText } from '../src/lib/notification-text.js';

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
      for (const key of ['title', 'detail']) {
        const names = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
        assert.deepEqual(names(catalog.kinds[kind][key]), names(messages[key]), `${kind}.${key}`);
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
