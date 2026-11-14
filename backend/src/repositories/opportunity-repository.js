import { realmConnector } from './realm-connector.js';
import { placeJoinColumns } from './place-repository.js';
import { blockedBetween } from './social-repository.js';
import { proximity } from '../engines/geo.js';

const summaryColumns = `
  p.artist_name AS creator_name, p.profile_picture_url AS creator_picture_url,
  p.verified_at AS creator_verified_at,
  (SELECT jsonb_agg(jsonb_build_object(
    'instrument_id', ai.instrument_id, 'name', i.name, 'category', i.category
  ) ORDER BY i.name) FROM announcement_instruments ai JOIN instruments i ON i.id = ai.instrument_id
    WHERE ai.announcement_id = a.id) AS instruments,
  (SELECT jsonb_agg(jsonb_build_object(
    'genre_id', ag.genre_id, 'name', g.name
  ) ORDER BY g.name) FROM announcement_genres ag JOIN genres g ON g.id = ag.genre_id
    WHERE ag.announcement_id = a.id) AS genres,
  (SELECT jsonb_build_object('id', o.id, 'name', o.name, 'kind', o.kind, 'verified', o.verified_at IS NOT NULL)
    FROM organizations o WHERE o.id = a.organization_id AND o.is_deleted = FALSE) AS organization
`;

