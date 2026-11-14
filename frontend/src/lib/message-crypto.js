import {
  CompactEncrypt, GeneralEncrypt, SignJWT, base64url, calculateJwkThumbprint,
  compactDecrypt, exportJWK, generalDecrypt, generateKeyPair, importJWK, jwtVerify,
} from 'jose';

const audience = 'everymusic.messaging';
const identityType = 'everymusic.identity.v1+jwt';
const messageType = 'everymusic.message.v1+jwt';
const envelopeType = 'everymusic.message.v1+jwe';
const backupType = 'everymusic.key-backup.v1+jwe';
const keyAlgorithm = 'ECDH-ES+A256KW';
const backupAlgorithm = 'PBES2-HS512+A256KW';
const iterations = 600000;
const encode = value => new TextEncoder().encode(value);
const decode = value => new TextDecoder('utf-8', { fatal: true }).decode(value);
const failure = (code, message) => Object.assign(new Error(message), { code });
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function generateRecoveryKey() {
  if (!globalThis.crypto?.subtle) throw failure('CRYPTO_UNAVAILABLE', 'Encrypted messaging requires a secure browser context. Use HTTPS or the native app.');
  return base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
}

function publicJwk(key) {
  if (!key || key.kty !== 'EC' || key.crv !== 'P-256' || typeof key.x !== 'string' || typeof key.y !== 'string' || key.d) {
    throw failure('INVALID_IDENTITY', 'The messaging identity is invalid.');
  }
  return { kty: key.kty, crv: key.crv, x: key.x, y: key.y };
}

export async function verifyIdentity(record) {
  try {
    if (!record || !uuid(record.id) || !uuid(record.userId)) throw new Error('Missing identity context');
    const signingKey = publicJwk(record.signingKey);
    const encryptionKey = publicJwk(record.encryptionKey);
    const fingerprint = await calculateJwkThumbprint(signingKey);
    if (fingerprint !== record.fingerprint) throw new Error('Fingerprint mismatch');
    const signingPublic = await importJWK(signingKey, 'ES256');
    const proof = await jwtVerify(record.identityProof, signingPublic, {
      algorithms: ['ES256'], typ: identityType, issuer: record.userId, audience, subject: 'identity',
      requiredClaims: ['version', 'encryption'],
    });
    if (proof.payload.version !== 1 || proof.payload.encryption !== await calculateJwkThumbprint(encryptionKey)) {
      throw new Error('Encryption key is not bound to signing key');
    }
    return { signingPublic, encryptionPublic: await importJWK(encryptionKey, keyAlgorithm) };
  } catch {
    throw failure('INVALID_IDENTITY', 'These messaging keys could not be verified. Do not send until the fingerprint is checked.');
  }
}

export async function createIdentity(userId, recoveryKey) {
  if (!uuid(userId)) throw failure('INVALID_IDENTITY', 'Sign in to a valid account before creating messaging keys.');
  if (!/^[A-Za-z0-9_-]{43}$/.test(recoveryKey)) throw failure('INVALID_RECOVERY_KEY', 'Use the generated 43-character recovery key.');
  const [signing, encryption] = await Promise.all([
    generateKeyPair('ES256', { extractable: true }),
    generateKeyPair(keyAlgorithm, { crv: 'P-256', extractable: true }),
  ]);
  const signingKey = publicJwk(await exportJWK(signing.publicKey));
  const encryptionKey = publicJwk(await exportJWK(encryption.publicKey));
  const identityProof = await new SignJWT({ version: 1, encryption: await calculateJwkThumbprint(encryptionKey) })
    .setProtectedHeader({ alg: 'ES256', typ: identityType }).setIssuer(userId).setAudience(audience).setSubject('identity')
    .sign(signing.privateKey);
  const secret = {
    version: 1, userId,
    signing: await exportJWK(signing.privateKey), encryption: await exportJWK(encryption.privateKey),
  };
  const encryptedPrivateKey = await new CompactEncrypt(encode(JSON.stringify(secret)))
    .setProtectedHeader({ alg: backupAlgorithm, enc: 'A256GCM', typ: backupType })
    .setKeyManagementParameters({ p2c: iterations, p2s: crypto.getRandomValues(new Uint8Array(16)) })
    .encrypt(encode(recoveryKey));
  return {
    publication: { signingKey, encryptionKey, identityProof, encryptedPrivateKey },
    fingerprint: await calculateJwkThumbprint(signingKey),
  };
}

