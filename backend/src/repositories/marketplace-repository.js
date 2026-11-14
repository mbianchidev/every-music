import { realmConnector } from './realm-connector.js';
import { requestError } from '../engines/request-error.js';
import { publishEvent, publishAdminEvent } from './event-publisher.js';
import { notificationRepository } from './notification-repository.js';
import { communityRepository } from './community-repository.js';
import { administrationRepository } from './administration-repository.js';
import {
  MARKETPLACE_TABS, MAX_LISTING_PHOTOS, MAX_OPEN_LISTINGS, MAX_SAVED_LISTINGS, OPEN_STATUSES, normalizeListing,
} from '../engines/marketplace-catalog.js';

const notFound = () => requestError(404, 'LISTING_NOT_FOUND', 'Listing not found');
const removed = () => requestError(409, 'LISTING_REMOVED', 'This listing was removed by a moderator and can no longer be changed');

// Anyone may see a listing that was not removed, has not expired, and whose
// owner is an active account. Keep in sync with media-references.js.
export const VISIBLE_LISTING = 'l.removed_at IS NULL AND l.expires_at > NOW() AND u.is_active = TRUE AND u.is_deleted = FALSE';

const columns = viewer => `
  l.*, l.expires_at <= NOW() AS expired, p.artist_name, p.profile_picture_url,
  COALESCE((SELECT jsonb_agg('/realm/media/' || ph.media_id ORDER BY ph.position)
    FROM marketplace_listing_photos ph WHERE ph.listing_id = l.id), '[]'::jsonb) AS photos,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name) ORDER BY i.name)
    FROM marketplace_listing_instruments li JOIN instruments i ON i.id = li.instrument_id WHERE li.listing_id = l.id), '[]'::jsonb) AS instruments,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) ORDER BY g.name)
    FROM marketplace_listing_genres lg JOIN genres g ON g.id = lg.genre_id WHERE lg.listing_id = l.id), '[]'::jsonb) AS genres,
  EXISTS(SELECT 1 FROM marketplace_saved_listings s WHERE s.listing_id = l.id AND s.user_id = ${viewer}) AS is_saved`;

const source = `marketplace_listings l JOIN users u ON u.id = l.user_id LEFT JOIN profiles p ON p.user_id = l.user_id`;

export function listingView(row, { viewerId = null, admin = false } = {}) {
  const owner = viewerId !== null && row.user_id === viewerId;
  return {
    id: row.id, type: row.listing_type, category: row.category, subcategory: row.subcategory,
    title: row.title, description: row.description, condition: row.item_condition,
    priceMode: row.price_mode, priceMinor: row.price_minor === null ? null : Number(row.price_minor),
    currency: row.currency, rateUnit: row.rate_unit,
    locationText: row.location_text, latitude: row.latitude, longitude: row.longitude,
    remote: row.is_remote, shipping: row.shipping_available,
    status: row.status, expiresAt: row.expires_at, expired: row.expired, createdAt: row.created_at, updatedAt: row.updated_at,
    photos: row.photos, instruments: row.instruments, genres: row.genres,
    seller: { userId: row.user_id, artistName: row.artist_name || 'Musician', pictureUrl: row.profile_picture_url },
    isSaved: row.is_saved, isOwner: owner,
    removedByModeration: (owner || admin) ? row.removed_at !== null : false,
    ...(admin ? { removedAt: row.removed_at, moderationNote: row.moderation_note } : {}),
  };
}

// API shape of a stored listing, used to merge partial edits before validation.
function editable(row) {
  return {
    type: row.listing_type, category: row.category, subcategory: row.subcategory, title: row.title,
    description: row.description, condition: row.item_condition, priceMode: row.price_mode,
    priceMinor: row.price_minor === null ? null : Number(row.price_minor), currency: row.currency,
    rateUnit: row.rate_unit, locationText: row.location_text, latitude: row.latitude, longitude: row.longitude,
    remote: row.is_remote, shipping: row.shipping_available,
  };
}

const persisted = listing => [
  listing.type, listing.category, listing.subcategory, listing.title, listing.description, listing.condition,
  listing.priceMode, listing.priceMinor, listing.currency, listing.rateUnit, listing.locationText,
  listing.latitude, listing.longitude, listing.remote, listing.shipping,
];

class MarketplaceRepository {
  async load(executor, id, viewerId, admin = false) {
    const { rows } = await executor.execute(`SELECT ${columns('$2')} FROM ${source} WHERE l.id = $1`, [id, viewerId]);
    return rows[0] ? listingView(rows[0], { viewerId, admin }) : null;
  }

