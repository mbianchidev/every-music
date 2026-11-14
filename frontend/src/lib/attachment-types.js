// Audio and picture types that band chat attachments may carry. Kept outside
// message-crypto.js so screens can check files without loading the crypto code.
export const ATTACHMENT_TYPES = {
  'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'image/gif': 'image',
  'audio/mpeg': 'audio', 'audio/mp4': 'audio', 'audio/x-m4a': 'audio', 'audio/aac': 'audio', 'audio/ogg': 'audio',
  'audio/wav': 'audio', 'audio/x-wav': 'audio', 'audio/wave': 'audio', 'audio/webm': 'audio', 'audio/flac': 'audio', 'audio/x-flac': 'audio',
};
export const MAX_ATTACHMENTS = 4;
