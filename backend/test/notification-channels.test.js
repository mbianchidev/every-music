import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMAIL_LOCALES, NOTIFICATION_SELECTORS, composeNotificationEmail, composeNotificationPush, notificationLink, notificationTemplates,
} from '../src/engines/notification-email.js';
import { notificationKinds } from '../src/engines/notification-catalog.js';
import { NOTIFIED_STATUSES } from '../src/engines/application-rules.js';
import { defaultChoice, deliverySql, resolveChannel } from '../src/engines/notification-channels.js';
import { NotificationEmailWorker } from '../src/engines/notification-email-worker.js';
import { NotificationJobs } from '../src/engines/notification-jobs.js';

const origin = 'https://app.example.test';

test('notification emails are localized from kind and numeric params only', () => {
  const stats = composeNotificationEmail({
    kind: 'announcement_stats', params: { views: 1234, likes: 5, saves: 0 }, link: '#analytics', locale: 'nl', origin,
  });
  assert.match(stats.subject, /^Je wekelijkse statistieken/);
  assert.ok(stats.text.includes('Weergaven: 1.234'));
  assert.ok(stats.text.includes(`${origin}/#analytics`));
  assert.ok(stats.html.includes(`${origin}/#settings?section=notifications`));

  const injected = composeNotificationEmail({
    kind: 'announcement_stats', params: { views: '<b>secret</b>', likes: 1, saves: 1, title: 'Private title' },
    link: 'javascript:alert(1)', locale: 'fr', origin: `${origin}/`,
  });
  assert.equal(injected.locale, 'en');
  assert.equal(injected.text.includes('secret') || injected.html.includes('secret'), false);
  assert.equal(injected.text.includes('Private title'), false);
  assert.equal(injected.text.includes('Views:'), false, 'incomplete statistics are omitted rather than shown blank');
  assert.ok(injected.text.includes(`${origin}/#notifications`));

  assert.match(composeNotificationEmail({ kind: 'come_back', params: { days: 1 }, link: '#feed', locale: 'it', origin }).text, /più di 1 giorno\./);
  assert.match(composeNotificationEmail({ kind: 'come_back', params: { days: 30 }, link: '#feed', locale: 'en', origin }).text, /more than 30 days\./);
  const unknown = composeNotificationEmail({ kind: 'not_in_this_build', params: {}, link: '#feed', locale: 'en', origin });
  assert.match(unknown.subject, /^You have a new notification/);
});

const placeholders = template => (template && typeof template === 'object' ? [template.count, ...[template.one, template.other]] : [template])
  .flatMap(text => [...String(text ?? '').matchAll(/\{(\w+)\}/g)].map(match => match[1])).sort();

test('every catalog kind has a localized email and push template in every locale', () => {
  for (const locale of EMAIL_LOCALES) {
    const fallback = notificationTemplates[locale].fallback.subject;
    for (const kind of Object.keys(notificationKinds)) {
      const template = notificationTemplates[locale].kinds[kind];
      assert.ok(template, `${locale} email template for ${kind}`);
      for (const key of ['subject', 'body']) {
        assert.deepEqual(placeholders(template[key]), placeholders(notificationTemplates.en.kinds[kind][key]), `${locale} ${kind}.${key}`);
      }
      assert.deepEqual(Object.keys(template.cases ?? {}).sort(), Object.keys(notificationTemplates.en.kinds[kind].cases ?? {}).sort(), `${locale} ${kind} cases`);
      assert.equal(template.lines?.length, notificationTemplates.en.kinds[kind].lines?.length, `${locale} ${kind} lines`);
      const numbers = { views: 2, likes: 2, saves: 2, days: 2, points: 2 };
      const email = composeNotificationEmail({ kind, params: numbers, link: '#feed', locale, origin });
      assert.notEqual(email.subject, `${fallback} | Every.music`, `${locale} ${kind} uses its own subject`);
      assert.notEqual(composeNotificationPush({ kind, params: numbers, locale }).title, fallback, `${locale} ${kind} push title`);
    }
    for (const [kind, names] of Object.entries(NOTIFICATION_SELECTORS)) {
      assert.ok(Object.hasOwn(notificationKinds, kind), `${kind} selector belongs to a catalog kind`);
      assert.ok(names.length && notificationTemplates[locale].kinds[kind].cases, `${locale} ${kind} has cases`);
    }
  }
  assert.ok(NOTIFIED_STATUSES.every(status => Object.hasOwn(notificationTemplates.en.kinds.application_status.cases, status)));
});

