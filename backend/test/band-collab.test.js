import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { GeneralEncrypt, SignJWT, calculateJwkThumbprint, exportJWK, generateKeyPair } from 'jose';
import { isTimeZone, localToUtc, utcToLocal } from '../src/engines/calendar-time.js';
import { buildCalendar, escapeText, foldLine, formatUtc } from '../src/engines/ics.js';
import { validateGroupEnvelope, verifyReportedGroupMessage } from '../src/engines/message-security.js';
import { createBandCollabConfig } from '../config/band-collab.js';
import { calendarInput } from '../src/conductors/band-collab-conductor.js';
import { resolveTimes } from '../src/repositories/calendar-repository.js';

test('local times convert through IANA zones, including daylight saving edges', () => {
  assert.equal(localToUtc('2026-07-10T19:30', 'Europe/Rome').toISOString(), '2026-07-10T17:30:00.000Z');
  assert.equal(localToUtc('2026-12-10T19:30', 'Europe/Rome').toISOString(), '2026-12-10T18:30:00.000Z');
  assert.equal(localToUtc('2026-01-05T09:00', 'Asia/Kolkata').toISOString(), '2026-01-05T03:30:00.000Z');
  assert.equal(localToUtc('2026-06-01T00:00', 'Pacific/Chatham').toISOString(), '2026-05-31T11:15:00.000Z');
  assert.equal(localToUtc('2026-03-01T12:00', 'UTC').toISOString(), '2026-03-01T12:00:00.000Z');
  assert.equal(localToUtc('2026-03-08T02:30', 'America/New_York'), null, 'skipped hour does not exist');
  assert.equal(localToUtc('2026-11-01T01:30', 'America/New_York').toISOString(), '2026-11-01T05:30:00.000Z', 'repeated hour takes the first');
  assert.equal(localToUtc('2026-02-30T10:00', 'Europe/Rome'), null);
  assert.equal(localToUtc('2026-02-10 10:00', 'Europe/Rome'), null);
  assert.equal(localToUtc('2026-02-10T10:00', 'Mars/Olympus'), null);
  assert.equal(utcToLocal('2026-07-10T17:30:00Z', 'Europe/Rome'), '2026-07-10T19:30');
  assert.equal(utcToLocal('2026-11-01T06:30:00Z', 'America/New_York'), '2026-11-01T01:30');
  assert.equal(isTimeZone('Europe/Amsterdam'), true);
  assert.equal(isTimeZone('../etc/passwd'), false);
  assert.equal(isTimeZone(''), false);
});

