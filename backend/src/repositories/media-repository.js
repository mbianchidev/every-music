import { randomUUID } from 'node:crypto';
import { realmConnector } from './realm-connector.js';
import { requestError } from '../engines/request-error.js';
import { mediaStorage } from '../engines/media-storage.js';
import {
  publicMediaReferences, authorizedMediaReferences, retainedMediaReferences,
} from '../engines/media-references.js';

export const ATTACHMENT_DAILY_LIMIT = 100;
export const mediaUrl = id => `/realm/media/${id}`;

const anyOf = predicates => (predicates.length ? predicates.map(predicate => `(${predicate})`).join(' OR ') : 'FALSE');

// Rewrites registry predicates written for a bound URL ($2) so a single
// statement can evaluate them for every media row.
export function forEachMedia(predicate, alias = 'm') {
  return predicate.replace(/\$2(?!\d)/g, `('/realm/media/' || ${alias}.id::text)`);
}

class MediaRepository {
  async store(userId, purpose, body, mimeType, { storage = mediaStorage(), connector = realmConnector } = {}) {
    if (!storage.usesObjects) {
      const { rows } = await connector.execute(
        'INSERT INTO media (user_id, purpose, content, mime_type) VALUES ($1, $2, $3, $4) RETURNING id, byte_size',
        [userId, purpose, body, mimeType],
      );
      return { id: rows[0].id, url: mediaUrl(rows[0].id), byteSize: rows[0].byte_size, mimeType };
    }
    const id = randomUUID();
    const key = `media/${id}`;
    await storage.put(key, body, mimeType);
    try {
      await connector.execute(
        'INSERT INTO media (id, user_id, purpose, storage_key, mime_type, byte_size) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, userId, purpose, key, mimeType, body.length],
      );
    } catch (error) {
      try {
        await storage.remove(key);
      } catch {
        await connector.execute('INSERT INTO media_object_deletions (storage_key) VALUES ($1) ON CONFLICT DO NOTHING', [key])
          .catch(() => {});
      }
      throw error;
    }
    return { id, url: mediaUrl(id), byteSize: body.length, mimeType };
  }

  async storeAttachment(userId, body, options = {}) {
    const { connector = realmConnector } = options;
    const { rows } = await connector.execute(`
      SELECT COUNT(*)::int AS count FROM media
      WHERE user_id = $1 AND purpose = 'attachment' AND created_at > NOW() - INTERVAL '1 day'`, [userId]);
    if (rows[0].count >= ATTACHMENT_DAILY_LIMIT) {
      throw requestError(429, 'ATTACHMENT_LIMIT_REACHED', `At most ${ATTACHMENT_DAILY_LIMIT} attachments can be uploaded per day`);
    }
    return this.store(userId, 'attachment', body, 'application/octet-stream', options);
  }

  // Owners always read their media. Others need a public reference (never for
  // attachments) or an authorized reference for this viewer.
  async open(id, viewerId, { storage = mediaStorage(), connector = realmConnector, logger = console } = {}) {
    id = id.toLowerCase();
    const { rows } = await connector.execute(`
      SELECT id, purpose, mime_type, byte_size, storage_key, content, owned, is_public FROM (
        SELECT m.id, m.purpose, m.mime_type, m.byte_size, m.storage_key, m.content,
          COALESCE(m.user_id = $3::uuid, FALSE) AS owned,
          (m.purpose <> 'attachment' AND (${anyOf(publicMediaReferences)})) AS is_public,
          ($3::uuid IS NOT NULL AND (${anyOf(authorizedMediaReferences)})) AS authorized
        FROM media m WHERE m.id = $1::uuid AND $2::text IS NOT NULL
      ) access WHERE owned OR is_public OR authorized`, [id, mediaUrl(id), viewerId ?? null]);
    if (!rows.length) throw requestError(404, 'IMAGE_NOT_FOUND', 'Image not found');
    const media = rows[0];
    let body = media.content;
    if (media.storage_key) {
      body = await storage.get(media.storage_key);
      if (!body) {
        logger.error({ mediaId: media.id }, 'Stored media object is missing');
        throw requestError(404, 'IMAGE_NOT_FOUND', 'Image not found');
      }
    }
    return {
      id: media.id, purpose: media.purpose, mimeType: media.mime_type, byteSize: media.byte_size,
      owned: media.owned, public: media.is_public, body,
    };
  }

  // Deletes unreferenced uploads older than a day. Stored objects are queued
  // by the media deletion trigger and removed by purgeObjects.
  async removeOrphans(connector = realmConnector) {
    const references = [...retainedMediaReferences, ...publicMediaReferences].map(predicate => forEachMedia(predicate));
    const { rowCount } = await connector.execute(`
      DELETE FROM media m WHERE m.created_at < NOW() - INTERVAL '1 day'
      AND NOT (${anyOf(references)})`);
    return rowCount;
  }

  async purgeObjects({ storage = mediaStorage(), connector = realmConnector, logger = console, batch = 25 } = {}) {
    if (!storage.objects) return 0;
    const { rows } = await connector.execute(`
      WITH due AS (
        SELECT storage_key FROM media_object_deletions WHERE next_attempt_at <= NOW()
        ORDER BY next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED
      )
      UPDATE media_object_deletions d SET attempts = d.attempts + 1,
        next_attempt_at = NOW() + LEAST(d.attempts + 1, 144) * INTERVAL '10 minutes'
      FROM due WHERE d.storage_key = due.storage_key RETURNING d.storage_key, d.attempts`, [batch]);
    const removed = [];
    for (const row of rows) {
      try {
        await storage.remove(row.storage_key);
        removed.push(row.storage_key);
      } catch (error) {
        logger.error({ attempt: row.attempts, statusCode: error.statusCode }, 'Stored media object deletion failed; it will be retried');
      }
    }
    if (removed.length) {
      await connector.execute('DELETE FROM media_object_deletions WHERE storage_key = ANY($1::text[])', [removed]);
    }
    return removed.length;
  }

  async pendingObjectDeletions(connector = realmConnector) {
    const { rows } = await connector.execute('SELECT COUNT(*)::int AS count FROM media_object_deletions');
    return rows[0].count;
  }
}

export const mediaRepository = new MediaRepository();
