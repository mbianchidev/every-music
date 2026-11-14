import { realmConnector } from './realm-connector.js';
import { notificationRepository } from './notification-repository.js';
import { parseVersion, updateKind } from '../engines/app-version.js';

const LOCK = 'everymusic:app-releases';
const BATCH = 1000;
const titles = {
  app_update_major: version => `A major Every.music update (${version}) is available`,
  app_update_minor: version => `Every.music ${version} is available`,
};

class ReleaseRepository {
  // Records the running API version. The transaction-scoped advisory lock and
  // the version primary key make the announcement happen once, even when
  // several API processes start together.
  async recordStartup(version, connector = realmConnector) {
    const current = parseVersion(version);
    if (!current) return { version, invalid: true, recorded: false, kind: null, notified: 0 };
    return connector.transaction(async executor => {
      await executor.execute('SELECT pg_advisory_xact_lock(hashtext($1))', [LOCK]);
      const { rows } = await executor.execute(`
        SELECT version, major, minor, patch FROM app_releases
        ORDER BY major DESC, minor DESC, patch DESC, recorded_at DESC LIMIT 1`);
      const kind = updateKind(rows[0] ?? null, current);
      const inserted = await executor.execute(`
        INSERT INTO app_releases (version, major, minor, patch, notified_kind) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (version) DO NOTHING RETURNING version`,
      [current.version, current.major, current.minor, current.patch, kind]);
      if (!inserted.rowCount || !kind) return { version: current.version, recorded: inserted.rowCount === 1, kind: null, notified: 0 };
      let notified = 0;
      let after = null;
      for (;;) {
        const { rows: users } = await executor.execute(`
          SELECT id FROM users WHERE is_active = TRUE AND is_deleted = FALSE AND ($1::uuid IS NULL OR id > $1)
          ORDER BY id LIMIT $2`, [after, BATCH]);
        if (!users.length) break;
        notified += (await notificationRepository.createMany(executor, users.map(user => user.id), {
          kind, title: titles[kind](current.version), link: '#help?view=updates',
          keyPrefix: `app-update:${current.version}`, params: { version: current.version },
        })).length;
        after = users.at(-1).id;
      }
      return { version: current.version, recorded: true, kind, notified };
    });
  }
}

export const releaseRepository = new ReleaseRepository();