test('entry times are validated and calendar input keeps the time fields together', () => {
  const times = resolveTimes({ startLocal: '2026-05-01T20:00', endLocal: '2026-05-02T01:00', timeZone: 'Europe/Amsterdam' });
  assert.equal(times.startsAt.toISOString(), '2026-05-01T18:00:00.000Z');
  assert.throws(() => resolveTimes({ startLocal: '2026-05-01T20:00', endLocal: '2026-05-01T19:00', timeZone: 'UTC' }), { code: 'INVALID_TIME' });
  assert.throws(() => resolveTimes({ startLocal: '2026-05-01T20:00', endLocal: '2026-05-20T19:00', timeZone: 'UTC' }), { code: 'INVALID_TIME' });
  assert.throws(() => resolveTimes({ startLocal: '2026-05-01T20:00', endLocal: '2026-05-01T21:00', timeZone: 'Nowhere/Here' }), { code: 'INVALID_TIME_ZONE' });
  assert.throws(() => calendarInput({ startLocal: '2026-05-01T20:00' }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => calendarInput({ title: '   ' }), { code: 'VALIDATION_ERROR' });
  assert.deepEqual(calendarInput({ notes: '  ', address: ' Hall 3 ', title: ' Rehearsal ' }), { notes: null, address: 'Hall 3', title: 'Rehearsal' });
  const created = calendarInput({ organizationId: 'ABCDEF00-0000-4000-8000-000000000000', kind: 'gig', title: 'Gig' }, { creating: true });
  assert.equal(created.organizationId, 'abcdef00-0000-4000-8000-000000000000');
  assert.deepEqual(created.inviteeIds, []);
});

test('ICS text is escaped, folded on UTF-8 boundaries, and uses CRLF', () => {
  assert.equal(escapeText('a\\b;c,d\ne\r\nf\u0007'), 'a\\\\b\\;c\\,d\\ne\\nf');
  const long = `SUMMARY:${'é'.repeat(60)}`;
  const folded = foldLine(long);
  const parts = folded.split('\r\n');
  assert.ok(parts.length > 1);
  for (const part of parts) assert.ok(Buffer.byteLength(part, 'utf8') <= 75);
  assert.ok(parts.slice(1).every(part => part.startsWith(' ')));
  assert.equal(parts.map((part, index) => (index ? part.slice(1) : part)).join(''), long);
  assert.equal(formatUtc('2026-07-10T17:30:00.000Z'), '20260710T173000Z');
  const body = buildCalendar([{
    id: '2b5f1f9e-3d3a-4c7a-9a52-0f6f1e1d2c3b', kind: 'rehearsal', title: 'Rehearsal; bring cables, picks', status: 'scheduled',
    sequence: 2, startsAt: new Date('2026-07-10T17:30:00Z'), endsAt: new Date('2026-07-10T19:30:00Z'), timeZone: 'Europe/Rome',
    place: { label: 'Milan, Lombardy, Italy', latitude: 45.46427, longitude: 9.18951 }, address: 'Via Example 1',
    notes: 'Line one\nLine two', organization: { name: 'The Synthetic Band' },
    createdAt: new Date('2026-07-01T10:00:00Z'), updatedAt: new Date('2026-07-02T10:00:00Z'),
  }, { id: '8a5f1f9e-3d3a-4c7a-9a52-0f6f1e1d2c3b', kind: 'gig', title: 'Cancelled gig', status: 'cancelled', sequence: 0,
    startsAt: new Date('2026-08-10T20:00:00Z'), endsAt: new Date('2026-08-10T22:00:00Z'), timeZone: 'UTC', place: null, address: null,
    notes: null, organization: null, createdAt: new Date('2026-07-01T10:00:00Z'), updatedAt: new Date('2026-07-01T10:00:00Z') }],
  { name: 'Band, calendar', origin: 'https://app.example.test/' });
  assert.ok(body.endsWith('\r\n'));
  assert.equal(body.split('\r\n').filter(line => line && !line.startsWith(' ')).some(line => line.includes('\n')), false);
  const unfolded = body.replace(/\r\n /g, '');
  assert.match(unfolded, /\r\nX-WR-CALNAME:Band\\, calendar\r\n/);
  assert.match(unfolded, /\r\nSUMMARY:Rehearsal\\; bring cables\\, picks\r\n/);
  assert.match(unfolded, /\r\nDTSTART:20260710T173000Z\r\nDTEND:20260710T193000Z\r\n/);
  assert.match(unfolded, /\r\nDESCRIPTION:Line one\\nLine two\\nBand: The Synthetic Band\\nType: Rehearsal\\nTime zone: Europe\/Rome\\nDetails: https:\/\/app\.example\.test\/#calendar-entry\?id=2b5f1f9e/);
  assert.match(unfolded, /\r\nLOCATION:Milan\\, Lombardy\\, Italy - Via Example 1\r\nGEO:45\.464270;9\.189510\r\n/);
  assert.match(unfolded, /\r\nSEQUENCE:2\r\n/);
  assert.match(unfolded, /\r\nSTATUS:CANCELLED\r\n/);
  assert.equal((unfolded.match(/BEGIN:VEVENT/g) || []).length, 2);
});

async function identity() {
  const signing = await generateKeyPair('ES256', { extractable: true });
  const encryption = await generateKeyPair('ECDH-ES+A256KW', { crv: 'P-256', extractable: true });
  const signingKey = await exportJWK(signing.publicKey);
  return { id: randomUUID(), signing, encryption, signingKey, fingerprint: await calculateJwkThumbprint(signingKey) };
}

test('group envelopes must address exactly the expected keys and reports verify the signed record', async () => {
  const members = await Promise.all([identity(), identity(), identity()]);
  const keyIds = members.map(member => member.id);
  const organizationId = randomUUID();
  const senderId = randomUUID();
  const clientId = randomUUID();
  const attachmentId = randomUUID();
  const signed = await new SignJWT({
    version: 1, body: 'Synthetic band update', senderKeyId: members[0].id, senderFingerprint: members[0].fingerprint,
    recipients: [...keyIds].sort(), attachments: [{ id: attachmentId, type: 'image/png', name: 'set.png', size: 10, digest: 'x' }],
  }).setProtectedHeader({ alg: 'ES256', typ: 'everymusic.group-message.v1+jwt' }).setIssuer(senderId)
    .setAudience('everymusic.band-chat').setSubject(organizationId).setJti(clientId).setIssuedAt().sign(members[0].signing.privateKey);
  const envelope = new GeneralEncrypt(new TextEncoder().encode(JSON.stringify({ jwt: signed, keys: {} })))
    .setProtectedHeader({ enc: 'A256GCM', typ: 'everymusic.group-message.v1+jwe' });
  for (const member of members) envelope.addRecipient(member.encryption.publicKey).setUnprotectedHeader({ alg: 'ECDH-ES+A256KW', kid: member.id });
  const ciphertext = JSON.stringify(await envelope.encrypt());
  assert.equal(JSON.parse(await validateGroupEnvelope(ciphertext, members[0].id, keyIds)).recipients.length, 3);
  await assert.rejects(validateGroupEnvelope(ciphertext, members[0].id, keyIds.slice(0, 2)), { code: 'INVALID_ENCRYPTION' });
  await assert.rejects(validateGroupEnvelope(ciphertext, randomUUID(), keyIds), { code: 'INVALID_ENCRYPTION' });
  await assert.rejects(validateGroupEnvelope(ciphertext, members[0].id, [keyIds[0], keyIds[1], randomUUID()]), { code: 'INVALID_ENCRYPTION' });
  const direct = JSON.parse(ciphertext);
  direct.protected = Buffer.from(JSON.stringify({ enc: 'A256GCM', typ: 'everymusic.message.v1+jwe' })).toString('base64url');
  await assert.rejects(validateGroupEnvelope(JSON.stringify(direct), members[0].id, keyIds), { code: 'INVALID_ENCRYPTION' });
  await assert.rejects(validateGroupEnvelope('{"protected":1}', members[0].id, keyIds), { code: 'INVALID_ENCRYPTION' });

  const message = {
    sender_id: senderId, organization_id: organizationId, client_id: clientId, sender_key_id: members[0].id, recipient_key_ids: keyIds,
  };
  const sender = { id: members[0].id, signing_key: members[0].signingKey, fingerprint: members[0].fingerprint };
  assert.deepEqual(await verifyReportedGroupMessage(signed, message, sender, [attachmentId]), { body: 'Synthetic band update', attachments: 1 });
  assert.deepEqual(await verifyReportedGroupMessage(signed, message, sender, null), { body: 'Synthetic band update', attachments: 1 });
  await assert.rejects(verifyReportedGroupMessage(signed, message, sender, []), { code: 'INVALID_REPORT_EVIDENCE' });
  await assert.rejects(verifyReportedGroupMessage(signed, { ...message, client_id: randomUUID() }, sender, null), { code: 'INVALID_REPORT_EVIDENCE' });
  await assert.rejects(verifyReportedGroupMessage(signed, { ...message, organization_id: randomUUID() }, sender, null), { code: 'INVALID_REPORT_EVIDENCE' });
  await assert.rejects(verifyReportedGroupMessage(signed, { ...message, recipient_key_ids: keyIds.slice(1) }, sender, null), { code: 'INVALID_REPORT_EVIDENCE' });
  const other = { id: members[1].id, signing_key: members[1].signingKey, fingerprint: members[1].fingerprint };
  await assert.rejects(verifyReportedGroupMessage(signed, { ...message, sender_key_id: other.id }, other, null), { code: 'INVALID_REPORT_EVIDENCE' });
});

test('the calendar reminder interval is bounded', () => {
  assert.equal(createBandCollabConfig({}).calendar.reminderIntervalSeconds, 60);
  assert.equal(createBandCollabConfig({ CALENDAR_REMINDER_INTERVAL_SECONDS: '15' }).calendar.reminderIntervalSeconds, 15);
  assert.throws(() => createBandCollabConfig({ CALENDAR_REMINDER_INTERVAL_SECONDS: '5' }), /CALENDAR_REMINDER_INTERVAL_SECONDS/);
  assert.throws(() => createBandCollabConfig({ CALENDAR_REMINDER_INTERVAL_SECONDS: 'soon' }), /CALENDAR_REMINDER_INTERVAL_SECONDS/);
});