export async function unlockIdentity(record, recoveryKey) {
  await verifyIdentity(record);
  try {
    const result = await compactDecrypt(record.encryptedPrivateKey, encode(recoveryKey.trim()), {
      keyManagementAlgorithms: [backupAlgorithm], contentEncryptionAlgorithms: ['A256GCM'],
      maxPBES2Count: iterations, maxDecompressedLength: 0,
    });
    if (result.protectedHeader.typ !== backupType || result.protectedHeader.p2c !== iterations) throw new Error('Unexpected backup profile');
    const secret = JSON.parse(decode(result.plaintext));
    if (secret.version !== 1 || secret.userId !== record.userId
      || await calculateJwkThumbprint(publicJwk({ ...secret.signing, d: undefined })) !== record.fingerprint
      || await calculateJwkThumbprint(publicJwk({ ...secret.encryption, d: undefined })) !== await calculateJwkThumbprint(record.encryptionKey)) {
      throw new Error('Backup does not match public identity');
    }
    return {
      record,
      signingPrivate: await importJWK(secret.signing, 'ES256'),
      encryptionPrivate: await importJWK(secret.encryption, keyAlgorithm),
    };
  } catch {
    throw failure('UNLOCK_FAILED', 'This recovery key cannot unlock the selected messaging key. Check your saved key, including its letter case.');
  }
}

function validateBody(body) {
  if (typeof body !== 'string' || !body.trim() || body.length > 4000) {
    throw failure('INVALID_MESSAGE', 'Messages need 1-4,000 characters.');
  }
}

export async function encryptMessage({ body, conversationId, clientId, sender, recipient, unlocked }) {
  validateBody(body);
  if (!uuid(conversationId) || !uuid(clientId)) throw failure('INVALID_MESSAGE', 'A valid conversation and retry identifier are required.');
  if (unlocked.record.id !== sender.id || unlocked.record.userId !== sender.userId) {
    throw failure('KEY_LOCKED', 'Unlock your current messaging key before sending.');
  }
  const [senderPublic, recipientPublic] = await Promise.all([verifyIdentity(sender), verifyIdentity(recipient)]);
  const signed = await new SignJWT({
    version: 1, body: body.trim(), senderKeyId: sender.id, recipientKeyId: recipient.id,
    senderFingerprint: sender.fingerprint, recipientFingerprint: recipient.fingerprint,
  }).setProtectedHeader({ alg: 'ES256', typ: messageType })
    .setIssuer(sender.userId).setAudience(recipient.userId).setSubject(conversationId).setJti(clientId).setIssuedAt()
    .sign(unlocked.signingPrivate);
  const encrypted = new GeneralEncrypt(encode(signed)).setProtectedHeader({ enc: 'A256GCM', typ: envelopeType });
  encrypted.addRecipient(senderPublic.encryptionPublic).setUnprotectedHeader({ alg: keyAlgorithm, kid: sender.id });
  encrypted.addRecipient(recipientPublic.encryptionPublic).setUnprotectedHeader({ alg: keyAlgorithm, kid: recipient.id });
  return { clientId, senderKeyId: sender.id, recipientKeyId: recipient.id, ciphertext: JSON.stringify(await encrypted.encrypt()) };
}

export async function verifyMessageEvidence(signed, { message, conversationId, sender, recipient }) {
  if (!uuid(conversationId) || !uuid(message.clientId)) throw failure('INVALID_MESSAGE', 'The message conversation context is missing or invalid.');
  const { signingPublic } = await verifyIdentity(sender);
  await verifyIdentity(recipient);
  const { payload } = await jwtVerify(signed, signingPublic, {
    algorithms: ['ES256'], typ: messageType, issuer: sender.userId, audience: recipient.userId, subject: conversationId,
    requiredClaims: ['jti', 'version', 'body', 'senderKeyId', 'recipientKeyId', 'senderFingerprint', 'recipientFingerprint'],
  });
  if (payload.version !== 1 || payload.jti !== message.clientId
    || (message.senderId && message.senderId !== sender.userId)
    || payload.senderKeyId !== message.senderKeyId || payload.recipientKeyId !== message.recipientKeyId
    || payload.senderFingerprint !== sender.fingerprint || payload.recipientFingerprint !== recipient.fingerprint) {
    throw failure('INVALID_MESSAGE', 'This message does not match its signed conversation context.');
  }
  validateBody(payload.body);
  return payload.body;
}

export async function decryptMessage({ message, conversationId, ownUserId, unlocked, sender, recipient }) {
  const ownKeyId = ownUserId === sender.userId ? message.senderKeyId : message.recipientKeyId;
  if (!unlocked || unlocked.record.id !== ownKeyId || unlocked.record.userId !== ownUserId) {
    throw failure('KEY_LOCKED', 'Unlock the messaging key used for this message.');
  }
  try {
    const encrypted = JSON.parse(message.ciphertext);
    if (encrypted.recipients?.length !== 2 || !encrypted.recipients.some(item => item.header?.kid === ownKeyId)) throw new Error('Recipient mismatch');
    const { plaintext, protectedHeader } = await generalDecrypt(encrypted, unlocked.encryptionPrivate, {
      keyManagementAlgorithms: [keyAlgorithm], contentEncryptionAlgorithms: ['A256GCM'], maxDecompressedLength: 0,
    });
    if (protectedHeader.typ !== envelopeType) throw new Error('Unexpected message profile');
    const signedEvidence = decode(plaintext);
    const body = await verifyMessageEvidence(signedEvidence, { message, conversationId, sender, recipient });
    return { body, signedEvidence };
  } catch {
    throw failure('DECRYPTION_FAILED', 'This message could not be decrypted and verified. Check the messaging fingerprints; no unverified text is shown.');
  }
}