export class OpportunityRepository {
  async createAnnouncement(userId, announcementData, executor = realmConnector) {
    const query = `
      INSERT INTO announcements (
        user_id, title, description, picture_url, city, state, country,
        latitude, longitude, is_remote, is_cover_band, expires_at, is_published, place_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
    const result = await executor.execute(query, [
      userId,
      announcementData.title,
      announcementData.description,
      announcementData.pictureUrl || null,
      announcementData.city || null,
      announcementData.state || null,
      announcementData.country || null,
      announcementData.latitude || null,
      announcementData.longitude || null,
      announcementData.isRemote || false,
      announcementData.isCoverBand || false,
      announcementData.expiresAt || null,
      announcementData.isPublished !== undefined ? announcementData.isPublished : true,
      announcementData.placeId ?? null,
    ]);
    return result.rows[0];
  }

  async findById(announcementId, executor = realmConnector, viewerId = null) {
    const query = `
      SELECT a.*, ${summaryColumns},
             EXISTS(SELECT 1 FROM saved_announcements sa WHERE sa.announcement_id = a.id AND sa.user_id = $2) AS is_saved,
             (SELECT reaction_type FROM announcement_reactions ar WHERE ar.announcement_id = a.id AND ar.user_id = $2) AS my_reaction,
             (SELECT jsonb_agg(jsonb_build_object('link_type', al.link_type, 'url', al.url) ORDER BY al.id)
               FROM announcement_links al WHERE al.announcement_id = a.id) AS links,
             (SELECT COUNT(*)::int FROM saved_announcements sc WHERE sc.announcement_id = a.id) AS saves_count,
             EXISTS(SELECT 1 FROM blocked_users b WHERE b.user_id = a.user_id AND b.blocked_user_id = $2) AS blocks_viewer,
             ${placeJoinColumns('pl')}
      FROM announcements a
      LEFT JOIN profiles p ON a.user_id = p.user_id
      LEFT JOIN places pl ON pl.id = a.place_id
      WHERE a.id = $1 AND a.is_deleted = false
        AND EXISTS(SELECT 1 FROM users u WHERE u.id = a.user_id AND u.is_active AND NOT u.is_deleted)
    `;
    const result = await executor.execute(query, [announcementId, viewerId]);
    return result.rows[0] || null;
  }

  async findByUserId(userId, { page = 1, pageSize = 20, limit = pageSize } = {}) {
    const query = `
      SELECT a.*, ${summaryColumns}, ${placeJoinColumns('pl')},
             (SELECT COUNT(*)::int FROM saved_announcements sc WHERE sc.announcement_id = a.id) AS saves_count
      FROM announcements a
      LEFT JOIN profiles p ON p.user_id = a.user_id
      LEFT JOIN places pl ON pl.id = a.place_id
      WHERE a.user_id = $1 AND a.is_deleted = false
      ORDER BY a.created_at DESC, a.id
      LIMIT $2 OFFSET $3
    `;
    const result = await realmConnector.execute(query, [userId, limit, (page - 1) * pageSize]);
    return result.rows;
  }

  async searchAnnouncements(filters, pagination) {
    let whereConditions = ['a.is_deleted = false', 'a.is_published = true',
      'EXISTS(SELECT 1 FROM users u WHERE u.id = a.user_id AND u.is_active AND NOT u.is_deleted)'];
    const params = [];
    let paramIndex = 1;
    const add = (value) => {
      params.push(value);
      paramIndex = params.length + 1;
      return `$${params.length}`;
    };

    if (filters.userId) {
      whereConditions.push(`NOT ${blockedBetween(`${add(filters.userId)}::uuid`, 'a.user_id')}`);
    }
    if (filters.ids) whereConditions.push(`a.id = ANY(${add(filters.ids)}::uuid[])`);
    const location = filters.location || {};
    if (location.country) whereConditions.push(`pl.country_code = ${add(location.country)}`);
    if (location.region) whereConditions.push(`pl.region_code = ${add(location.region)}`);
    let distance = null;
    if (location.center) {
      const nearby = proximity({
        latitudeColumn: 'a.latitude', longitudeColumn: 'a.longitude', center: location.center, radiusKm: location.radiusKm,
      }, add);
      distance = nearby.distance;
      whereConditions.push(...nearby.conditions);
    }

    if (filters.instrumentId) {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM announcement_instruments ai 
        WHERE ai.announcement_id = a.id AND ai.instrument_id = $${paramIndex++}
      )`);
      params.push(filters.instrumentId);
    }

    if (filters.genreId) {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM announcement_genres ag 
        WHERE ag.announcement_id = a.id AND ag.genre_id = $${paramIndex++}
      )`);
      params.push(filters.genreId);
    }

    if (filters.city) {
      whereConditions.push(`a.city ILIKE $${paramIndex++}`);
      params.push(`%${filters.city}%`);
    }

    if (filters.isRemote !== undefined) {
      whereConditions.push(`a.is_remote = $${paramIndex++}`);
      params.push(filters.isRemote);
    }

    if (filters.isCoverBand !== undefined) {
      whereConditions.push(`a.is_cover_band = $${paramIndex++}`);
      params.push(filters.isCoverBand);
    }

    if (filters.searchTerm) {
      whereConditions.push(`(a.title || ' ' || a.description) ILIKE $${paramIndex}`);
      params.push(`%${filters.searchTerm}%`);
      paramIndex++;
    }
    if (filters.createdWithin) {
      whereConditions.push(`a.created_at >= NOW() - $${paramIndex++}::interval`);
      params.push({ week: '7 days', month: '30 days' }[filters.createdWithin]);
    }

    whereConditions.push(`(a.expires_at IS NULL OR a.expires_at > NOW())`);

    const pageSize = pagination.pageSize || 20;
    const limit = pagination.limit || pageSize;
    const offset = ((pagination.page || 1) - 1) * pageSize;
    const viewerIndex = paramIndex++;
    params.push(filters.userId || null);

    const sorts = {
      newest: 'a.created_at DESC', oldest: 'a.created_at ASC', title: 'a.title ASC', city: "COALESCE(a.city, '') ASC",
      popular: '(a.likes_count - a.dislikes_count) DESC, a.likes_count DESC', expiring: 'a.expires_at ASC NULLS LAST, a.created_at DESC',
    };
    if (distance) sorts.distance = `${distance} ASC NULLS LAST, a.created_at DESC`;
    const query = `
      SELECT a.id, a.user_id, a.title, a.description, a.picture_url,
             a.city, a.state, a.country, a.is_remote, a.is_cover_band, a.is_published,
             a.views_count, a.likes_count, a.dislikes_count,
             a.created_at, a.expires_at, ${summaryColumns}, ${placeJoinColumns('pl')},
             ${distance ? `CASE WHEN a.latitude IS NULL THEN NULL ELSE ${distance} END` : 'NULL::float8'} AS distance_km,
             EXISTS(SELECT 1 FROM saved_announcements sa
               WHERE sa.announcement_id = a.id AND sa.user_id = $${viewerIndex}) AS is_saved
      FROM announcements a
      LEFT JOIN profiles p ON p.user_id = a.user_id
      LEFT JOIN places pl ON pl.id = a.place_id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY ${sorts[filters.sort] || sorts.newest}, a.id
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    params.push(limit, offset);
    const result = await realmConnector.execute(query, params);
    return result.rows;
  }

  async updateAnnouncement(announcementId, userId, updateData, executor = realmConnector) {
    const updates = [];
    const values = [];
    let paramIndex = 1;

    const fieldMapping = {
      title: 'title',
      description: 'description',
      pictureUrl: 'picture_url',
      city: 'city',
      state: 'state',
      country: 'country',
      latitude: 'latitude',
      longitude: 'longitude',
      isRemote: 'is_remote',
      isCoverBand: 'is_cover_band',
      expiresAt: 'expires_at',
      isPublished: 'is_published',
      placeId: 'place_id',
    };

    for (const [jsField, dbField] of Object.entries(fieldMapping)) {
      if (updateData[jsField] !== undefined) {
        updates.push(`${dbField} = $${paramIndex++}`);
        values.push(updateData[jsField]);
      }
    }

    if (updates.length === 0) {
      const existing = await executor.execute(
        `SELECT *
         FROM announcements
         WHERE id = $1 AND user_id = $2 AND is_deleted = false`,
        [announcementId, userId],
      );
      return existing.rows[0] || null;
    }

    values.push(announcementId, userId);
    const query = `
      UPDATE announcements
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND user_id = $${paramIndex} AND is_deleted = FALSE
      RETURNING *
    `;

    const result = await executor.execute(query, values);
    return result.rows[0] || null;
  }

  async deleteAnnouncement(announcementId, userId, executor = realmConnector) {
    const query = `
      UPDATE announcements
      SET is_deleted = true
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;
    const result = await executor.execute(query, [announcementId, userId]);
    return result.rows[0] || null;
  }

  async attachInstruments(announcementId, instrumentIds, executor = realmConnector) {
    await executor.execute(
      'DELETE FROM announcement_instruments WHERE announcement_id = $1',
      [announcementId]
    );

    if (!instrumentIds || instrumentIds.length === 0) return;

    const query = `
      INSERT INTO announcement_instruments (announcement_id, instrument_id)
      VALUES ($1, $2)
      ON CONFLICT (announcement_id, instrument_id) DO NOTHING
    `;

    for (const instrumentId of instrumentIds) {
      await executor.execute(query, [announcementId, instrumentId]);
    }
  }

  async attachGenres(announcementId, genreIds, executor = realmConnector) {
    await executor.execute(
      'DELETE FROM announcement_genres WHERE announcement_id = $1',
      [announcementId]
    );

    if (!genreIds || genreIds.length === 0) return;

    const query = `
      INSERT INTO announcement_genres (announcement_id, genre_id)
      VALUES ($1, $2)
      ON CONFLICT (announcement_id, genre_id) DO NOTHING
    `;

    for (const genreId of genreIds) {
      await executor.execute(query, [announcementId, genreId]);
    }
  }

  async attachLinks(announcementId, links, executor = realmConnector) {
    await executor.execute(
      'DELETE FROM announcement_links WHERE announcement_id = $1',
      [announcementId]
    );

    if (!links || links.length === 0) return;

    const query = `
      INSERT INTO announcement_links (announcement_id, link_type, url)
      VALUES ($1, $2, $3)
    `;

    for (const link of links) {
      await executor.execute(query, [
        announcementId,
        link.linkType || 'other',
        link.url,
      ]);
    }
  }

  async recordReaction(announcementId, userId, reactionType, executor = realmConnector) {
    const query = `
      INSERT INTO announcement_reactions (announcement_id, user_id, reaction_type)
      VALUES ($1, $2, $3)
      ON CONFLICT (announcement_id, user_id) 
      DO UPDATE SET reaction_type = EXCLUDED.reaction_type
      RETURNING *
    `;
    const result = await executor.execute(query, [
      announcementId,
      userId,
      reactionType,
    ]);
    
    await this.recalculateReactions(announcementId, executor);
    return result.rows[0];
  }

  async lockAnnouncement(announcementId, executor) {
    await executor.execute('SELECT id FROM announcements WHERE id = $1 FOR UPDATE', [announcementId]);
  }

  async recalculateReactions(announcementId, executor = realmConnector) {
    const query = `
      UPDATE announcements
      SET likes_count = (
        SELECT COUNT(*) FROM announcement_reactions 
        WHERE announcement_id = $1 AND reaction_type = 'like'
      ),
      dislikes_count = (
        SELECT COUNT(*) FROM announcement_reactions 
        WHERE announcement_id = $1 AND reaction_type = 'dislike'
      )
      WHERE id = $1
    `;
    await executor.execute(query, [announcementId]);
  }

  async saveAnnouncement(announcementId, userId, executor = realmConnector) {
    const query = `
      INSERT INTO saved_announcements (announcement_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (announcement_id, user_id) DO NOTHING
      RETURNING *
    `;
    const result = await executor.execute(query, [announcementId, userId]);
    return result.rows[0];
  }

  async unsaveAnnouncement(announcementId, userId, executor = realmConnector) {
    const query = `
      DELETE FROM saved_announcements
      WHERE announcement_id = $1 AND user_id = $2
      RETURNING id
    `;
    const result = await executor.execute(query, [announcementId, userId]);
    return result.rows[0] || null;
  }

  async getSavedAnnouncements(userId, pagination) {
    const pageSize = pagination.pageSize || 20;
    const limit = pagination.limit || pageSize;
    const offset = ((pagination.page || 1) - 1) * pageSize;

    const query = `
      SELECT a.*, sa.created_at as saved_at, TRUE AS is_saved, ${summaryColumns}, ${placeJoinColumns('pl')}
      FROM saved_announcements sa
      JOIN announcements a ON sa.announcement_id = a.id
      LEFT JOIN profiles p ON p.user_id = a.user_id
      LEFT JOIN places pl ON pl.id = a.place_id
      WHERE sa.user_id = $1 AND NOT ${blockedBetween('$1::uuid', 'a.user_id')}
        AND EXISTS(SELECT 1 FROM users u WHERE u.id = a.user_id AND u.is_active AND NOT u.is_deleted)
        AND a.is_deleted = false
        AND a.is_published = true
        AND (a.expires_at IS NULL OR a.expires_at > NOW())
      ORDER BY sa.created_at DESC, a.id
      LIMIT $2 OFFSET $3
    `;
    const result = await realmConnector.execute(query, [userId, limit, offset]);
    return result.rows;
  }
}

export const opportunityRepository = new OpportunityRepository();
