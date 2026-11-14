import conduit from './conduit.js';

const EXTENSIONS = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg',
  wav: 'audio/wav', webm: 'audio/webm', flac: 'audio/flac',
};
// Encrypted blobs carry a 12-byte IV and a 16-byte authentication tag.
export const ENCRYPTION_OVERHEAD = 28;
export const DEFAULT_ATTACHMENT_LIMIT = 10 * 1024 * 1024;

// The attachment MIME type for a picked file, from its type or extension.
export function attachmentTypeOf(file, allowed) {
  const declared = String(file?.type ?? '').toLowerCase();
  if (Object.hasOwn(allowed, declared)) return declared;
  const extension = String(file?.name ?? '').toLowerCase().split('.').pop();
  const guessed = EXTENSIONS[extension];
  return guessed && Object.hasOwn(allowed, guessed) ? guessed : null;
}

export const attachmentFits = (file, limit = DEFAULT_ATTACHMENT_LIMIT) => file.size + ENCRYPTION_OVERHEAD <= limit;

// Encrypts a file on this device and uploads only the ciphertext.
export async function uploadAttachment(file, type, transport = conduit) {
  const { attachmentName, encryptAttachment } = await import('./message-crypto.js');
  const sealed = await encryptAttachment(new Uint8Array(await file.arrayBuffer()));
  const stored = await transport.transmit('/media/blobs', {
    method: 'POST', auth: true, rawBody: sealed.blob, timeoutMs: 120000,
  });
  return { id: stored.id, type, name: attachmentName(file.name), size: file.size, digest: sealed.digest, key: sealed.key };
}

// Downloads an attachment's ciphertext and decrypts it into a local Blob.
export async function openAttachment(attachment, transport = conduit) {
  const response = await transport.transmit(`/media/${attachment.id}`, { auth: true, stream: true, timeoutMs: 120000 });
  const { decryptAttachment } = await import('./message-crypto.js');
  const bytes = await decryptAttachment(new Uint8Array(await response.arrayBuffer()), attachment);
  return new Blob([bytes], { type: attachment.type });
}