// Band group chat. Each message has a fresh content key wrapped for every
// current member key (General JSON JWE, ECDH-ES+A256KW). Inside is a
// sender-signed JWT naming the chat, the exact recipient keys and attachment
// fingerprints, plus the attachment keys, which stay outside the signature so
// a reported message never discloses them.
const groupAudience = 'everymusic.band-chat';
const groupMessageType = 'everymusic.group-message.v1+jwt';
const groupEnvelopeType = 'everymusic.group-message.v1+jwe';
export const GROUP_MESSAGE_LIMITS = { recipients: 100, attachments: 4, body: 4000, name: 255 };
export const ATTACHMENT_TYPES = {
  'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'image/gif': 'image',
  'audio/mpeg': 'audio', 'audio/mp4': 'audio', 'audio/x-m4a': 'audio', 'audio/aac': 'audio', 'audio/ogg': 'audio',
  'audio/wav': 'audio', 'audio/x-wav': 'audio', 'audio/wave': 'audio', 'audio/webm': 'audio', 'audio/flac': 'audio', 'audio/x-flac': 'audio',
};
const attachmentKey = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

function sameIds(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const expected = [...right].sort();
  return [...left].sort().every((value, index) => value === expected[index]);
}

function attachmentMeta(item) {
  if (!item || !uuid(item.id) || !Object.hasOwn(ATTACHMENT_TYPES, item.type) || typeof item.name !== 'string'
    || !item.name || item.name.length > GROUP_MESSAGE_LIMITS.name || /[\\/\u0000-\u001f\u007f]/.test(item.name)
    || !Number.isSafeInteger(item.size) || item.size < 0 || !attachmentKey(item.digest)) {
    throw failure('INVALID_MESSAGE', 'An attachment description is invalid.');
  }
  return { id: item.id, type: item.type, name: item.name, size: item.size, digest: item.digest };
}

function validateGroupBody(body, attachments) {
  if (typeof body !== 'string' || body.length > GROUP_MESSAGE_LIMITS.body || (!body.trim() && !attachments.length)) {
    throw failure('INVALID_MESSAGE', 'Messages need up to 4,000 characters or an attachment.');
  }
}

export function attachmentName(name) {
  const clean = String(name ?? '').replace(/[\\/\u0000-\u001f\u007f]/g, '_').trim().slice(-GROUP_MESSAGE_LIMITS.name);
  return clean || 'attachment';
}

export async function encryptAttachment(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  const blob = new Uint8Array(iv.length + sealed.length);
  blob.set(iv);
  blob.set(sealed, iv.length);
  const digest = base64url.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', blob)));
  return { blob, key: base64url.encode(raw), digest };
}

