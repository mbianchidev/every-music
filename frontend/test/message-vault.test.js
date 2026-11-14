import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Nucleus } from '../src/lib/nucleus.js';
import { MessageVault } from '../src/lib/message-vault.js';
import { createIdentity, generateRecoveryKey } from '../src/lib/message-crypto.js';

const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const signIn = (session, userId) => session.login({ userId }, { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh' });
async function identity(userId) {
  const recovery = generateRecoveryKey();
  const generated = await createIdentity(userId, recovery);
  return { record: { id: randomUUID(), userId, fingerprint: generated.fingerprint, ...generated.publication }, recovery };
}

test('sign-out clears unlocked keys and a pending unlock cannot cross accounts', async () => {
  const session = new Nucleus({ storage: storage() });
  const userId = randomUUID();
  signIn(session, userId);
  const key = await identity(userId);
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let hold = false;
  const vault = new MessageVault({ session, storage, transport: { transmit: async () => hold ? pending : key.record } });
  try {
    await vault.unlock(key.record.id, key.recovery);
    assert.deepEqual(vault.snapshot().unlockedIds, [key.record.id]);
    session.logout();
    assert.deepEqual(vault.snapshot().unlockedIds, []);
    signIn(session, userId);
    hold = true;
    const unlocking = vault.unlock(key.record.id, key.recovery);
    signIn(session, randomUUID());
    release(key.record);
    await assert.rejects(unlocking, { code: 'SESSION_CHANGED' });
    assert.deepEqual(vault.snapshot().unlockedIds, []);
  } finally { vault.dispose(); }
});

test('changed peer keys fail closed until explicit verification, preserving trusted history', async () => {
  const session = new Nucleus({ storage: storage() });
  signIn(session, randomUUID());
  const pins = storage();
  const peerId = randomUUID();
  const [old, next] = await Promise.all([identity(peerId), identity(peerId)]);
  const vault = new MessageVault({ session, storage: () => pins, transport: {} });
  try {
    const conversation = randomUUID();
    assert.equal(await vault.checkPeer(old.record, peerId, conversation), false);
    await assert.rejects(vault.checkPeer(next.record, peerId, conversation), { code: 'FINGERPRINT_CHANGED' });
    await assert.rejects(vault.checkPeer(old.record, randomUUID(), conversation), { code: 'INVALID_IDENTITY' });
    await vault.verifyPeer(next.record, peerId, conversation);
    assert.equal(await vault.checkPeer(next.record, peerId, conversation), true);
    assert.equal(await vault.checkPeer(old.record, peerId, conversation), false);
    const stranger = await identity(randomUUID());
    await assert.rejects(vault.checkPeer(stranger.record, stranger.record.userId, conversation), { code: 'CONVERSATION_IDENTITY_CHANGED' });
  } finally { vault.dispose(); }
});
