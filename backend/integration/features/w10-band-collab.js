import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildNexus } from '../../src/app.js';
import { realmConfig } from '../../config/realm.js';
import { realmConnector } from '../../src/repositories/realm-connector.js';
import { cipherEngine } from '../../src/engines/cipher-engine.js';
import { accountRepository } from '../../src/repositories/account-repository.js';
import { calendarRepository, hashFeedToken } from '../../src/repositories/calendar-repository.js';
import { profileRatingRepository } from '../../src/repositories/review-repository.js';
import {
  createIdentity, generateRecoveryKey, unlockIdentity, encryptGroupMessage, decryptGroupMessage, encryptAttachment, decryptAttachment,
} from '../../../frontend/src/lib/message-crypto.js';

if (realmConfig.environment !== 'test' || !realmConfig.realm.connectionString) {
  throw new Error('Integration tests require REALM_ENV=test and an isolated REALM_CONNECTION');
}

const later = (days, hour = 19) => {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return `${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:00`;
};

test('band collaboration: calendars, feeds, reminders, encrypted band chat, reviews, and anonymous ratings', async (t) => {
  const marker = `w10-${randomUUID()}`;
  const users = [];
  const tokens = [];
  const organizations = [];
  await realmConnector.establish();
  const app = await buildNexus({
    config: { ...realmConfig, boundaries: { ...realmConfig.boundaries, rateThreshold: 10000, portalOrigins: ['https://app.example.test'] } },
    logger: false, backgroundJobs: false,
  });
  t.after(async () => {
    await app.close();
    await realmConnector.execute('DELETE FROM organizations WHERE id = ANY($1::uuid[]) OR created_by = ANY($2::uuid[])', [organizations, users]);
    await realmConnector.execute('DELETE FROM user_reports WHERE reporter_id = ANY($1::uuid[])', [users]);
    await realmConnector.execute('DELETE FROM admin_audit WHERE actor_id = ANY($1::uuid[])', [users]);
    await realmConnector.execute('DELETE FROM notification_job_runs WHERE name = $1', ['profile_rating_publish']);
    await realmConnector.execute('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await realmConnector.disconnect();
  });
  // 0 leader, 1 calendar manager, 2 bandmate without keys, 3 outside artist, 4 stranger, 5 admin, 6 music lover
  for (let i = 0; i < 7; i += 1) {
    const email = `${marker}-${i}@example.test`;
    const { rows } = await realmConnector.execute(
      'INSERT INTO users (email, email_verified, role) VALUES ($1, TRUE, $2) RETURNING id', [email, i === 5 ? 'admin' : 'member'],
    );
    users.push(rows[0].id);
    tokens.push(cipherEngine.createAccessToken(rows[0].id, email));
    await realmConnector.execute('INSERT INTO profiles (user_id, artist_name, account_kind) VALUES ($1, $2, $3)',
      [rows[0].id, `${marker} person ${i}`, i === 6 ? 'music_lover' : 'artist']);
  }
  async function request(path, { actor = 0, method = 'GET', body, headers = {} } = {}) {
    const auth = actor === null ? {} : { authorization: `Bearer ${tokens[actor]}` };
    return app.inject({ method, url: `/realm${path}`, headers: { ...auth, ...headers }, payload: body });
  }
  async function call(path, { status = 200, ...options } = {}) {
    const response = await request(path, options);
    assert.equal(response.statusCode, status, `${options.method || 'GET'} ${path}: ${response.body}`);
    return response.headers['content-type']?.includes('json') ? response.json().data : response;
  }
  async function failure(path, status, code, options = {}) {
    const response = await request(path, options);
    assert.equal(response.statusCode, status, `${options.method || 'GET'} ${path}: ${response.body}`);
    if (code) assert.equal(response.json().error.code, code);
  }
  const notifications = async (actor, kind) => (await call('/notifications?pageSize=100', { actor })).notifications
    .filter(item => !kind || item.kind === kind);
  const place = (await realmConnector.execute("SELECT id FROM places WHERE name = 'Milan' AND country_code = 'IT' LIMIT 1")).rows[0];

  let band;
  await t.test('a band with a calendar manager and a plain member', async () => {
    band = await call('/organizations', { method: 'POST', status: 201, body: { kind: 'band', name: `${marker} Band` } });
    organizations.push(band.id);
    await call(`/organizations/${band.id}/members`, { method: 'POST', status: 201, body: { userId: users[1], permissions: ['manage_calendar'] } });
    await call(`/organizations/${band.id}/members`, { method: 'POST', status: 201, body: { userId: users[2] } });
    await call(`/organizations/${band.id}/invitation`, { actor: 1, method: 'PATCH', body: { response: 'accept' } });
    await call(`/organizations/${band.id}/invitation`, { actor: 2, method: 'PATCH', body: { response: 'accept' } });
  });

  let entry;
  await t.test('calendar managers schedule band entries; members and invitees see them, others do not', async () => {
    const body = {
      organizationId: band.id, kind: 'rehearsal', title: 'Rehearsal; bring cables, picks', startLocal: later(3), endLocal: later(3, 21),
      timeZone: 'Europe/Rome', placeId: place?.id ?? null, address: 'Studio B, Via Example 1', notes: 'Synthetic notes',
      inviteeIds: [users[3]], reminderOffsets: [60],
    };
    await failure('/calendar/entries', 403, 'ORGANIZATION_PERMISSION_REQUIRED', { actor: 2, method: 'POST', body });
    await failure('/calendar/entries', 403, 'ORGANIZATION_PERMISSION_REQUIRED', { actor: 4, method: 'POST', body });
    await failure('/calendar/entries', 400, 'INVALID_TIME_ZONE', { method: 'POST', body: { ...body, timeZone: 'Nowhere/Town' } });
    await failure('/calendar/entries', 400, 'INVALID_TIME', { method: 'POST', body: { ...body, endLocal: body.startLocal } });
    await failure('/calendar/entries', 400, 'VALIDATION_ERROR', { method: 'POST', body: { ...body, reminderOffsets: [7] } });
    entry = await call('/calendar/entries', { method: 'POST', status: 201, body });
    assert.equal(entry.startLocal, body.startLocal);
    assert.equal(entry.timeZone, 'Europe/Rome');
    assert.equal(entry.organization.id, band.id);
    assert.equal(entry.viewer.canManage, true);
    assert.deepEqual(entry.viewer.reminders, [60]);
    if (place) assert.equal(entry.place.id, place.id);
    assert.deepEqual(new Set(entry.participants.map(person => person.userId)), new Set([users[0], users[1], users[2], users[3]]));
    assert.equal(entry.participants.find(person => person.userId === users[3]).invited, true);
    const created = await notifications(2, 'calendar_invite');
    assert.equal(created.length, 1);
    assert.equal(created[0].params.change, 'created');
    assert.equal(created[0].link, `#calendar-entry?id=${entry.id}`);
    assert.equal((await notifications(3, 'calendar_invite'))[0].params.change, 'invited');
    assert.equal((await notifications(0, 'calendar_invite')).length, 0, 'the author is not notified');

    assert.equal((await call(`/calendar/entries/${entry.id}`, { actor: 3 })).viewer.canManage, false);
    await failure(`/calendar/entries/${entry.id}`, 404, 'CALENDAR_ENTRY_NOT_FOUND', { actor: 4 });
    assert.ok((await call('/calendar', { actor: 3 })).entries.some(item => item.id === entry.id));
    assert.ok((await call(`/organizations/${band.id}/calendar`, { actor: 2 })).entries.some(item => item.id === entry.id));
    await failure(`/organizations/${band.id}/calendar`, 403, 'ORGANIZATION_PERMISSION_REQUIRED', { actor: 3 });
    assert.equal((await call('/calendar', { actor: 4 })).entries.length, 0);
  });

  await t.test('only managers edit; changes bump the sequence, move reminders, and notify everyone else', async () => {
    await failure(`/calendar/entries/${entry.id}`, 403, 'CALENDAR_PERMISSION_REQUIRED', { actor: 2, method: 'PATCH', body: { title: 'Nope' } });
    await failure(`/calendar/entries/${entry.id}`, 403, 'CALENDAR_PERMISSION_REQUIRED', { actor: 3, method: 'PATCH', body: { title: 'Nope' } });
    await failure(`/calendar/entries/${entry.id}`, 404, 'CALENDAR_ENTRY_NOT_FOUND', { actor: 4, method: 'PATCH', body: { title: 'Nope' } });
    await failure(`/calendar/entries/${entry.id}`, 400, 'VALIDATION_ERROR', { actor: 1, method: 'PATCH', body: { startLocal: later(4) } });
    const updated = await call(`/calendar/entries/${entry.id}`, { actor: 1, method: 'PATCH', body: {
      startLocal: later(4, 18), endLocal: later(4, 20), timeZone: 'Europe/Rome', notes: '  ',
    } });
    assert.equal(updated.sequence, entry.sequence + 1);
    assert.equal(updated.notes, null);
    const { rows: [reminder] } = await realmConnector.execute(
      'SELECT remind_at FROM calendar_reminders WHERE entry_id = $1 AND user_id = $2', [entry.id, users[0]]);
    assert.equal(new Date(reminder.remind_at).getTime(), new Date(updated.startsAt).getTime() - 60 * 60 * 1000);
    for (const actor of [0, 2, 3]) {
      assert.ok((await notifications(actor, 'calendar_invite')).some(item => item.params.change === 'updated'), `actor ${actor} notified`);
    }
    assert.equal((await notifications(1, 'calendar_invite')).some(item => item.params.change === 'updated'), false);
    const notesOnly = await call(`/calendar/entries/${entry.id}`, { actor: 1, method: 'PATCH', body: { notes: 'Bring water' } });
    assert.equal(notesOnly.sequence, updated.sequence, 'note edits are not significant changes');
    entry = notesOnly;
  });

  await t.test('RSVPs and per-person reminders', async () => {
    const answered = await call(`/calendar/entries/${entry.id}/response`, { actor: 2, method: 'PUT', body: { response: 'yes' } });
    assert.equal(answered.viewer.response, 'yes');
    await call(`/calendar/entries/${entry.id}/response`, { actor: 3, method: 'PUT', body: { response: 'maybe' } });
    await failure(`/calendar/entries/${entry.id}/response`, 404, 'CALENDAR_ENTRY_NOT_FOUND', { actor: 4, method: 'PUT', body: { response: 'yes' } });
    const detail = await call(`/calendar/entries/${entry.id}`, { actor: 2 });
    assert.equal(detail.participants.find(person => person.userId === users[3]).response, 'maybe');
    const reminders = await call(`/calendar/entries/${entry.id}/reminders`, { actor: 2, method: 'PUT', body: { offsets: [1440, 15] } });
    assert.deepEqual(reminders.viewer.reminders, [15, 1440]);
    await failure(`/calendar/entries/${entry.id}/reminders`, 400, 'VALIDATION_ERROR', { actor: 2, method: 'PUT', body: { offsets: [15, 30, 60, 120] } });
    assert.deepEqual((await call(`/calendar/entries/${entry.id}`, { actor: 0 })).viewer.reminders, [60], 'reminders are personal');
  });

  await t.test('due reminders are leased once and skipped for people who lost access', async () => {
    const soon = await call('/calendar/entries', { actor: 3, method: 'POST', status: 201, body: {
      kind: 'meeting', title: 'Synthetic meeting', startLocal: later(1, 10), endLocal: later(1, 11), timeZone: 'UTC',
      inviteeIds: [users[4]], reminderOffsets: [15],
    } });
    await call(`/calendar/entries/${soon.id}/reminders`, { actor: 4, method: 'PUT', body: { offsets: [30] } });
    await call(`/calendar/entries/${soon.id}/reminders`, { actor: 0, method: 'PUT', status: 404, body: { offsets: [30] } });
    await realmConnector.execute("UPDATE calendar_reminders SET remind_at = NOW() - INTERVAL '1 second' WHERE entry_id = ANY($1::uuid[])",
      [[soon.id, entry.id]]);
    const results = await Promise.all([0, 1].map(() => realmConnector.transaction(executor => calendarRepository.dispatchDue(executor))));
    assert.equal(results.reduce((sum, result) => sum + result.leased, 0), 5, 'each due reminder is leased once');
    assert.equal((await notifications(3, 'calendar_reminder')).length, 1);
    const [reminder] = await notifications(4, 'calendar_reminder');
    assert.equal(reminder.params.entryId, soon.id);
    assert.equal(reminder.params.offsetMinutes, 30);
    assert.equal((await realmConnector.transaction(executor => calendarRepository.dispatchDue(executor))).leased, 0);

    await call(`/calendar/entries/${soon.id}/invitees/${users[4]}`, { actor: 4, method: 'DELETE' });
    await failure(`/calendar/entries/${soon.id}`, 404, 'CALENDAR_ENTRY_NOT_FOUND', { actor: 4 });
    assert.equal((await realmConnector.execute('SELECT COUNT(*)::int AS count FROM calendar_reminders WHERE entry_id = $1 AND user_id = $2',
      [soon.id, users[4]])).rows[0].count, 0);
    await call(`/calendar/entries/${soon.id}/invitees`, { actor: 3, method: 'POST', body: { userIds: [users[4]] } });
    await call(`/calendar/entries/${soon.id}/reminders`, { actor: 4, method: 'PUT', body: { offsets: [15] } });
    await realmConnector.execute("UPDATE calendar_reminders SET remind_at = NOW() - INTERVAL '1 second', sent_at = NULL WHERE entry_id = $1 AND user_id = $2",
      [soon.id, users[4]]);
    await call(`/calendar/entries/${soon.id}/invitees/${users[4]}`, { actor: 3, method: 'DELETE' });
    await realmConnector.execute("INSERT INTO calendar_reminders (entry_id, user_id, offset_minutes, remind_at) VALUES ($1, $2, 60, NOW() - INTERVAL '1 second')",
      [soon.id, users[4]]);
    const skipped = await realmConnector.transaction(executor => calendarRepository.dispatchDue(executor));
    assert.deepEqual([skipped.leased, skipped.sent], [1, 0], 'no reminder without access');
    await realmConnector.execute('INSERT INTO blocked_users (user_id, blocked_user_id) VALUES ($1, $2)', [users[4], users[3]]);
    await failure(`/calendar/entries/${soon.id}/invitees`, 400, 'INVALID_INVITEE', { actor: 3, method: 'POST', body: { userIds: [users[4]] } });
    await realmConnector.execute('DELETE FROM blocked_users WHERE user_id = $1', [users[4]]);
  });

  await t.test('single-entry ICS downloads and private, revocable subscription feeds', async () => {
    const download = await call(`/calendar/entries/${entry.id}/ics`, { actor: 2 });
    assert.match(download.headers['content-type'], /^text\/calendar/);
    assert.match(download.headers['content-disposition'], /attachment; filename="every-music-/);
    const unfolded = download.body.replace(/\r\n /g, '');
    assert.match(unfolded, /SUMMARY:Rehearsal\\; bring cables\\, picks\r\n/);
    assert.match(unfolded, new RegExp(`UID:${entry.id}@every\\.music`));
    assert.match(unfolded, /URL:https:\/\/app\.example\.test\/#calendar-entry\?id=/);
    await failure(`/calendar/entries/${entry.id}/ics`, 404, 'CALENDAR_ENTRY_NOT_FOUND', { actor: 4 });

    assert.deepEqual(await call('/calendar/feed', { actor: 2 }), { active: false });
    const first = await call('/calendar/feed', { actor: 2, method: 'POST', status: 201 });
    assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
    const stored = (await realmConnector.execute('SELECT token_hash FROM calendar_feed_tokens WHERE user_id = $1', [users[2]])).rows[0];
    assert.equal(stored.token_hash, hashFeedToken(first.token));
    assert.notEqual(stored.token_hash, first.token);
    const feed = await request(`/calendar/feeds/${first.token}.ics`, { actor: null });
    assert.equal(feed.statusCode, 200);
    assert.match(feed.headers['content-type'], /^text\/calendar/);
    assert.ok(feed.body.includes(`UID:${entry.id}@every.music`));
    assert.equal(feed.body.includes('Synthetic meeting'), false, 'other people\'s private entries stay out');
    assert.ok((await call('/calendar/feed', { actor: 2 })).lastUsedAt);
    await failure(`/calendar/feeds/${'A'.repeat(43)}.ics`, 404, 'CALENDAR_FEED_NOT_FOUND', { actor: null });
    await failure('/calendar/feeds/short.ics', 400, 'VALIDATION_ERROR', { actor: null });
    const second = await call('/calendar/feed', { actor: 2, method: 'POST', status: 201 });
    await failure(`/calendar/feeds/${first.token}.ics`, 404, 'CALENDAR_FEED_NOT_FOUND', { actor: null });
    assert.equal((await request(`/calendar/feeds/${second.token}.ics`, { actor: null })).statusCode, 200);
    await call('/calendar/feed', { actor: 2, method: 'DELETE' });
    await failure(`/calendar/feeds/${second.token}.ics`, 404, 'CALENDAR_FEED_NOT_FOUND', { actor: null });
  });

  await t.test('cancelling and removing entries', async () => {
    const cancelled = await call(`/calendar/entries/${entry.id}`, { method: 'PATCH', body: { status: 'cancelled' } });
    assert.equal(cancelled.status, 'cancelled');
    assert.ok((await notifications(3, 'calendar_invite')).some(item => item.params.change === 'cancelled'));
    const extra = await call('/calendar/entries', { actor: 1, method: 'POST', status: 201, body: {
      organizationId: band.id, kind: 'gig', title: 'Synthetic gig', startLocal: later(10, 21), endLocal: later(10, 23), timeZone: 'Europe/Rome',
    } });
    await failure(`/calendar/entries/${extra.id}`, 403, 'CALENDAR_PERMISSION_REQUIRED', { actor: 2, method: 'DELETE' });
    await call(`/calendar/entries/${extra.id}`, { actor: 1, method: 'DELETE' });
    assert.ok((await notifications(2, 'calendar_invite')).some(item => item.params.change === 'removed' && item.link === '#calendar'));
    await failure(`/calendar/entries/${extra.id}`, 404, 'CALENDAR_ENTRY_NOT_FOUND', { actor: 1 });
  });

  const recovery = {};
  const identities = {};
  async function publishKey(actor) {
    recovery[actor] = generateRecoveryKey();
    const generated = await createIdentity(users[actor], recovery[actor]);
    const record = await call('/encryption/me', { actor, method: 'POST', status: 201, body: generated.publication });
    identities[actor] = { record, unlocked: await unlockIdentity(record, recovery[actor]) };
  }
  const chatOf = actor => call(`/organizations/${band.id}/chat?pageSize=50`, { actor });
  async function compose(actor, chat, { body = 'Synthetic band chat message', attachments = [], recipients } = {}) {
    const keys = recipients ?? chat.chat.members.filter(member => member.key).map(member => member.key);
    return encryptGroupMessage({
      body, organizationId: band.id, clientId: randomUUID(), sender: identities[actor].record, recipients: keys,
      unlocked: identities[actor].unlocked, attachments,
    });
  }

  let firstMessage;
  let attachment;
  let audio;
  await t.test('band chat sends envelopes addressed to every current member key, with encrypted attachments', async () => {
    await publishKey(0);
    await publishKey(1);
    const chat = await chatOf(0);
    assert.deepEqual(chat.chat.members.map(member => [member.userId, member.canReceive]).sort(),
      [[users[0], true], [users[1], true], [users[2], false]].sort());
    await failure(`/organizations/${band.id}/chat`, 403, 'ORGANIZATION_PERMISSION_REQUIRED', { actor: 4 });

    audio = new TextEncoder().encode('synthetic audio sample');
    const sealed = await encryptAttachment(audio);
    const upload = await call('/media/blobs', { method: 'POST', status: 201, body: Buffer.from(sealed.blob), headers: { 'content-type': 'application/octet-stream' } });
    attachment = { id: upload.id, type: 'audio/mpeg', name: 'take.mp3', size: audio.length, digest: sealed.digest, key: sealed.key };
    const missing = await compose(0, chat, { recipients: [identities[0].record] });
    await failure(`/organizations/${band.id}/chat/messages`, 409, 'BAND_CHAT_NO_RECIPIENTS', { method: 'POST', body: missing });
    const request0 = await compose(0, chat, { attachments: [attachment] });
    firstMessage = await call(`/organizations/${band.id}/chat/messages`, { method: 'POST', status: 201, body: request0 });
    assert.deepEqual(firstMessage.attachments, [upload.id]);
    const retry = await call(`/organizations/${band.id}/chat/messages`, { method: 'POST', status: 201, body: request0 });
    assert.equal(retry.id, firstMessage.id, 'retries are idempotent');
    const changed = await compose(0, chat, { body: 'Different text' });
    await failure(`/organizations/${band.id}/chat/messages`, 409, 'MESSAGE_CONFLICT', { method: 'POST', body: { ...changed, clientId: request0.clientId } });
    const reuse = await compose(0, chat, { attachments: [attachment] });
    await failure(`/organizations/${band.id}/chat/messages`, 400, 'INVALID_ATTACHMENT', { method: 'POST', body: reuse });
    await failure(`/organizations/${band.id}/chat/messages`, 400, 'INVALID_ENCRYPTION', { method: 'POST', body: { ...changed, recipientKeyIds: [identities[0].record.id, randomUUID()] } });

    const stored = (await realmConnector.execute('SELECT ciphertext FROM band_chat_messages WHERE id = $1', [firstMessage.id])).rows[0].ciphertext;
    assert.equal(stored.includes('Synthetic band chat'), false, 'the server stores no plaintext');
    for (const actor of [1, 2]) {
      const [notice] = await notifications(actor, 'band_message');
      assert.equal(notice.link, `#organization?id=${band.id}&section=chat`);
      assert.deepEqual(Object.keys(notice.params).sort(), ['name', 'organizationId']);
      assert.equal(JSON.stringify(notice).includes('Synthetic band chat'), false);
    }
    assert.equal((await notifications(0, 'band_message')).length, 0);
  });

  await t.test('members decrypt messages and attachments; access follows current membership', async () => {
    const chat = await chatOf(1);
    assert.equal(chat.chat.unreadCount, 1);
    const [message] = chat.messages;
    const sender = chat.keys.find(key => key.id === message.senderKeyId);
    const result = await decryptGroupMessage({
      message, organizationId: band.id, ownUserId: users[1], ownKeyId: identities[1].record.id, unlocked: identities[1].unlocked, sender,
    });
    assert.equal(result.body, 'Synthetic band chat message');
    const blob = await request(`/media/${attachment.id}`, { actor: 1 });
    assert.equal(blob.statusCode, 200);
    assert.equal(blob.headers['cache-control'], 'private, no-store');
    assert.deepEqual(await decryptAttachment(blob.rawPayload, result.attachments[0]), audio);
    assert.equal((await request(`/media/${attachment.id}`, { actor: 2 })).statusCode, 200, 'keyless members still receive ciphertext');
    assert.equal((await request(`/media/${attachment.id}`, { actor: 4 })).statusCode, 404);

    const second = await compose(0, await chatOf(0), { body: 'A second synthetic message' });
    await call(`/organizations/${band.id}/chat/messages`, { method: 'POST', status: 201, body: second });
    assert.equal((await notifications(1, 'band_message')).length, 1, 'unread notifications are coalesced');
    assert.equal((await chatOf(1)).chat.unreadCount, 2);
    await call(`/organizations/${band.id}/chat`, { actor: 1, method: 'PATCH', body: { read: true } });
    assert.equal((await chatOf(1)).chat.unreadCount, 0);
    assert.ok((await notifications(1, 'band_message')).every(item => item.readAt));
    const third = await compose(0, await chatOf(0), { body: 'A third synthetic message' });
    await call(`/organizations/${band.id}/chat/messages`, { method: 'POST', status: 201, body: third });
    assert.equal((await notifications(1, 'band_message')).length, 2);
    const list = await call('/band-chats', { actor: 1 });
    assert.equal(list.chats.find(item => item.organizationId === band.id).unreadCount, 1);
  });

  await t.test('history stays unreadable to members who join or rejoin later', async () => {
    await call(`/organizations/${band.id}/members`, { method: 'POST', status: 201, body: { userId: users[3] } });
    await call(`/organizations/${band.id}/invitation`, { actor: 3, method: 'PATCH', body: { response: 'accept' } });
    const newcomer = await chatOf(3);
    assert.equal(newcomer.messages.length, 0);
    assert.equal((await request(`/media/${attachment.id}`, { actor: 3 })).statusCode, 404);
    await publishKey(3);
    const stale = await compose(0, newcomer.chat.members.length ? await chatOf(0) : newcomer, {
      recipients: [identities[0].record, identities[1].record],
    });
    await failure(`/organizations/${band.id}/chat/messages`, 409, 'BAND_CHAT_RECIPIENTS_CHANGED', { method: 'POST', body: stale });
    const welcome = await compose(0, await chatOf(0), { body: 'Welcome, synthetic newcomer' });
    await call(`/organizations/${band.id}/chat/messages`, { method: 'POST', status: 201, body: welcome });
    const [visible] = (await chatOf(3)).messages;
    const decrypted = await decryptGroupMessage({
      message: visible, organizationId: band.id, ownUserId: users[3], ownKeyId: identities[3].record.id, unlocked: identities[3].unlocked,
      sender: identities[0].record,
    });
    assert.equal(decrypted.body, 'Welcome, synthetic newcomer');

    await call(`/organizations/${band.id}/members/${users[3]}`, { actor: 3, method: 'DELETE' });
    await failure(`/organizations/${band.id}/chat`, 403, 'ORGANIZATION_PERMISSION_REQUIRED', { actor: 3 });
    await call(`/organizations/${band.id}/members`, { method: 'POST', status: 201, body: { userId: users[3] } });
    await call(`/organizations/${band.id}/invitation`, { actor: 3, method: 'PATCH', body: { response: 'accept' } });
    assert.equal((await chatOf(3)).messages.length, 0, 'rejoining starts a new period');
    await call(`/organizations/${band.id}/members/${users[3]}`, { method: 'DELETE' });
  });

  let reportId;
  await t.test('reported band messages carry verified evidence without attachment keys, and admins can remove them', async () => {
    const chat = await chatOf(1);
    const message = chat.messages.find(item => item.id === firstMessage.id);
    const sender = chat.keys.find(key => key.id === message.senderKeyId);
    const decrypted = await decryptGroupMessage({
      message, organizationId: band.id, ownUserId: users[1], ownKeyId: identities[1].record.id, unlocked: identities[1].unlocked, sender,
    });
    const body = { category: 'harassment', details: 'Synthetic report details', signedEvidence: decrypted.signedEvidence, consent: true };
    await failure(`/organizations/${band.id}/chat/messages/${firstMessage.id}/reports`, 404, 'MESSAGE_NOT_FOUND', { method: 'POST', body });
    const forged = await compose(1, chat, { body: 'Forged' });
    const forgedEvidence = (await decryptGroupMessage({ message: { ...forged, id: randomUUID(), senderId: users[1], recipientKeyIds: forged.recipientKeyIds,
      attachments: [] }, organizationId: band.id, ownUserId: users[1], ownKeyId: identities[1].record.id, unlocked: identities[1].unlocked,
    sender: identities[1].record })).signedEvidence;
    await failure(`/organizations/${band.id}/chat/messages/${firstMessage.id}/reports`, 400, 'INVALID_REPORT_EVIDENCE', {
      actor: 1, method: 'POST', body: { ...body, signedEvidence: forgedEvidence },
    });
    const report = await call(`/organizations/${band.id}/chat/messages/${firstMessage.id}/reports`, { actor: 1, method: 'POST', status: 201, body });
    reportId = report.id;
    await failure(`/organizations/${band.id}/chat/messages/${firstMessage.id}/reports`, 409, 'REPORT_EXISTS', { actor: 1, method: 'POST', body });
    const queue = await call('/admin/reports?status=open&pageSize=50', { actor: 5 });
    assert.equal(queue.reports.find(item => item.id === reportId).hasMessage, true);
    const detail = await call(`/admin/reports/${reportId}`, { actor: 5 });
    assert.equal(detail.evidenceVerified, true);
    assert.match(detail.evidence, /^Synthetic band chat message\n\[1 encrypted attachment\(s\), not disclosed\]$/);
    assert.equal(JSON.stringify(detail).includes(attachment.key), false);
    await call(`/admin/reports/${reportId}`, { actor: 5, method: 'PATCH', body: { action: 'remove_message', note: 'Synthetic moderation note' } });
    const removed = (await chatOf(1)).messages.find(item => item.id === firstMessage.id);
    assert.deepEqual([removed.isDeleted, removed.removedByModeration, removed.ciphertext, removed.attachments], [true, true, null, []]);
    assert.equal((await request(`/media/${attachment.id}`, { actor: 1 })).statusCode, 404);
  });

  await t.test('senders delete their own messages only', async () => {
    const chat = await chatOf(0);
    const own = chat.messages.find(item => !item.isDeleted && item.senderId === users[0]);
    await failure(`/organizations/${band.id}/chat/messages/${own.id}`, 404, 'MESSAGE_NOT_FOUND', { actor: 1, method: 'DELETE' });
    await call(`/organizations/${band.id}/chat/messages/${own.id}`, { method: 'DELETE' });
    assert.equal((await chatOf(1)).messages.find(item => item.id === own.id).isDeleted, true);
  });

  await t.test('reviews need a mutual follow, start pending, and only approved ones count', async () => {
    await failure(`/profiles/${users[0]}/review`, 403, 'REVIEW_REQUIRES_MUTUAL_FOLLOW', { actor: 3, method: 'PUT', body: { stars: 4, body: 'Great synthetic drummer' } });
    await call(`/profiles/${users[0]}/follow`, { actor: 3, method: 'POST' });
    await failure(`/profiles/${users[0]}/review`, 403, 'REVIEW_REQUIRES_MUTUAL_FOLLOW', { actor: 3, method: 'PUT', body: { stars: 4, body: 'Great synthetic drummer' } });
    await call(`/profiles/${users[3]}/follow`, { actor: 0, method: 'POST' });
    assert.equal((await call(`/profiles/${users[0]}/reviews`, { actor: 3 })).canReview, true);
    await failure(`/profiles/${users[0]}/review`, 400, 'VALIDATION_ERROR', { actor: 3, method: 'PUT', body: { stars: 6, body: 'Too many stars' } });
    await failure(`/profiles/${users[0]}/review`, 400, 'VALIDATION_ERROR', { actor: 3, method: 'PUT', body: { stars: 4, body: '   ' } });
    await failure(`/profiles/${users[3]}/review`, 400, 'INVALID_REVIEW', { actor: 3, method: 'PUT', body: { stars: 4, body: 'Me' } });
    await failure(`/profiles/${users[6]}/review`, 404, 'PROFILE_NOT_FOUND', { actor: 3, method: 'PUT', body: { stars: 4, body: 'Lover' } });
    const review = await call(`/profiles/${users[0]}/review`, { actor: 3, method: 'PUT', status: 201, body: { stars: 4, body: 'Great synthetic drummer' } });
    assert.equal(review.status, 'pending');
    const [received] = await notifications(0, 'review_received');
    assert.equal(received.params.reviewId, review.id);
    const outsider = await call(`/profiles/${users[0]}/reviews`, { actor: 4 });
    assert.deepEqual([outsider.summary.count, outsider.reviews.length, outsider.manage, outsider.canReview], [0, 0, null, false]);
    assert.equal((await call(`/profiles/${users[0]}/reviews`, { actor: 3 })).mine.status, 'pending');
    assert.equal((await call(`/profiles/${users[0]}/reviews`)).manage.pending[0].id, review.id);
    await failure(`/reviews/${review.id}`, 404, 'REVIEW_NOT_FOUND', { actor: 3, method: 'PATCH', body: { status: 'approved' } });
    await call(`/reviews/${review.id}`, { method: 'PATCH', body: { status: 'approved' } });
    assert.equal((await notifications(3, 'review_approved')).length, 1);
    const approved = await call(`/profiles/${users[0]}/reviews`, { actor: 4 });
    assert.deepEqual([approved.summary.count, approved.summary.average, approved.reviews[0].body], [1, 4, 'Great synthetic drummer']);
    const edited = await call(`/profiles/${users[0]}/review`, { actor: 3, method: 'PUT', body: { stars: 2, body: 'Changed my synthetic mind' } });
    assert.equal(edited.status, 'pending');
    assert.equal((await call(`/profiles/${users[0]}/reviews`, { actor: 4 })).summary.count, 0, 'edits need approval again');
    assert.equal((await notifications(0, 'review_received')).length, 2);
    await call(`/reviews/${review.id}`, { method: 'PATCH', body: { status: 'hidden' } });
    assert.equal((await call(`/profiles/${users[0]}/reviews`)).manage.hidden.length, 1);
    await call(`/reviews/${review.id}`, { method: 'DELETE' });
    assert.equal((await call(`/profiles/${users[0]}/reviews`, { actor: 3 })).mine, null);
    await call(`/profiles/${users[0]}/review`, { actor: 3, method: 'PUT', status: 201, body: { stars: 5, body: 'Synthetic second try' } });
    await call(`/profiles/${users[0]}/review`, { actor: 3, method: 'DELETE' });
    await failure(`/profiles/${users[0]}/review`, 404, 'REVIEW_NOT_FOUND', { actor: 3, method: 'DELETE' });
  });

  await t.test('ratings are anonymous: published as daily aggregates, hidden below three, visible individually only to the rater', async () => {
    await failure(`/profiles/${users[0]}/rating`, 400, 'INVALID_RATING', { method: 'PUT', body: { stars: 5 } });
    await failure(`/profiles/${users[6]}/rating`, 404, 'PROFILE_NOT_FOUND', { actor: 1, method: 'PUT', body: { stars: 5 } });
    const mine = await call(`/profiles/${users[0]}/rating`, { actor: 1, method: 'PUT', body: { stars: 5 } });
    assert.equal(mine.mine.stars, 5);
    assert.equal(mine.count, 0, 'aggregates wait for the next publication');
    await call(`/profiles/${users[0]}/rating`, { actor: 2, method: 'PUT', body: { stars: 4 } });
    await realmConnector.transaction(executor => profileRatingRepository.publish(executor));
    const two = await call(`/profiles/${users[0]}/rating`, { actor: 4 });
    assert.deepEqual([two.count, two.average, two.mine, two.canRate], [2, null, null, true]);
    await call(`/profiles/${users[0]}/rating`, { actor: 3, method: 'PUT', body: { stars: 2 } });
    await call(`/profiles/${users[0]}/rating`, { actor: 3, method: 'PUT', body: { stars: 3 } });
    await realmConnector.transaction(executor => profileRatingRepository.publish(executor));
    const owner = await call(`/profiles/${users[0]}/rating`);
    assert.deepEqual(Object.keys(owner).sort(), ['average', 'canRate', 'count', 'mine', 'minimumCount', 'publishedAt', 'subjectId']);
    assert.deepEqual([owner.count, owner.average, owner.mine, owner.canRate], [3, 4, null, false]);
    const exported = await call('/account/export');
    assert.deepEqual(Object.keys(exported.profileRatingSummary).sort(), ['average', 'count', 'publishedAt']);
    assert.equal(Number(exported.profileRatingSummary.average), 4);
    assert.deepEqual(exported.profileRatingsGiven, []);
    const raterExport = await call('/account/export', { actor: 1 });
    assert.deepEqual(raterExport.profileRatingsGiven.map(item => [item.subjectId, item.stars]), [[users[0], 5]]);
    await call(`/profiles/${users[0]}/rating`, { actor: 3, method: 'DELETE' });
    await failure(`/profiles/${users[0]}/rating`, 404, 'RATING_NOT_FOUND', { actor: 3, method: 'DELETE' });
    assert.equal((await call(`/profiles/${users[0]}/rating`, { actor: 4 })).count, 3, 'removal is published in the next batch');
    await realmConnector.transaction(executor => profileRatingRepository.publish(executor));
    const afterRemoval = await call(`/profiles/${users[0]}/rating`, { actor: 4 });
    assert.deepEqual([afterRemoval.count, afterRemoval.average], [2, null]);
  });

  await t.test('exports and account deletion cover calendar, chat, review, and rating rows', async () => {
    const personal = await call('/calendar/entries', { actor: 4, method: 'POST', status: 201, body: {
      kind: 'other', title: 'Synthetic personal entry', startLocal: later(5), endLocal: later(5, 20), timeZone: 'UTC', reminderOffsets: [60],
    } });
    const bandEntry = await call('/calendar/entries', { actor: 1, method: 'POST', status: 201, body: {
      organizationId: band.id, kind: 'recording', title: 'Synthetic session', startLocal: later(6), endLocal: later(6, 22), timeZone: 'UTC',
    } });
    await call('/calendar/feed', { actor: 4, method: 'POST', status: 201 });
    const sections = await call('/account/export', { actor: 4 });
    assert.equal(sections.calendarEntriesOwned[0].title, 'Synthetic personal entry');
    assert.ok(sections.calendarReminders.some(item => item.entryId === personal.id && item.offsetMinutes === 60));
    assert.ok(sections.calendarFeed.createdAt);
    assert.equal(JSON.stringify(sections.calendarFeed).includes('token'), false);
    const memberSections = await call('/account/export', { actor: 1 });
    assert.ok(memberSections.bandChatMemberships.length >= 1);
    assert.equal(JSON.stringify(memberSections.bandChatMessagesSent ?? []).includes('ciphertext'), false);
    assert.ok(memberSections.bandCalendarEntriesCreated.some(item => item.id === bandEntry.id));

    await accountRepository.deleteAccount(users[4]);
    assert.equal((await realmConnector.execute('SELECT COUNT(*)::int AS count FROM calendar_entries WHERE id = $1', [personal.id])).rows[0].count, 0);
    assert.equal((await realmConnector.execute('SELECT COUNT(*)::int AS count FROM calendar_feed_tokens WHERE user_id = $1', [users[4]])).rows[0].count, 0);
    await accountRepository.deleteAccount(users[1]);
    const kept = (await realmConnector.execute('SELECT created_by FROM calendar_entries WHERE id = $1', [bandEntry.id])).rows[0];
    assert.equal(kept.created_by, null, 'band entries stay with the band');
    for (const [table, column] of [['band_chat_messages', 'sender_id'], ['band_chat_members', 'user_id'], ['profile_ratings', 'rater_id'],
      ['profile_reviews', 'author_id'], ['calendar_participants', 'user_id'], ['calendar_reminders', 'user_id']]) {
      const { rows } = await realmConnector.execute(`SELECT COUNT(*)::int AS count FROM ${table} WHERE ${column} = $1`, [users[1]]);
      assert.equal(rows[0].count, 0, `${table} rows removed`);
    }
    assert.equal((await realmConnector.execute('SELECT COUNT(*)::int AS count FROM user_reports WHERE id = $1', [reportId])).rows[0].count, 0);
    const remaining = await chatOf(0);
    assert.deepEqual(remaining.chat.members.map(member => member.userId).sort(), [users[0], users[2]].sort());
  });
});