export async function decryptAttachment(bytes, { key, digest }) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const actual = base64url.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
  if (data.length < 28 || actual !== digest || !attachmentKey(key)) {
    throw failure('ATTACHMENT_INVALID', 'This attachment does not match the file the sender signed.');
  }
  try {
    const cryptoKey = await crypto.subtle.importKey('raw', base64url.decode(key), 'AES-GCM', false, ['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, cryptoKey, data.slice(12)));
  } catch {
    throw failure('ATTACHMENT_INVALID', 'This attachment could not be decrypted.');
  }
}

export async function encryptGroupMessage({ body = '', organizationId, clientId, sender, recipients, unlocked, attachments = [] }) {
  if (!uuid(organizationId) || !uuid(clientId)) throw failure('INVALID_MESSAGE', 'A valid band chat and retry identifier are required.');
  if (!unlocked || unlocked.record.id !== sender.id || unlocked.record.userId !== sender.userId) {
    throw failure('KEY_LOCKED', 'Unlock your current messaging key before sending.');
  }
  if (attachments.length > GROUP_MESSAGE_LIMITS.attachments) throw failure('INVALID_MESSAGE', 'Attach up to four files.');
  const meta = attachments.map(attachmentMeta);
  if (attachments.some(item => !attachmentKey(item.key)) || new Set(meta.map(item => item.id)).size !== meta.length) {
    throw failure('INVALID_MESSAGE', 'An attachment key is missing.');
  }
  validateGroupBody(body, meta);
  const ids = recipients.map(recipient => recipient.id).sort();
  if (new Set(ids).size !== ids.length || !ids.includes(sender.id) || ids.length > GROUP_MESSAGE_LIMITS.recipients) {
    throw failure('INVALID_MESSAGE', 'The band chat recipients are invalid.');
  }
  const verified = await Promise.all(recipients.map(recipient => verifyIdentity(recipient)));
  const signed = await new SignJWT({
    version: 1, body: body.trim(), senderKeyId: sender.id, senderFingerprint: sender.fingerprint, recipients: ids, attachments: meta,
  }).setProtectedHeader({ alg: 'ES256', typ: groupMessageType })
    .setIssuer(sender.userId).setAudience(groupAudience).setSubject(organizationId).setJti(clientId).setIssuedAt()
    .sign(unlocked.signingPrivate);
  const content = { version: 1, jwt: signed, keys: Object.fromEntries(attachments.map(item => [item.id, item.key])) };
  const encrypted = new GeneralEncrypt(encode(JSON.stringify(content))).setProtectedHeader({ enc: 'A256GCM', typ: groupEnvelopeType });
  recipients.forEach((recipient, index) => {
    encrypted.addRecipient(verified[index].encryptionPublic).setUnprotectedHeader({ alg: keyAlgorithm, kid: recipient.id });
  });
  return {
    clientId, senderKeyId: sender.id, recipientKeyIds: ids, attachmentIds: meta.map(item => item.id),
    ciphertext: JSON.stringify(await encrypted.encrypt()),
  };
}

export async function verifyGroupMessageEvidence(signed, { message, organizationId, sender }) {
  if (!uuid(organizationId) || !uuid(message.clientId)) throw failure('INVALID_MESSAGE', 'The band chat context is missing or invalid.');
  const { signingPublic } = await verifyIdentity(sender);
  const { payload } = await jwtVerify(signed, signingPublic, {
    algorithms: ['ES256'], typ: groupMessageType, issuer: sender.userId, audience: groupAudience, subject: organizationId,
    requiredClaims: ['jti', 'version', 'body', 'senderKeyId', 'senderFingerprint', 'recipients', 'attachments'],
  });
  if (payload.version !== 1 || payload.jti !== message.clientId
    || (message.senderId && message.senderId !== sender.userId)
    || payload.senderKeyId !== message.senderKeyId || payload.senderKeyId !== sender.id
    || payload.senderFingerprint !== sender.fingerprint || !sameIds(payload.recipients, message.recipientKeyIds)
    || !Array.isArray(payload.attachments) || payload.attachments.length > GROUP_MESSAGE_LIMITS.attachments
    || !sameIds(payload.attachments.map(item => item?.id), message.attachments ?? [])) {
    throw failure('INVALID_MESSAGE', 'This message does not match its signed band chat context.');
  }
  const attachments = payload.attachments.map(attachmentMeta);
  validateGroupBody(payload.body, attachments);
  return { body: payload.body, attachments };
}

export async function decryptGroupMessage({ message, organizationId, ownUserId, ownKeyId, unlocked, sender }) {
  if (!message.recipientKeyIds?.includes(ownKeyId)) {
    throw failure('NOT_A_RECIPIENT', 'This message was not encrypted for your messaging key. It was sent before you joined or set up encrypted messaging.');
  }
  if (!unlocked || unlocked.record.id !== ownKeyId || unlocked.record.userId !== ownUserId) {
    throw failure('KEY_LOCKED', 'Unlock the messaging key used for this message.');
  }
  try {
    const encrypted = JSON.parse(message.ciphertext);
    const mine = encrypted.recipients?.find(item => item.header?.kid === ownKeyId);
    if (!mine || encrypted.recipients.length !== message.recipientKeyIds.length) throw new Error('Recipient mismatch');
    const { plaintext, protectedHeader } = await generalDecrypt({ ...encrypted, recipients: [mine] }, unlocked.encryptionPrivate, {
      keyManagementAlgorithms: [keyAlgorithm], contentEncryptionAlgorithms: ['A256GCM'], maxDecompressedLength: 0,
    });
    if (protectedHeader.typ !== groupEnvelopeType) throw new Error('Unexpected message profile');
    const content = JSON.parse(decode(plaintext));
    if (content?.version !== 1 || typeof content.jwt !== 'string' || !content.keys || typeof content.keys !== 'object') {
      throw new Error('Unexpected message content');
    }
    const verified = await verifyGroupMessageEvidence(content.jwt, { message, organizationId, sender });
    const attachments = verified.attachments.map(item => {
      if (!attachmentKey(content.keys[item.id])) throw new Error('Missing attachment key');
      return { ...item, key: content.keys[item.id] };
    });
    return { body: verified.body, attachments, signedEvidence: content.jwt };
  } catch {
    throw failure('DECRYPTION_FAILED', 'This message could not be decrypted and verified. Check the messaging fingerprints; no unverified content is shown.');
  }
}
