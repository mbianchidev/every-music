import { calculateJwkThumbprint, decodeProtectedHeader, importJWK, jwtVerify } from 'jose';
import { requestError } from './request-error.js';

const invalid = message => requestError(400, 'INVALID_ENCRYPTION', message);
const encoded = (value, length) => typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value) && (!length || value.length === length);

function publicJwk(value) {
  if (!value || Object.keys(value).some(key => !['kty', 'crv', 'x', 'y'].includes(key))
    || value.kty !== 'EC' || value.crv !== 'P-256' || !encoded(value.x, 43) || !encoded(value.y, 43)) {
    throw invalid('Messaging public keys must be P-256 public JWKs, without private material.');
  }
  return { kty: 'EC', crv: 'P-256', x: value.x, y: value.y };
}

export async function validateKeyPublication(userId, publication) {
  try {
    const signingKey = publicJwk(publication.signingKey);
    const encryptionKey = publicJwk(publication.encryptionKey);
    const key = await importJWK(signingKey, 'ES256');
    await importJWK(encryptionKey, 'ECDH-ES+A256KW');
    const proof = await jwtVerify(publication.identityProof, key, {
      algorithms: ['ES256'], typ: 'everymusic.identity.v1+jwt',
      issuer: userId, audience: 'everymusic.messaging', subject: 'identity',
      requiredClaims: ['version', 'encryption'],
    });
    if (proof.payload.version !== 1 || proof.payload.encryption !== await calculateJwkThumbprint(encryptionKey)) {
      throw invalid('The encryption key must be signed by this account identity.');
    }
    const backup = publication.encryptedPrivateKey;
    const header = decodeProtectedHeader(backup);
    if (backup.split('.').length !== 5 || header.typ !== 'everymusic.key-backup.v1+jwe'
      || header.alg !== 'PBES2-HS512+A256KW' || header.enc !== 'A256GCM' || header.p2c !== 600000
      || !encoded(header.p2s, 22) || header.zip || header.crit) {
      throw invalid('Private keys must arrive as recovery-key-encrypted backups, never plaintext.');
    }
    return { ...publication, signingKey, encryptionKey, fingerprint: await calculateJwkThumbprint(signingKey) };
  } catch (error) {
    if (error.code === 'INVALID_ENCRYPTION') throw error;
    throw invalid('Messaging key proof or encrypted backup is invalid.');
  }
}

export async function validateMessageEnvelope(ciphertext, senderKeyId, recipientKeyId) {
  try {
    const value = JSON.parse(ciphertext);
    if (!value || Object.keys(value).some(key => !['protected', 'iv', 'ciphertext', 'tag', 'recipients'].includes(key))
      || !encoded(value.iv, 16) || !encoded(value.tag, 22) || !encoded(value.ciphertext)
      || !Array.isArray(value.recipients) || value.recipients.length !== 2) throw new Error('Invalid envelope');
    const header = decodeProtectedHeader(value);
    if (header.enc !== 'A256GCM' || header.typ !== 'everymusic.message.v1+jwe'
      || Object.keys(header).some(key => !['enc', 'typ'].includes(key))) throw new Error('Invalid profile');
    const wanted = new Set([senderKeyId, recipientKeyId]);
    if (wanted.size !== 2) throw new Error('Distinct participant keys required');
    for (const recipient of value.recipients) {
      if (!recipient || Object.keys(recipient).some(key => !['header', 'encrypted_key'].includes(key))
        || !encoded(recipient.encrypted_key, 54) || !wanted.delete(recipient.header?.kid)
        || recipient.header.alg !== 'ECDH-ES+A256KW'
        || Object.keys(recipient.header).some(key => !['alg', 'kid', 'epk'].includes(key))) throw new Error('Invalid recipient');
      await importJWK(publicJwk(recipient.header.epk), 'ECDH-ES+A256KW');
    }
    return JSON.stringify(value);
  } catch {
    throw invalid('Send an authenticated encrypted envelope for exactly the two participant keys.');
  }
}

