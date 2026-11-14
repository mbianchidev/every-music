import { realmConnector } from './realm-connector.js';
import { requestError } from '../engines/request-error.js';
import { distanceSql } from '../engines/geo.js';
import { publishEvent } from './event-publisher.js';
import { notificationRepository } from './notification-repository.js';
import { quotaRepository } from './quota-repository.js';
import { blockedBetween } from './social-repository.js';

function searchView(row) {
  return { id: row.id, name: row.name, filters: row.filters, notify: row.notify, createdAt: row.created_at };
}

const has = key => `(NOT s.filters ? '${key}' OR`;

// Saved filters mirror the announcement feed. Every condition is optional;
// stored place centers make distance matching independent of later edits.
const matchSql = `
  WITH target AS (
    SELECT a.*, pl.country_code AS place_country, pl.region_code AS place_region
    FROM announcements a LEFT JOIN places pl ON pl.id = a.place_id
    WHERE a.id = $1 AND a.is_published = TRUE AND a.is_deleted = FALSE AND (a.expires_at IS NULL OR a.expires_at > NOW())
  )
  SELECT DISTINCT s.user_id
  FROM saved_searches s CROSS JOIN target a
  JOIN users u ON u.id = s.user_id AND u.is_active = TRUE AND u.is_deleted = FALSE
  WHERE s.notify = TRUE AND s.user_id <> a.user_id
    AND NOT ${blockedBetween('s.user_id', 'a.user_id')}
    AND ${has('instrumentId')} EXISTS (SELECT 1 FROM announcement_instruments ai
      WHERE ai.announcement_id = a.id AND ai.instrument_id = (s.filters->>'instrumentId')::uuid))
    AND ${has('genreId')} EXISTS (SELECT 1 FROM announcement_genres ag
      WHERE ag.announcement_id = a.id AND ag.genre_id = (s.filters->>'genreId')::uuid))
    AND ${has('isRemote')} a.is_remote = (s.filters->>'isRemote')::boolean)
    AND ${has('isCoverBand')} a.is_cover_band = (s.filters->>'isCoverBand')::boolean)
    AND ${has('searchTerm')} (a.title || ' ' || a.description) ILIKE '%' || (s.filters->>'searchTerm') || '%')
    AND ${has('city')} a.city ILIKE '%' || (s.filters->>'city') || '%')
    AND ${has('country')} a.place_country = s.filters->>'country')
    AND ${has('region')} a.place_region = s.filters->>'region')
    AND ${has('radiusKm')} (a.latitude IS NOT NULL AND ${distanceSql('a.latitude', 'a.longitude',
    "(s.filters->>'latitude')::float8", "(s.filters->>'longitude')::float8")} <= (s.filters->>'radiusKm')::float8))`;

class SavedSearchRepository {
  async list(userId) {
    const { rows } = await realmConnector.execute(
      'SELECT * FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC, id', [userId],
    );
    return rows.map(searchView);
  }

  async create(userId, { name, filters, notify = true }) {
    return realmConnector.transaction(async (executor) => {
      await quotaRepository.lockUser(executor, userId);
      const used = await quotaRepository.savedSearches(executor, userId);
      await quotaRepository.assertCapacity(executor, userId, 'maxSavedSearches', used,
        limit => `Your plan can keep ${limit} saved ${limit === 1 ? 'search' : 'searches'}. Delete one or upgrade to save more.`);
      const { rows } = await executor.execute(`
        INSERT INTO saved_searches (user_id, name, filters, notify) VALUES ($1, $2, $3::jsonb, $4) RETURNING *`,
      [userId, name, JSON.stringify(filters), notify]);
      await publishEvent(executor, 'saved-searches.changed', { userId, id: rows[0].id });
      return searchView(rows[0]);
    });
  }

  async update(userId, id, changes) {
    return realmConnector.transaction(async (executor) => {
      const { rows } = await executor.execute(`
        UPDATE saved_searches SET name = COALESCE($3, name), notify = COALESCE($4, notify),
          filters = COALESCE($5::jsonb, filters)
        WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId, changes.name ?? null, changes.notify ?? null, changes.filters ? JSON.stringify(changes.filters) : null]);
      if (!rows.length) throw requestError(404, 'SAVED_SEARCH_NOT_FOUND', 'Saved search not found');
      await publishEvent(executor, 'saved-searches.changed', { userId, id });
      return searchView(rows[0]);
    });
  }

  async remove(userId, id) {
    return realmConnector.transaction(async (executor) => {
      const { rowCount } = await executor.execute('DELETE FROM saved_searches WHERE id = $1 AND user_id = $2', [id, userId]);
      if (!rowCount) throw requestError(404, 'SAVED_SEARCH_NOT_FOUND', 'Saved search not found');
      await publishEvent(executor, 'saved-searches.changed', { userId, id });
    });
  }

  // Runs inside the publishing transaction. Notification keys are per
  // announcement and recipient, so republishing never notifies twice.
  async notifyMatches(executor, announcement) {
    const { rows } = await executor.execute(matchSql, [announcement.id]);
    return notificationRepository.createMany(executor, rows.map(row => row.user_id), {
      kind: 'saved_search_match',
      title: 'A new announcement matches your saved search',
      link: `#announcement?id=${announcement.id}`,
      keyPrefix: `saved-search:${announcement.id}`,
      params: { announcementId: announcement.id, title: announcement.title },
    });
  }
}

export const savedSearchRepository = new SavedSearchRepository();
