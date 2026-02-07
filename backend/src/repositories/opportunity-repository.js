import { realmConnector } from './realm-connector.js';

export class OpportunityRepository {
  async createAnnouncement(userId, announcementData) {
    const query = `
      INSERT INTO announcements (
        user_id, title, description, picture_url, city, state, country,
        latitude, longitude, is_remote, is_cover_band, expires_at, is_published
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;
    const result = await realmConnector.execute(query, [
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
    ]);
    return result.rows[0];
  }

  async findById(announcementId) {
    const query = `
      SELECT a.*,
             u.email as creator_email,
             array_agg(DISTINCT jsonb_build_object(
               'instrument_id', ai.instrument_id,
               'name', i.name,
               'category', i.category
             )) FILTER (WHERE ai.instrument_id IS NOT NULL) as instruments,
             array_agg(DISTINCT jsonb_build_object(
               'genre_id', ag.genre_id,
               'name', g.name
             )) FILTER (WHERE ag.genre_id IS NOT NULL) as genres,
             array_agg(DISTINCT jsonb_build_object(
               'link_type', al.link_type,
               'url', al.url
             )) FILTER (WHERE al.id IS NOT NULL) as links
      FROM announcements a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN announcement_instruments ai ON a.id = ai.announcement_id
      LEFT JOIN instruments i ON ai.instrument_id = i.id
      LEFT JOIN announcement_genres ag ON a.id = ag.announcement_id
      LEFT JOIN genres g ON ag.genre_id = g.id
      LEFT JOIN announcement_links al ON a.id = al.announcement_id
      WHERE a.id = $1 AND a.is_deleted = false
      GROUP BY a.id, u.email
    `;
    const result = await realmConnector.execute(query, [announcementId]);
    return result.rows[0] || null;
  }

  async findByUserId(userId) {
    const query = `
      SELECT a.*, 
             COUNT(DISTINCT ar.id) as reactions_count
      FROM announcements a
      LEFT JOIN announcement_reactions ar ON a.id = ar.announcement_id
      WHERE a.user_id = $1 AND a.is_deleted = false
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `;
    const result = await realmConnector.execute(query, [userId]);
    return result.rows;
  }

  async searchAnnouncements(filters, pagination) {
    let whereConditions = ['a.is_deleted = false', 'a.is_published = true'];
    const params = [];
    let paramIndex = 1;

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
      whereConditions.push(`(a.title ILIKE $${paramIndex} OR a.description ILIKE $${paramIndex})`);
      params.push(`%${filters.searchTerm}%`);
      paramIndex++;
    }

    whereConditions.push(`(a.expires_at IS NULL OR a.expires_at > NOW())`);

    const limit = pagination.pageSize || 20;
    const offset = ((pagination.page || 1) - 1) * limit;

    const query = `
      SELECT a.id, a.user_id, a.title, a.description, a.picture_url,
             a.city, a.state, a.country, a.is_remote, a.is_cover_band,
             a.views_count, a.likes_count, a.dislikes_count,
             a.created_at, a.expires_at
      FROM announcements a
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY a.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    params.push(limit, offset);
    const result = await realmConnector.execute(query, params);
    return result.rows;
  }

  async updateAnnouncement(announcementId, userId, updateData) {
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
    };

    for (const [jsField, dbField] of Object.entries(fieldMapping)) {
      if (updateData[jsField] !== undefined) {
        updates.push(`${dbField} = $${paramIndex++}`);
        values.push(updateData[jsField]);
      }
    }

    if (updates.length === 0) return null;

    values.push(announcementId, userId);
    const query = `
      UPDATE announcements
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
      RETURNING *
    `;

    const result = await realmConnector.execute(query, values);
    return result.rows[0] || null;
  }

  async deleteAnnouncement(announcementId, userId) {
    const query = `
      UPDATE announcements
      SET is_deleted = true
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;
    const result = await realmConnector.execute(query, [announcementId, userId]);
    return result.rows[0] || null;
  }

  async attachInstruments(announcementId, instrumentIds) {
    if (!instrumentIds || instrumentIds.length === 0) return;

    await realmConnector.execute(
      'DELETE FROM announcement_instruments WHERE announcement_id = $1',
      [announcementId]
    );

    const query = `
      INSERT INTO announcement_instruments (announcement_id, instrument_id)
      VALUES ($1, $2)
      ON CONFLICT (announcement_id, instrument_id) DO NOTHING
    `;

    for (const instrumentId of instrumentIds) {
      await realmConnector.execute(query, [announcementId, instrumentId]);
    }
  }

  async attachGenres(announcementId, genreIds) {
    if (!genreIds || genreIds.length === 0) return;

    await realmConnector.execute(
      'DELETE FROM announcement_genres WHERE announcement_id = $1',
      [announcementId]
    );

    const query = `
      INSERT INTO announcement_genres (announcement_id, genre_id)
      VALUES ($1, $2)
      ON CONFLICT (announcement_id, genre_id) DO NOTHING
    `;

    for (const genreId of genreIds) {
      await realmConnector.execute(query, [announcementId, genreId]);
    }
  }

  async attachLinks(announcementId, links) {
    if (!links || links.length === 0) return;

    await realmConnector.execute(
      'DELETE FROM announcement_links WHERE announcement_id = $1',
      [announcementId]
    );

    const query = `
      INSERT INTO announcement_links (announcement_id, link_type, url)
      VALUES ($1, $2, $3)
    `;

    for (const link of links) {
      await realmConnector.execute(query, [
        announcementId,
        link.linkType || 'other',
        link.url,
      ]);
    }
  }

  async incrementViews(announcementId) {
    const query = `
      UPDATE announcements
      SET views_count = views_count + 1
      WHERE id = $1
    `;
    await realmConnector.execute(query, [announcementId]);
  }

  async recordReaction(announcementId, userId, reactionType) {
    const query = `
      INSERT INTO announcement_reactions (announcement_id, user_id, reaction_type)
      VALUES ($1, $2, $3)
      ON CONFLICT (announcement_id, user_id) 
      DO UPDATE SET reaction_type = EXCLUDED.reaction_type
      RETURNING *
    `;
    const result = await realmConnector.execute(query, [
      announcementId,
      userId,
      reactionType,
    ]);
    
    await this.recalculateReactions(announcementId);
    return result.rows[0];
  }

  async recalculateReactions(announcementId) {
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
    await realmConnector.execute(query, [announcementId]);
  }

  async saveAnnouncement(announcementId, userId) {
    const query = `
      INSERT INTO saved_announcements (announcement_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (announcement_id, user_id) DO NOTHING
      RETURNING *
    `;
    const result = await realmConnector.execute(query, [announcementId, userId]);
    return result.rows[0];
  }

  async unsaveAnnouncement(announcementId, userId) {
    const query = `
      DELETE FROM saved_announcements
      WHERE announcement_id = $1 AND user_id = $2
      RETURNING id
    `;
    const result = await realmConnector.execute(query, [announcementId, userId]);
    return result.rows[0] || null;
  }

  async getSavedAnnouncements(userId, pagination) {
    const limit = pagination.pageSize || 20;
    const offset = ((pagination.page || 1) - 1) * limit;

    const query = `
      SELECT a.*, sa.created_at as saved_at
      FROM saved_announcements sa
      JOIN announcements a ON sa.announcement_id = a.id
      WHERE sa.user_id = $1 AND a.is_deleted = false
      ORDER BY sa.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await realmConnector.execute(query, [userId, limit, offset]);
    return result.rows;
  }
}

export const opportunityRepository = new OpportunityRepository();