export async function verifyReportedMessage(signedEvidence, message, sender, recipient) {
  try {
    const { payload } = await jwtVerify(signedEvidence, await importJWK(sender.signing_key, 'ES256'), {
      algorithms: ['ES256'], typ: 'everymusic.message.v1+jwt',
      issuer: message.sender_id, audience: recipient.user_id, subject: message.conversation_id,
      requiredClaims: ['jti', 'version', 'body', 'senderKeyId', 'recipientKeyId', 'senderFingerprint', 'recipientFingerprint'],
    });
    if (payload.version !== 1 || payload.jti !== message.client_id
      || payload.senderKeyId !== sender.id || payload.recipientKeyId !== recipient.id
      || payload.senderFingerprint !== sender.fingerprint || payload.recipientFingerprint !== recipient.fingerprint
      || typeof payload.body !== 'string' || !payload.body.trim() || payload.body.length > 4000) {
      throw new Error('Evidence context mismatch');
    }
    return payload.body;
  } catch {
    throw requestError(400, 'INVALID_REPORT_EVIDENCE', 'The selected message does not have a valid sender signature for this conversation.');
  }
}

// Band group chat: one JWE per message whose fresh content key is wrapped for
// every current member key, carrying a sender-signed record. The server only
// checks the envelope shape and that it addresses exactly the expected keys.
export const GROUP_LIMITS = { recipients: 100, attachments: 4, body: 4000 };

export async function validateGroupEnvelope(ciphertext, senderKeyId, recipientKeyIds) {
  try {
    const value = JSON.parse(ciphertext);
    const wanted = new Set(recipientKeyIds);
    if (!value || Object.keys(value).some(key => !['protected', 'iv', 'ciphertext', 'tag', 'recipients'].includes(key))
      || !encoded(value.iv, 16) || !encoded(value.tag, 22) || !encoded(value.ciphertext)
      || !Array.isArray(value.recipients) || value.recipients.length !== recipientKeyIds.length
      || wanted.size !== recipientKeyIds.length || wanted.size < 1 || wanted.size > GROUP_LIMITS.recipients
      || !wanted.has(senderKeyId)) throw new Error('Invalid envelope');
    const header = decodeProtectedHeader(value);
    if (header.enc !== 'A256GCM' || header.typ !== 'everymusic.group-message.v1+jwe'
      || Object.keys(header).some(key => !['enc', 'typ'].includes(key))) throw new Error('Invalid profile');
    for (const recipient of value.recipients) {
      if (!recipient || Object.keys(recipient).some(key => !['header', 'encrypted_key'].includes(key))
        || !encoded(recipient.encrypted_key, 54) || !wanted.delete(recipient.header?.kid)
        || recipient.header.alg !== 'ECDH-ES+A256KW'
        || Object.keys(recipient.header).some(key => !['alg', 'kid', 'epk'].includes(key))) throw new Error('Invalid recipient');
      await importJWK(publicJwk(recipient.header.epk), 'ECDH-ES+A256KW');
    }
    return JSON.stringify(value);
  } catch {
    throw invalid('Send an authenticated encrypted envelope for exactly the current band members\' keys.');
  }
}

function sameList(left, right) {
  if (!Array.isArray(left) || left.length !== right.length) return false;
  const expected = [...right].sort();
  return [...left].sort().every((value, index) => value === expected[index]);
}

// Verifies a reported band chat message: the signed record must come from the
// stored sender key and match the stored chat, client ID and recipients.
// Attachment keys are not part of the signed record, so they are never
// disclosed. Pass `attachmentIds = null` when the message was removed.
export async function verifyReportedGroupMessage(signedEvidence, message, sender, attachmentIds = []) {
  try {
    const { payload } = await jwtVerify(signedEvidence, await importJWK(sender.signing_key, 'ES256'), {
      algorithms: ['ES256'], typ: 'everymusic.group-message.v1+jwt',
      issuer: message.sender_id, audience: 'everymusic.band-chat', subject: message.organization_id,
      requiredClaims: ['jti', 'version', 'body', 'senderKeyId', 'senderFingerprint', 'recipients', 'attachments'],
    });
    if (payload.version !== 1 || payload.jti !== message.client_id || payload.senderKeyId !== sender.id
      || message.sender_key_id !== sender.id || payload.senderFingerprint !== sender.fingerprint
      || !sameList(payload.recipients, message.recipient_key_ids)
      || !Array.isArray(payload.attachments) || payload.attachments.length > GROUP_LIMITS.attachments
      || (attachmentIds && !sameList(payload.attachments.map(item => item?.id), attachmentIds))
      || typeof payload.body !== 'string' || payload.body.length > GROUP_LIMITS.body
      || (!payload.body.trim() && !payload.attachments.length)) {
      throw new Error('Evidence context mismatch');
    }
    return { body: payload.body, attachments: payload.attachments.length };
  } catch {
    throw requestError(400, 'INVALID_REPORT_EVIDENCE', 'The selected message does not have a valid sender signature for this band chat.');
  }
}
