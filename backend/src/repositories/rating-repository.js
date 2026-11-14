import { realmConnector } from './realm-connector.js';
import { administrationRepository } from './administration-repository.js';
import { requestError } from '../engines/request-error.js';

const view = row => ({
  id: row.id, appVersion: row.app_version, stars: row.stars, comment: row.comment,
  platform: row.platform, createdAt: row.created_at,
});

class RatingRepository {
  async create(userId, { appVersion, stars, comment, platform }) {
    const { rows } = await realmConnector.execute(`
      INSERT INTO app_ratings (user_id, app_version, stars, comment, platform) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, app_version) DO NOTHING
      RETURNING id, app_version, stars, comment, platform, created_at`,
    [userId, appVersion, stars, comment?.trim() || null, platform ?? null]);
    if (!rows.length) throw requestError(409, 'RATING_EXISTS', 'You already rated this version of the app. Thank you!');
    return view(rows[0]);
  }

  async own(userId) {
    const { rows } = await realmConnector.execute(`
      SELECT id, app_version, stars, comment, platform, created_at FROM app_ratings
      WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 20`, [userId]);
    return { ratings: rows.map(view) };
  }

  async summary(actorId) {
    return administrationRepository.withAdmin(actorId, async executor => {
      const total = (await executor.execute(`
        SELECT COUNT(*)::int AS count, ROUND(AVG(stars)::numeric, 2)::float AS average,
          COUNT(*) FILTER (WHERE rewarded_at IS NULL)::int AS unrewarded
        FROM app_ratings`)).rows[0];
      const { rows: stars } = await executor.execute('SELECT stars, COUNT(*)::int AS count FROM app_ratings GROUP BY stars');
      const { rows: versions } = await executor.execute(`
        SELECT app_version AS version, COUNT(*)::int AS count, ROUND(AVG(stars)::numeric, 2)::float AS average
        FROM app_ratings GROUP BY app_version
        ORDER BY string_to_array(app_version, '.')::int[] DESC LIMIT 20`);
      const { rows: recent } = await executor.execute(`
        SELECT id, app_version, stars, comment, platform, created_at FROM app_ratings
        WHERE comment IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 20`);
      return {
        total: { count: total.count, average: total.average, unrewarded: total.unrewarded },
        distribution: Object.fromEntries([1, 2, 3, 4, 5].map(value => [value, stars.find(row => row.stars === value)?.count ?? 0])),
        versions,
        recent: recent.map(view),
      };
    });
  }

  // Reward hook for the points workstream: lock unprocessed ratings, grant
  // points elsewhere in the same transaction, then mark each one rewarded.
  async unrewarded(executor, limit = 100) {
    const { rows } = await executor.execute(`
      SELECT id, user_id AS "userId", app_version AS "appVersion", stars, created_at AS "createdAt"
      FROM app_ratings WHERE rewarded_at IS NULL ORDER BY created_at, id LIMIT $1 FOR UPDATE SKIP LOCKED`, [limit]);
    return rows;
  }

  async markRewarded(executor, id, reference = null) {
    const { rowCount } = await executor.execute(`
      UPDATE app_ratings SET rewarded_at = NOW(), reward_reference = $2 WHERE id = $1 AND rewarded_at IS NULL`, [id, reference]);
    return rowCount === 1;
  }
}

export const ratingRepository = new RatingRepository();
