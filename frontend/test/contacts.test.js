import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { contactPickerAvailable, extractEmails, hashEmails, pickContactEmails } from '../src/lib/contacts.js';

test('pasted contacts are extracted, normalized, and deduplicated', () => {
  assert.deepEqual(extractEmails('Demo <Demo.Person@Example.TEST>, demo.person@example.test;\nsecond@example.test not-an-address @nobody'), [
    'demo.person@example.test', 'second@example.test',
  ]);
  assert.deepEqual(extractEmails(''), []);
});

test('contacts are hashed with SHA-256 of the normalized address before leaving the browser', async () => {
  const [hash] = await hashEmails([' Demo.Person@Example.TEST '], webcrypto.subtle);
  assert.equal(hash, createHash('sha256').update('demo.person@example.test').digest('hex'));
  await assert.rejects(hashEmails(['a@example.test'], null), /cannot hash/);
});

test('the contact picker is optional and only email addresses are requested', async () => {
  assert.equal(contactPickerAvailable({}), false);
  const requests = [];
  const navigatorObject = { contacts: { select: async (...args) => { requests.push(args); return [{ email: ['A@Example.test', 'a@example.test'] }, { email: [] }, {}]; } } };
  assert.equal(contactPickerAvailable(navigatorObject), true);
  assert.deepEqual(await pickContactEmails(navigatorObject), ['a@example.test']);
  assert.deepEqual(requests, [[['email'], { multiple: true }]]);
});
