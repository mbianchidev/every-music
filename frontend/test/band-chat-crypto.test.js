import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  createIdentity, generateRecoveryKey, unlockIdentity, encryptGroupMessage, decryptGroupMessage, verifyGroupMessageEvidence,
  encryptAttachment, decryptAttachment, attachmentName,
} from '../src/lib/message-crypto.js';

async function member() {
  const userId = randomUUID();
  const recovery = generateRecoveryKey();
  const created = await createIdentity(userId, recovery);
  const record = { id: randomUUID(), userId, fingerprint: created.fingerprint, ...created.publication };
  return { record, unlocked: await unlockIdentity(record, recovery) };
}

test('band chat messages decrypt only for the addressed member keys and carry signed attachments', async () => {
  const [sender, bandmate, outsider] = await Promise.all([member(), member(), member()]);
  const organizationId = randomUUID();
  const audio = new TextEncoder().encode('synthetic audio bytes');
  const sealed = await encryptAttachment(audio);
  assert.equal(Buffer.from(sealed.blob).includes(Buffer.from('synthetic audio')), false);
  const attachment = { id: randomUUID(), type: 'audio/mpeg', name: attachmentName('demo/take 1.mp3'), size: audio.length, digest: sealed.digest, key: sealed.key };
  assert.equal(attachment.name, 'demo_take 1.mp3');
  const request = await encryptGroupMessage({
    body: 'Synthetic rehearsal notes', organizationId, clientId: randomUUID(), sender: sender.record,
    recipients: [sender.record, bandmate.record], unlocked: sender.unlocked, attachments: [attachment],
  });
  assert.equal(request.ciphertext.includes('Synthetic rehearsal'), false);
  assert.equal(request.ciphertext.includes(sealed.key), false);
  assert.deepEqual(request.recipientKeyIds, [sender.record.id, bandmate.record.id].sort());
  const message = {
    clientId: request.clientId, senderId: sender.record.userId, senderKeyId: request.senderKeyId,
    recipientKeyIds: request.recipientKeyIds, attachments: request.attachmentIds, ciphertext: request.ciphertext,
  };
  const context = { message, organizationId, sender: sender.record };
  const received = await decryptGroupMessage({ ...context, ownUserId: bandmate.record.userId, ownKeyId: bandmate.record.id, unlocked: bandmate.unlocked });
  assert.equal(received.body, 'Synthetic rehearsal notes');
  assert.equal(received.attachments[0].key, sealed.key);
  assert.deepEqual(new Uint8Array(await decryptAttachment(sealed.blob, received.attachments[0])), audio);
  const own = await decryptGroupMessage({ ...context, ownUserId: sender.record.userId, ownKeyId: sender.record.id, unlocked: sender.unlocked });
  assert.equal(own.body, received.body);
  await assert.rejects(decryptGroupMessage({ ...context, ownUserId: outsider.record.userId, ownKeyId: outsider.record.id, unlocked: outsider.unlocked }), { code: 'NOT_A_RECIPIENT' });
  await assert.rejects(decryptGroupMessage({ ...context, ownUserId: bandmate.record.userId, ownKeyId: bandmate.record.id, unlocked: null }), { code: 'KEY_LOCKED' });

  const evidence = await verifyGroupMessageEvidence(received.signedEvidence, context);
  assert.equal(evidence.body, received.body);
  assert.equal(received.signedEvidence.includes(sealed.key), false, 'report evidence never carries attachment keys');
  await assert.rejects(verifyGroupMessageEvidence(received.signedEvidence, { ...context, organizationId: randomUUID() }));
  await assert.rejects(verifyGroupMessageEvidence(received.signedEvidence, { ...context, message: { ...message, attachments: [] } }));
  await assert.rejects(decryptGroupMessage({ ...context, message: { ...message, recipientKeyIds: [...message.recipientKeyIds, outsider.record.id] },
    ownUserId: bandmate.record.userId, ownKeyId: bandmate.record.id, unlocked: bandmate.unlocked }), { code: 'DECRYPTION_FAILED' });
  const changed = JSON.parse(request.ciphertext);
  const index = Math.floor(changed.ciphertext.length / 2);
  changed.ciphertext = `${changed.ciphertext.slice(0, index)}${changed.ciphertext[index] === 'A' ? 'B' : 'A'}${changed.ciphertext.slice(index + 1)}`;
  await assert.rejects(decryptGroupMessage({ ...context, message: { ...message, ciphertext: JSON.stringify(changed) },
    ownUserId: bandmate.record.userId, ownKeyId: bandmate.record.id, unlocked: bandmate.unlocked }), { code: 'DECRYPTION_FAILED' });

  const tampered = new Uint8Array(sealed.blob);
  tampered[20] ^= 1;
  await assert.rejects(decryptAttachment(tampered, received.attachments[0]), { code: 'ATTACHMENT_INVALID' });
  await assert.rejects(decryptAttachment(sealed.blob, { ...received.attachments[0], key: (await encryptAttachment(audio)).key }), { code: 'ATTACHMENT_INVALID' });
});

test('band chat encryption refuses incomplete recipients and empty or oversized content', async () => {
  const [sender, bandmate] = await Promise.all([member(), member()]);
  const base = { organizationId: randomUUID(), clientId: randomUUID(), sender: sender.record, unlocked: sender.unlocked };
  await assert.rejects(encryptGroupMessage({ ...base, body: 'Hi', recipients: [bandmate.record] }), { code: 'INVALID_MESSAGE' });
  await assert.rejects(encryptGroupMessage({ ...base, body: '   ', recipients: [sender.record, bandmate.record] }), { code: 'INVALID_MESSAGE' });
  await assert.rejects(encryptGroupMessage({ ...base, body: 'x'.repeat(4001), recipients: [sender.record] }), { code: 'INVALID_MESSAGE' });
  await assert.rejects(encryptGroupMessage({ ...base, body: 'Hi', recipients: [sender.record], attachments: [{
    id: randomUUID(), type: 'image/svg+xml', name: 'x.svg', size: 1, digest: 'a'.repeat(43), key: 'b'.repeat(43),
  }] }), { code: 'INVALID_MESSAGE' });
  await assert.rejects(encryptGroupMessage({ ...base, unlocked: bandmate.unlocked, body: 'Hi', recipients: [sender.record] }), { code: 'KEY_LOCKED' });
  const attachmentOnly = await encryptGroupMessage({ ...base, body: '', recipients: [sender.record], attachments: [{
    id: randomUUID(), type: 'image/png', name: 'set.png', size: 3, digest: 'a'.repeat(43), key: 'b'.repeat(43),
  }] });
  assert.equal(attachmentOnly.attachmentIds.length, 1);
});
