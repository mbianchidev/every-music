import conduit from './conduit.js';

export function mediaUrl(value) {
  return value?.startsWith('/realm/media/')
    ? `${conduit.baseUrl}/media/${value.slice('/realm/media/'.length)}`
    : value;
}

export async function uploadImage(file, purpose) {
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('The image could not be read. Choose it again.'));
    reader.readAsDataURL(file);
  });
  return conduit.transmit('/media', { method: 'POST', auth: true, body: { data, mimeType: file.type, purpose } });
}
