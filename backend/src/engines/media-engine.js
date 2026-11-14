import sharp from 'sharp';
import { requestError } from './request-error.js';

export const IMAGE_BYTE_LIMIT = 2 * 1024 * 1024;

export async function optimizeImage(data, mimeType) {
  if (typeof data !== 'string' || data.length > Math.ceil(IMAGE_BYTE_LIMIT / 3) * 4
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0
    || !['image/jpeg', 'image/png'].includes(mimeType)) {
    throw requestError(400, 'INVALID_IMAGE', 'Choose a JPEG or PNG image up to 2 MiB');
  }
  const input = Buffer.from(data, 'base64');
  if (input.length > IMAGE_BYTE_LIMIT || input.toString('base64') !== data) {
    throw requestError(400, 'INVALID_IMAGE', 'Choose a JPEG or PNG image up to 2 MiB');
  }
  try {
    const image = sharp(input, { limitInputPixels: 16_000_000, animated: true, failOn: 'warning' });
    const metadata = await image.metadata();
    if (metadata.format !== (mimeType === 'image/png' ? 'png' : 'jpeg') || (metadata.pages || 1) !== 1) {
      throw new Error('Image format does not match');
    }
    const output = await image.rotate().resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 }).toBuffer();
    if (output.length > IMAGE_BYTE_LIMIT) throw new Error('Optimized image exceeds the storage limit');
    return output;
  } catch (cause) {
    throw Object.assign(requestError(400, 'INVALID_IMAGE', 'The image is invalid, animated, or exceeds 16 megapixels'), { cause });
  }
}
