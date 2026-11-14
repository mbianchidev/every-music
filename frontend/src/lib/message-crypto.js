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
