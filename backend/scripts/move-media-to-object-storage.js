import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { realmConfig, validateRealmConfig } from '../config/realm.js';
import { realmConnector } from '../src/repositories/realm-connector.js';
import { MediaStorage } from '../src/engines/media-storage.js';

// Copies media bytes still stored in PostgreSQL into the configured S3 bucket,
// then clears them from the row. Safe to stop and rerun: each row is switched
// only after its object upload succeeds.
export async function moveMediaToObjectStorage({
  storage = new MediaStorage(realmConfig.mediaStorage),
  connector = realmConnector,
  logger = console,
  batch = 50,
} = {}) {
  if (!storage.usesObjects) throw new Error('Set MEDIA_STORAGE=s3 and the S3 settings before moving media');
  let moved = 0;
  for (;;) {
    const { rows } = await connector.execute(`
      SELECT id, mime_type, content FROM media WHERE storage_key IS NULL
      ORDER BY created_at, id LIMIT $1`, [batch]);
    if (!rows.length) break;
    for (const row of rows) {
      const key = `media/${row.id}`;
      await storage.put(key, row.content, row.mime_type);
      const { rowCount } = await connector.execute(
        'UPDATE media SET storage_key = $2, content = NULL WHERE id = $1 AND storage_key IS NULL', [row.id, key],
      );
      if (!rowCount) await storage.remove(key);
      else moved += 1;
    }
    logger.info(`Moved ${moved} media items to object storage`);
  }
  return moved;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    validateRealmConfig();
    await realmConnector.establish();
    const moved = await moveMediaToObjectStorage();
    console.log(`Done: ${moved} media items now live in object storage`);
  } catch (error) {
    console.error('Moving media to object storage failed:', error);
    process.exitCode = 1;
  } finally {
    await realmConnector.disconnect();
  }
}
