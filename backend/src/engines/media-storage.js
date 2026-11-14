import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { AwsClient } from 'aws4fetch';
import { realmConfig } from '../../config/realm.js';
import { requestError } from './request-error.js';

const unavailable = cause => Object.assign(
  requestError(503, 'MEDIA_STORAGE_UNAVAILABLE', 'Media storage is temporarily unavailable. Try again shortly.'),
  { cause },
);

// Minimal S3 client for AWS S3 and S3-compatible services (Cloudflare R2,
// MinIO, SeaweedFS, ...). Requests are signed with AWS Signature V4.
export class S3ObjectStore {
  constructor(settings, { fetch = globalThis.fetch.bind(globalThis), timeoutMs = 30000, retryDelayMs = 200 } = {}) {
    this.bucket = settings.bucket;
    this.forcePathStyle = settings.forcePathStyle;
    this.endpoint = new URL(settings.endpoint || `https://s3.${settings.region}.amazonaws.com`);
    this.client = new AwsClient({
      accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey,
      service: 's3', region: settings.region, retries: 0,
    });
    this.fetch = fetch;
    this.timeoutMs = timeoutMs;
    this.retryDelayMs = retryDelayMs;
  }

  url(key = '') {
    const path = key.split('/').map(encodeURIComponent).join('/');
    if (this.forcePathStyle) return `${this.endpoint.origin}/${this.bucket}${key ? `/${path}` : ''}`;
    return `${this.endpoint.protocol}//${this.bucket}.${this.endpoint.host}/${path}`;
  }

  async request(method, key, { body, headers = {}, timeoutMs = this.timeoutMs } = {}) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const signed = await this.client.sign(this.url(key), { method, body, headers });
        const response = await this.fetch(signed, { signal: AbortSignal.timeout(timeoutMs) });
        if ((response.status >= 500 || response.status === 429) && attempt === 0) {
          await response.body?.cancel();
          lastError = Object.assign(new Error(`Object storage responded with ${response.status}`), { statusCode: response.status });
        } else {
          return response;
        }
      } catch (error) {
        lastError = error;
      }
      await new Promise(resolve => { setTimeout(resolve, this.retryDelayMs); });
    }
    throw lastError;
  }

  async failure(response, action) {
    await response.body?.cancel();
    return Object.assign(new Error(`Object storage ${action} failed with ${response.status}`), { statusCode: response.status });
  }

  async put(key, body, mimeType) {
    const response = await this.request('PUT', key, {
      body,
      headers: {
        'Content-Type': mimeType,
        'X-Amz-Content-Sha256': createHash('sha256').update(body).digest('hex'),
      },
    });
    if (!response.ok) throw await this.failure(response, 'upload');
    await response.body?.cancel();
  }

  // Resolves to null when the object does not exist.
  async get(key) {
    const response = await this.request('GET', key);
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok || !response.body) throw await this.failure(response, 'download');
    return Readable.fromWeb(response.body);
  }

  async remove(key) {
    const response = await this.request('DELETE', key);
    if (!response.ok && response.status !== 404) throw await this.failure(response, 'deletion');
    await response.body?.cancel();
  }

  async reachable() {
    try {
      const response = await this.request('HEAD', '', { timeoutMs: 5000 });
      await response.body?.cancel();
      return response.ok;
    } catch {
      return false;
    }
  }
}

// `driver` decides where new uploads go. Rows already stored as objects stay
// readable whenever S3 settings are complete, even after switching back to
// PostgreSQL.
export class MediaStorage {
  constructor(settings = {}, options = {}) {
    const s3 = settings.s3 || {};
    this.driver = settings.driver === 's3' ? 's3' : 'postgres';
    this.objects = s3.bucket && s3.accessKeyId && s3.secretAccessKey ? new S3ObjectStore(s3, options) : null;
  }

  get usesObjects() {
    return this.driver === 's3';
  }

  store() {
    if (!this.objects) throw unavailable(new Error('Object storage is not configured'));
    return this.objects;
  }

  async put(key, body, mimeType) {
    try {
      await this.store().put(key, body, mimeType);
    } catch (error) {
      throw error.code === 'MEDIA_STORAGE_UNAVAILABLE' ? error : unavailable(error);
    }
  }

  async get(key) {
    try {
      return await this.store().get(key);
    } catch (error) {
      throw error.code === 'MEDIA_STORAGE_UNAVAILABLE' ? error : unavailable(error);
    }
  }

  async remove(key) {
    await this.store().remove(key);
  }

  // Readiness detail: null when uploads use PostgreSQL only.
  async status() {
    if (!this.usesObjects) return null;
    return (await this.objects.reachable()) ? 'connected' : 'unavailable';
  }
}

let active = null;

export function configureMediaStorage(settings = realmConfig.mediaStorage, options) {
  active = settings instanceof MediaStorage ? settings : new MediaStorage(settings, options);
  return active;
}

export function mediaStorage() {
  return active ?? configureMediaStorage();
}