  async lockOwned(executor, id, userId) {
    const { rows } = await executor.execute('SELECT * FROM marketplace_listings WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, userId]);
    if (!rows[0]) throw notFound();
    if (rows[0].removed_at) throw removed();
    return rows[0];
  }

  async assertOpenCapacity(executor, userId, excludeId = null) {
    await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const { rows } = await executor.execute(`
      SELECT COUNT(*)::int AS count FROM marketplace_listings
      WHERE user_id = $1 AND removed_at IS NULL AND status = ANY($2::text[]) AND expires_at > NOW()
        AND id IS DISTINCT FROM $3::uuid`, [userId, OPEN_STATUSES, excludeId]);
    if (rows[0].count >= MAX_OPEN_LISTINGS) {
      throw requestError(403, 'LISTING_LIMIT_REACHED', `You can have at most ${MAX_OPEN_LISTINGS} open listings. Close or delete one first.`);
    }
  }

  async replacePhotos(executor, listingId, userId, photos) {
    if (photos.length > MAX_LISTING_PHOTOS) throw requestError(400, 'INVALID_LISTING', `Add at most ${MAX_LISTING_PHOTOS} photos`);
    await executor.execute('DELETE FROM marketplace_listing_photos WHERE listing_id = $1', [listingId]);
    const ids = [];
    for (const url of photos) {
      const reference = await communityRepository.mediaReference(executor, url, userId, 'listing');
      if (!reference?.startsWith('/realm/media/')) throw requestError(400, 'INVALID_MEDIA', 'Upload listing photos with this account');
      const id = reference.slice('/realm/media/'.length);
      if (ids.includes(id)) throw requestError(400, 'INVALID_LISTING', 'Each photo can be added once');
      ids.push(id);
    }
    if (ids.length) {
      await executor.execute(`
        INSERT INTO marketplace_listing_photos (listing_id, media_id, position)
        SELECT $1, media_id, ordinality - 1 FROM unnest($2::uuid[]) WITH ORDINALITY AS photo(media_id, ordinality)`, [listingId, ids]);
    }
  }

  async replaceTags(executor, listingId, table, column, catalog, ids) {
    const unique = [...new Set(ids.map(id => id.toLowerCase()))];
    await executor.execute(`DELETE FROM ${table} WHERE listing_id = $1`, [listingId]);
    if (!unique.length) return;
    const { rowCount } = await executor.execute(`
      INSERT INTO ${table} (listing_id, ${column}) SELECT $1, id FROM ${catalog} WHERE id = ANY($2::uuid[])`, [listingId, unique]);
    if (rowCount !== unique.length) throw requestError(400, 'INVALID_TAG', 'Choose instruments and genres from the catalog');
  }

  async relations(executor, id, userId, input) {
    if (input.photos !== undefined) await this.replacePhotos(executor, id, userId, input.photos);
    if (input.instrumentIds !== undefined) {
      await this.replaceTags(executor, id, 'marketplace_listing_instruments', 'instrument_id', 'instruments', input.instrumentIds);
    }
    if (input.genreIds !== undefined) {
      await this.replaceTags(executor, id, 'marketplace_listing_genres', 'genre_id', 'genres', input.genreIds);
    }
  }

  async create(userId, input, { listingDays }) {
    const listing = normalizeListing(input);
    return realmConnector.transaction(async executor => {
      await this.assertOpenCapacity(executor, userId);
      const { rows } = await executor.execute(`
        INSERT INTO marketplace_listings (
          user_id, listing_type, category, subcategory, title, description, item_condition, price_mode, price_minor,
          currency, rate_unit, location_text, latitude, longitude, is_remote, shipping_available, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW() + make_interval(days => $17::int))
        RETURNING id`, [userId, ...persisted(listing), listingDays]);
      const { id } = rows[0];
      await this.relations(executor, id, userId, input);
      await publishEvent(executor, 'marketplace.changed', { id });
      return this.load(executor, id, userId);
    });
  }

  async update(userId, id, changes) {
    return realmConnector.transaction(async executor => {
      const row = await this.lockOwned(executor, id, userId);
      id = row.id;
      const fields = Object.fromEntries(Object.entries(changes)
        .filter(([key, value]) => value !== undefined && !['photos', 'instrumentIds', 'genreIds', 'status'].includes(key)));
      const listing = normalizeListing({ ...editable(row), ...fields });
      const status = changes.status ?? row.status;
      if (OPEN_STATUSES.includes(status) && !OPEN_STATUSES.includes(row.status)) await this.assertOpenCapacity(executor, userId, id);
      await executor.execute(`
        UPDATE marketplace_listings SET listing_type = $2, category = $3, subcategory = $4, title = $5, description = $6,
          item_condition = $7, price_mode = $8, price_minor = $9, currency = $10, rate_unit = $11, location_text = $12,
          latitude = $13, longitude = $14, is_remote = $15, shipping_available = $16, status = $17, updated_at = NOW()
        WHERE id = $1`, [id, ...persisted(listing), status]);
      await this.relations(executor, id, userId, changes);
      await publishEvent(executor, 'marketplace.changed', { id });
      return this.load(executor, id, userId);
    });
  }

  async renew(userId, id, { listingDays }) {
    return realmConnector.transaction(async executor => {
      const row = await this.lockOwned(executor, id, userId);
      if (!OPEN_STATUSES.includes(row.status)) {
        throw requestError(409, 'LISTING_CLOSED', 'Reopen this listing as active or reserved before renewing it');
      }
      if (new Date(row.expires_at) <= new Date()) await this.assertOpenCapacity(executor, userId, row.id);
      await executor.execute(`
        UPDATE marketplace_listings SET expires_at = NOW() + make_interval(days => $2::int), expiry_notified_at = NULL, updated_at = NOW()
        WHERE id = $1`, [row.id, listingDays]);
      await publishEvent(executor, 'marketplace.changed', { id: row.id });
      return this.load(executor, row.id, userId);
    });
  }

  async remove(userId, id) {
    return realmConnector.transaction(async executor => {
      const row = await this.lockOwned(executor, id, userId);
      await executor.execute('DELETE FROM marketplace_listings WHERE id = $1', [row.id]);
      await publishEvent(executor, 'marketplace.changed', { id: row.id });
      return { id: row.id };
    });
  }

  async detail(id, viewerId, admin = false) {
    const { rows } = await realmConnector.execute(`
      SELECT ${columns('$2')} FROM ${source}
      WHERE l.id = $1 AND (l.user_id = $2 OR $3::boolean OR (${VISIBLE_LISTING}))`, [id, viewerId, admin]);
    if (!rows[0]) throw notFound();
    return listingView(rows[0], { viewerId, admin });
  }

  async search(filters, { page, pageSize }, viewerId) {
    const where = [VISIBLE_LISTING, 'l.status = ANY($2::text[])'];
    const values = [viewerId, OPEN_STATUSES];
    const add = (sql, value) => { values.push(value); where.push(sql.replaceAll('?', `$${values.length}`)); };
    if (filters.tab) add('l.listing_type = ANY(?::text[])', MARKETPLACE_TABS[filters.tab]);
    if (filters.type) add('l.listing_type = ?', filters.type);
    if (filters.category) add('l.category = ?', filters.category);
    if (filters.subcategory) add('l.subcategory = ?', filters.subcategory);
    if (filters.condition) add('l.item_condition = ?', filters.condition);
    if (filters.currency) add('l.currency = ?', filters.currency);
    if (filters.priceMin !== undefined) add('l.price_minor >= ?', filters.priceMin);
    if (filters.priceMax !== undefined) add('l.price_minor <= ?', filters.priceMax);
    if (filters.q) add("(l.title || ' ' || l.description) ILIKE ?", `%${escapeLike(filters.q)}%`);
    if (filters.location) add('l.location_text ILIKE ?', `%${escapeLike(filters.location)}%`);
    if (filters.remote) add('l.is_remote = ?', true);
    if (filters.shipping) add('l.shipping_available = ?', true);
    if (filters.instrumentId) add('EXISTS(SELECT 1 FROM marketplace_listing_instruments t WHERE t.listing_id = l.id AND t.instrument_id = ?)', filters.instrumentId);
    if (filters.genreId) add('EXISTS(SELECT 1 FROM marketplace_listing_genres t WHERE t.listing_id = l.id AND t.genre_id = ?)', filters.genreId);
    const price = "CASE WHEN l.price_mode = 'free' THEN 0 ELSE l.price_minor END";
    const order = {
      newest: 'l.created_at DESC',
      price_asc: `${price} ASC NULLS LAST, l.created_at DESC`,
      price_desc: `${price} DESC NULLS LAST, l.created_at DESC`,
      title: 'lower(l.title) ASC, l.created_at DESC',
    }[filters.sort || 'newest'];
    values.push(pageSize + 1, (page - 1) * pageSize);
    const { rows } = await realmConnector.execute(`
      SELECT ${columns('$1')} FROM ${source} WHERE ${where.join(' AND ')}
      ORDER BY ${order}, l.id LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    return rows.map(row => listingView(row, { viewerId }));
  }

  async mine(userId, { page, pageSize }) {
    const { rows } = await realmConnector.execute(`
      SELECT ${columns('$1')} FROM ${source} WHERE l.user_id = $1
      ORDER BY l.created_at DESC, l.id LIMIT $2 OFFSET $3`, [userId, pageSize + 1, (page - 1) * pageSize]);
    return rows.map(row => listingView(row, { viewerId: userId }));
  }

  async saved(userId, { page, pageSize }) {
    const { rows } = await realmConnector.execute(`
      SELECT ${columns('$1')} FROM marketplace_saved_listings s JOIN ${source} ON l.id = s.listing_id
      WHERE s.user_id = $1 AND ${VISIBLE_LISTING}
      ORDER BY s.created_at DESC, l.id LIMIT $2 OFFSET $3`, [userId, pageSize + 1, (page - 1) * pageSize]);
    return rows.map(row => listingView(row, { viewerId: userId }));
  }

  async visibleForUpdate(executor, id) {
    const { rows } = await executor.execute(`
      SELECT l.id, l.user_id, l.title FROM marketplace_listings l JOIN users u ON u.id = l.user_id
      WHERE l.id = $1 AND ${VISIBLE_LISTING} FOR SHARE OF l`, [id]);
    if (!rows[0]) throw notFound();
    return rows[0];
  }

  async save(userId, id, saved) {
    return realmConnector.transaction(async executor => {
      if (saved) {
        const listing = await this.visibleForUpdate(executor, id);
        await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const { rows } = await executor.execute('SELECT COUNT(*)::int AS count FROM marketplace_saved_listings WHERE user_id = $1', [userId]);
        if (rows[0].count >= MAX_SAVED_LISTINGS) {
          throw requestError(403, 'SAVED_LISTING_LIMIT', `You can save at most ${MAX_SAVED_LISTINGS} listings. Remove some first.`);
        }
        await executor.execute('INSERT INTO marketplace_saved_listings (user_id, listing_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, listing.id]);
      } else {
        await executor.execute('DELETE FROM marketplace_saved_listings WHERE user_id = $1 AND listing_id = $2', [userId, id]);
      }
      await publishEvent(executor, 'marketplace.saved.changed', { userId });
      return { saved };
    });
  }

  async report(userId, id, input) {
    if (input.consent !== true) throw requestError(400, 'REPORT_CONSENT_REQUIRED', 'Explicitly agree before disclosing report content to administrators.');
    const details = input.details.trim();
    if (details.length < 5) throw requestError(400, 'INVALID_REPORT', 'Add at least five characters describing the concern');
    return realmConnector.transaction(async executor => {
      await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const listing = await this.visibleForUpdate(executor, id);
      if (listing.user_id === userId) throw requestError(400, 'INVALID_REPORT', 'You cannot report your own listing');
      const recent = await executor.execute(
        "SELECT COUNT(*)::int AS count FROM user_reports WHERE reporter_id = $1 AND created_at > NOW() - INTERVAL '1 day'", [userId]);
      if (recent.rows[0].count >= 10) throw requestError(429, 'REPORT_LIMIT', 'At most ten reports can be submitted per day');
      const duplicate = await executor.execute(
        "SELECT id FROM user_reports WHERE reporter_id = $1 AND listing_id = $2 AND status = 'open'", [userId, listing.id]);
      if (duplicate.rows.length) throw requestError(409, 'REPORT_EXISTS', 'An open report already exists for this listing');
      const { rows } = await executor.execute(`
        INSERT INTO user_reports (reporter_id, reported_user_id, listing_id, category, details)
        VALUES ($1, $2, $3, $4, $5) RETURNING id, status, created_at AS "createdAt"`,
      [userId, listing.user_id, listing.id, input.category, details]);
      await publishAdminEvent(executor);
      await publishEvent(executor, 'reports.changed', { userId, id: rows[0].id });
      return rows[0];
    });
  }

  async moderationQueue(actorId, { page, pageSize }, status) {
    return administrationRepository.withAdmin(actorId, async executor => {
      const { rows } = await executor.execute(`
        SELECT r.id, r.category, r.status, r.created_at AS "createdAt", r.listing_id AS "listingId",
          l.title AS "listingTitle", l.removed_at IS NOT NULL AS "listingRemoved",
          r.reported_user_id AS "sellerId", COALESCE(p.artist_name, 'Musician') AS "sellerName"
        FROM user_reports r JOIN marketplace_listings l ON l.id = r.listing_id
        LEFT JOIN profiles p ON p.user_id = r.reported_user_id
        WHERE ($1::text IS NULL OR r.status = $1)
        ORDER BY r.created_at DESC, r.id DESC LIMIT $2 OFFSET $3`, [status || null, pageSize + 1, (page - 1) * pageSize]);
      return rows;
    });
  }

  async moderate(actorId, id, note) {
    note = note.trim();
    if (note.length < 5) throw requestError(400, 'INVALID_MODERATION_NOTE', 'Record at least five characters explaining the decision');
    return administrationRepository.withAdmin(actorId, async executor => {
      const { rows } = await executor.execute('SELECT * FROM marketplace_listings WHERE id = $1 FOR UPDATE', [id]);
      const listing = rows[0];
      if (!listing) throw notFound();
      if (listing.removed_at) throw requestError(409, 'LISTING_REMOVED', 'This listing was already removed');
      await executor.execute(`
        UPDATE marketplace_listings SET removed_at = NOW(), removed_by = $2, moderation_note = $3, updated_at = NOW()
        WHERE id = $1`, [listing.id, actorId, note]);
      const reports = await executor.execute(`
        UPDATE user_reports SET status = 'actioned', moderator_id = $2, moderator_note = $3, reviewed_at = NOW()
        WHERE listing_id = $1 AND status = 'open' RETURNING id, reporter_id`, [listing.id, actorId, note]);
      await administrationRepository.audit(executor, actorId, 'listing_removed', listing.id, reports.rows[0]?.id ?? null);
      for (const report of reports.rows) {
        await notificationRepository.create(executor, {
          userId: report.reporter_id, kind: 'report_reviewed', title: 'An administrator reviewed your report',
          link: '#reports', key: `report-reviewed:${report.id}`,
        });
        await publishEvent(executor, 'reports.changed', { userId: report.reporter_id, id: report.id });
      }
      await notificationRepository.create(executor, {
        userId: listing.user_id, kind: 'listing_removed', title: `A moderator removed your listing "${listing.title}"`,
        link: `#listing?id=${listing.id}`, key: `listing-removed:${listing.id}`,
        params: { listingId: listing.id, title: listing.title },
      });
      await publishEvent(executor, 'marketplace.changed', { id: listing.id });
      await publishAdminEvent(executor);
      return { id: listing.id, removed: true, resolvedReports: reports.rowCount };
    });
  }

  // Sends one reminder per expiry date for open listings that expire within
  // `reminderDays`. Rows are leased with SKIP LOCKED so concurrent API
  // processes never notify the same listing twice.
  async notifyExpiring(executor, { reminderDays, batchSize = 100 }) {
    const { rows } = await executor.execute(`
      WITH due AS (
        SELECT l.id FROM marketplace_listings l JOIN users u ON u.id = l.user_id
        WHERE ${VISIBLE_LISTING} AND l.status = ANY($3::text[]) AND l.expiry_notified_at IS NULL
          AND l.expires_at <= NOW() + make_interval(days => $1::int)
        ORDER BY l.expires_at, l.id LIMIT $2 FOR UPDATE OF l SKIP LOCKED
      )
      UPDATE marketplace_listings l SET expiry_notified_at = NOW() FROM due WHERE l.id = due.id
      RETURNING l.id, l.user_id, l.title, l.expires_at`, [reminderDays, batchSize, OPEN_STATUSES]);
    for (const row of rows) {
      await notificationRepository.create(executor, {
        userId: row.user_id, kind: 'listing_expiring', title: `Your marketplace listing "${row.title}" expires soon`,
        link: `#listing?id=${row.id}`, key: `listing-expiring:${row.id}:${new Date(row.expires_at).getTime()}`,
        params: { listingId: row.id, title: row.title, expiresAt: new Date(row.expires_at).toISOString() },
      });
    }
    return rows.length;
  }

  async purgeStale(executor, retentionDays = 365) {
    const { rowCount } = await executor.execute(`
      DELETE FROM marketplace_listings
      WHERE removed_at < NOW() - make_interval(days => $1::int) OR expires_at < NOW() - make_interval(days => $1::int)`, [retentionDays]);
    return rowCount;
  }
}

export function escapeLike(value) {
  return value.replace(/[\\%_]/g, match => `\\${match}`);
}

export const marketplaceRepository = new MarketplaceRepository();
