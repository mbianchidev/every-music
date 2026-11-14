import test from 'node:test';
import assert from 'node:assert/strict';
import { composeNotificationEmail, notificationLink } from '../src/engines/notification-email.js';
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