test('push text is generic, localized, and picks cases only from enumerated params', () => {
  const accepted = composeNotificationPush({
    kind: 'application_status', params: { status: 'accepted', title: 'Private call title' }, locale: 'it',
  });
  assert.deepEqual(accepted, {
    title: 'La tua candidatura è stata accettata',
    body: 'Chi ha pubblicato un annuncio ha accettato la tua candidatura. Apri Every.music per metterti in contatto.',
    locale: 'it',
  });
  const injected = composeNotificationPush({ kind: 'security_alert', params: { event: 'toString', name: '<b>x</b>' }, locale: 'nl' });
  assert.equal(injected.title, 'Beveiligingsmelding voor je Every.music-account', 'unknown selector values use the generic text');
  const leader = composeNotificationPush({ kind: 'organization_membership', params: { change: 'leader', organizationName: 'Secret band' }, locale: 'en' });
  assert.equal(leader.title, 'You are now the leader of a page');
  assert.equal(JSON.stringify(leader).includes('Secret band'), false);
  assert.match(composeNotificationPush({ kind: 'points_earned', params: { points: 1 }, locale: 'nl' }).body, /^Je hebt 1 punt verdiend\./);
  assert.match(composeNotificationPush({ kind: 'points_earned', params: { points: 12000 }, locale: 'it' }).body, /^Hai guadagnato 12\.000 punti\./);
  assert.equal(composeNotificationPush({ kind: 'points_earned', params: {}, locale: 'en' }).body, 'Open Every.music to see it.');
  assert.equal(composeNotificationPush({ kind: 'band_message', params: { name: 'Synthetic' }, locale: null }).locale, 'en');
  assert.equal(composeNotificationPush({ kind: 'announcement_stats', params: { views: 3, likes: 1, saves: 0 }, locale: 'en' }).body,
    'Here is how your announcements did in the last 7 days. Views: 3, Likes: 1, Saves: 0');
});

test('notification links stay on the configured portal origin', () => {
  assert.equal(notificationLink(origin, '#messages?id=00000000-0000-4000-8000-000000000001'),
    `${origin}/#messages?id=00000000-0000-4000-8000-000000000001`);
  for (const link of ['https://example.test', '#x"><script>', '//evil.example.test', null]) {
    assert.equal(notificationLink(origin, link), `${origin}/#notifications`);
  }
});

test('channel choices follow catalog availability, categories, and user overrides', () => {
  assert.equal(defaultChoice('message', 'email'), false);
  assert.equal(defaultChoice('come_back', 'email'), true);
  assert.equal(defaultChoice('profile_view', 'inApp'), true, 'the profileViews category switch is the opt-in');
  assert.equal(defaultChoice('profile_view', 'push'), false);
  assert.equal(resolveChannel('come_back', 'inApp', true), false, 'off channels cannot be enabled');
  assert.equal(resolveChannel('come_back', 'email', false), false);
  assert.equal(resolveChannel('message', 'email', null), false);
  const sql = deliverySql('invite_friends');
  assert.match(sql.push, /AND FALSE\)$/);
  assert.match(deliverySql('message').gate, /COALESCE\(p\.messages, TRUE\)/);
  assert.throws(() => deliverySql('unknown_kind'), /Unknown notification kind/);
});

test('an unconfigured mailer keeps the email worker idle and logs once', async () => {
  const messages = [];
  const worker = new NotificationEmailWorker({
    origin, mailer: { available: false }, logger: { info: message => messages.push(message) },
    connector: { execute: async () => { throw new Error('should not query'); } },
  });
  assert.equal(await worker.dispatch(), 0);
  assert.equal(await worker.dispatch(), 0);
  assert.deepEqual(messages, ['Notification email is idle because SMTP is not configured']);
});

test('notification jobs start once, keep running after failures, and stop cleanly', async () => {
  const errors = [];
  const jobs = new NotificationJobs({
    config: { boundaries: { portalOrigins: [origin] } },
    logger: { info() {}, error: (_context, message) => errors.push(message) },
    intervalMs: 60000,
  });
  let runs = 0;
  jobs.scheduler.run = async () => { runs += 1; };
  jobs.email.dispatch = async () => { throw new Error('synthetic failure'); };
  jobs.start();
  jobs.start();
  await jobs.stop();
  assert.equal(runs, 1);
  assert.deepEqual(errors, ['Notification email dispatch failed']);
});
