import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealmConfig } from '../config/realm.js';
import {
  applicantStatus, normalizeApplication, normalizeOwnerNote, retentionEndsAt,
} from '../src/engines/application-rules.js';
import { ApplicationMaintenance } from '../src/engines/application-maintenance.js';

const environment = {
  REALM_ENV: 'test',
  REALM_CONNECTION: 'postgresql://localhost/everymusic',
  CIPHER_PRIMARY_KEY: 'primary-key-that-is-longer-than-thirty-two-characters',
  CIPHER_REFRESH_KEY: 'refresh-key-that-is-longer-than-thirty-two-characters',
};

test('applicants see closed calls as closed but keep their own withdrawal', () => {
  assert.equal(applicantStatus('accepted', false), 'accepted');
  assert.equal(applicantStatus('accepted', true), 'closed');
  assert.equal(applicantStatus('new', true), 'closed');
  assert.equal(applicantStatus('withdrawn', true), 'withdrawn');
});

test('normalizes application input and rejects unsafe or oversized values', () => {
  const upper = '11111111-1111-4111-8111-11111111111A';
  assert.deepEqual(normalizeApplication({
    message: '  Hello there  ', instrumentIds: [upper, upper.toLowerCase()], links: [{ url: 'https://example.test/a' }],
  }), {
    message: 'Hello there', instrumentIds: [upper.toLowerCase()], links: [{ linkType: 'other', url: 'https://example.test/a' }],
  });
  assert.throws(() => normalizeApplication({ message: ' \n ' }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => normalizeApplication({ message: 'x'.repeat(4001) }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => normalizeApplication({ message: 'Hi', links: [{ url: 'javascript:alert(1)' }] }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => normalizeApplication({ message: 'Hi', links: Array(6).fill({ url: 'https://example.test' }) }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => normalizeApplication({ message: 'Hi', instrumentIds: ['not-a-uuid'] }), { code: 'VALIDATION_ERROR' });
});

test('blank owner notes clear the note and omitted notes stay unchanged', () => {
  assert.equal(normalizeOwnerNote(undefined), undefined);
  assert.equal(normalizeOwnerNote('   '), null);
  assert.equal(normalizeOwnerNote(' Call back '), 'Call back');
});

test('retention starts at closure, or now when closure was not recorded yet', () => {
  assert.equal(retentionEndsAt('2026-01-01T00:00:00.000Z', 90), '2026-04-01T00:00:00.000Z');
  assert.equal(retentionEndsAt(null, 1, new Date('2026-01-01T00:00:00.000Z')), '2026-01-02T00:00:00.000Z');
});

test('application retention is configurable within bounds', () => {
  assert.equal(createRealmConfig(environment).applications.retentionDays, 90);
  assert.equal(createRealmConfig({ ...environment, APPLICATION_RETENTION_DAYS: '14' }).applications.retentionDays, 14);
  assert.throws(() => createRealmConfig({ ...environment, APPLICATION_RETENTION_DAYS: '0' }), /APPLICATION_RETENTION_DAYS/);
});

test('maintenance passes the retention period and keeps running after a failed sweep', async () => {
  const calls = [];
  let fail = true;
  const errors = [];
  const maintenance = new ApplicationMaintenance({
    retentionDays: 7,
    logger: { error: (details, message) => errors.push(message) },
    connector: { execute: async (sql, params) => {
      calls.push(params);
      if (fail) { fail = false; throw new Error('synthetic database outage'); }
      return { rowCount: 1 };
    } },
  });
  maintenance.start();
  await maintenance.stop();
  assert.deepEqual(errors, ['Application maintenance failed']);
  assert.deepEqual(await maintenance.sweep(), { closed: 1, reopened: 1, removed: 1 });
  assert.deepEqual(calls.at(-1), [7]);
});
