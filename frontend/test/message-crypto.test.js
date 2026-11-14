import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  createIdentity, generateRecoveryKey, unlockIdentity, encryptMessage, decryptMessage, verifyIdentity, verifyMessageEvidence,
} from '../src/lib/message-crypto.js';

test('only the intended participants decrypt a signed message and its backup remains encrypted', async () => {
  const identities = await Promise.all([0, 1, 2].map(async () => {
    const userId = randomUUID();
    const recovery = generateRecoveryKey();
    const created = await createIdentity(userId, recovery);
    const record = { id: randomUUID(), userId, fingerprint: created.fingerprint, ...created.publication };
    return { record, recovery, unlocked: await unlockIdentity(record, recovery) };
  }));
  const [sender, recipient, outsider] = identities;
  const conversationId = randomUUID();
  const message = await encryptMessage({
    body: 'A synthetic private rehearsal message.', conversationId, clientId: randomUUID(),
    sender: sender.record, recipient: recipient.record, unlocked: sender.unlocked,
  });
  assert.equal(JSON.stringify(message).includes('synthetic private'), false);
  const context = { message, conversationId, sender: sender.record, recipient: recipient.record };
  const received = await decryptMessage({ ...context, ownUserId: recipient.record.userId, unlocked: recipient.unlocked });
  assert.equal(received.body, 'A synthetic private rehearsal message.');
  assert.equal((await decryptMessage({ ...context, ownUserId: sender.record.userId, unlocked: sender.unlocked })).body, received.body);
  await assert.rejects(decryptMessage({ ...context, ownUserId: outsider.record.userId, unlocked: outsider.unlocked }));
  await assert.rejects(unlockIdentity(recipient.record, generateRecoveryKey()), { code: 'UNLOCK_FAILED' });
  const restored = await unlockIdentity(recipient.record, recipient.recovery);
  assert.equal((await decryptMessage({ ...context, ownUserId: recipient.record.userId, unlocked: restored })).body, received.body);
  assert.equal(await verifyMessageEvidence(received.signedEvidence, context), received.body);
  await assert.rejects(verifyMessageEvidence(received.signedEvidence, { ...context, conversationId: randomUUID() }));
  await assert.rejects(verifyMessageEvidence(received.signedEvidence, { ...context, message: { ...message, clientId: randomUUID() } }));
  const changed = JSON.parse(message.ciphertext);
  const index = Math.floor(changed.ciphertext.length / 2);
  changed.ciphertext = `${changed.ciphertext.slice(0, index)}${changed.ciphertext[index] === 'A' ? 'B' : 'A'}${changed.ciphertext.slice(index + 1)}`;
  await assert.rejects(decryptMessage({ ...context, message: { ...message, ciphertext: JSON.stringify(changed) }, ownUserId: recipient.record.userId, unlocked: restored }), { code: 'DECRYPTION_FAILED' });
  await assert.rejects(verifyIdentity({ ...recipient.record, encryptionKey: outsider.record.encryptionKey }), { code: 'INVALID_IDENTITY' });
});
