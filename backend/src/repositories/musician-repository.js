import { realmConnector } from './realm-connector.js';

export class MusicianRepository {
  async findByUserId(userId, executor = realmConnector, viewerId = null) {
    const query = `
      SELECT p.*,
             EXISTS(SELECT 1 FROM followers f WHERE f.follower_id = $2 AND f.following_id = p.user_id) AS is_following,
             (SELECT jsonb_agg(jsonb_build_object(
               'instrument_id', ui.instrument_id,
               'name', i.name,
               'category', i.category,
               'years_experience', ui.years_experience,
               'skill_level', ui.skill_level
             ) ORDER BY i.name) FROM user_instruments ui JOIN instruments i ON i.id = ui.instrument_id
               WHERE ui.profile_id = p.id) AS instruments,
             (SELECT jsonb_agg(jsonb_build_object(
               'genre_id', ug.genre_id,
               'name', g.name
             ) ORDER BY g.name) FROM user_genres ug JOIN genres g ON g.id = ug.genre_id
               WHERE ug.profile_id = p.id) AS genres,
             (SELECT jsonb_agg(to_jsonb(pr) || jsonb_build_object(
               'collaborators', COALESCE((
                 SELECT jsonb_agg(c.value || jsonb_build_object('artistName', COALESCE(cp.artist_name, 'Musician')))
                 FROM jsonb_array_elements(pr.collaborators) c
                 LEFT JOIN profiles cp ON cp.user_id = (c.value->>'userId')::uuid
               ), '[]'::jsonb)
             ) ORDER BY pr.created_at DESC, pr.id) FROM projects pr WHERE pr.profile_id = p.id) AS projects
      FROM profiles p
      JOIN users u ON u.id = p.user_id
      WHERE p.user_id = $1 AND u.is_active = TRUE AND u.is_deleted = FALSE
    `;
    const result = await executor.execute(query, [userId, viewerId]);
    return result.rows[0] || null;
  }

  async findById(id, executor = realmConnector, viewerId = null) {
    const { rows } = await executor.execute('SELECT user_id FROM profiles WHERE id = $1', [id]);
    return rows[0] ? this.findByUserId(rows[0].user_id, executor, viewerId) : null;
  }

  async createProfile(userId, profileData, executor = realmConnector) {
    const query = `
      INSERT INTO profiles (
        user_id, artist_name, first_name, last_name, age,
        city, state, country, latitude, longitude, bio,
        profile_picture_url, phone, telegram_id, whatsapp, signal, website_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;
    const result = await executor.execute(query, [
      userId,
      profileData.artistName || null,
      profileData.firstName || null,
      profileData.lastName || null,
      profileData.age || null,
      profileData.city || null,
      profileData.state || null,
      profileData.country || null,
      profileData.latitude || null,
      profileData.longitude || null,
      profileData.bio || null,
      profileData.profilePictureUrl || null,
      profileData.phone || null,
      profileData.telegramId || null,
      profileData.whatsapp || null,
      profileData.signal || null,
      profileData.websiteUrl || null,
    ]);
    return result.rows[0];
  }

  async updateProfile(profileId, profileData, executor = realmConnector) {
    const updates = [];
    const values = [];
    let paramIndex = 1;

    const fieldMapping = {
      artistName: 'artist_name',
      firstName: 'first_name',
      lastName: 'last_name',
      age: 'age',
      city: 'city',
      state: 'state',
      country: 'country',
      latitude: 'latitude',
      longitude: 'longitude',
      bio: 'bio',
      profilePictureUrl: 'profile_picture_url',
      phone: 'phone',
      telegramId: 'telegram_id',
      whatsapp: 'whatsapp',
      signal: 'signal',
      websiteUrl: 'website_url',
    };

    for (const [jsField, dbField] of Object.entries(fieldMapping)) {
      if (profileData[jsField] !== undefined) {
        updates.push(`${dbField} = $${paramIndex++}`);
        values.push(profileData[jsField]);
      }
    }

    if (updates.length === 0) {
      return null;
    }

    values.push(profileId);
    const query = `
      UPDATE profiles
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await executor.execute(query, values);
    return result.rows[0] || null;
  }

  async searchProfiles(filters, pagination) {
    let whereConditions = ['u.is_active = TRUE', 'u.is_deleted = FALSE'];
    const params = [];
    let paramIndex = 1;

    if (filters.city) {
      whereConditions.push(`p.city ILIKE $${paramIndex++}`);
      params.push(`%${filters.city}%`);
    }

    if (filters.instrumentId) {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM user_instruments ui 
        WHERE ui.profile_id = p.id AND ui.instrument_id = $${paramIndex++}
      )`);
      params.push(filters.instrumentId);
    }

    if (filters.genreId) {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM user_genres ug 
        WHERE ug.profile_id = p.id AND ug.genre_id = $${paramIndex++}
      )`);
      params.push(filters.genreId);
    }

    if (filters.searchTerm) {
      whereConditions.push(`(COALESCE(p.artist_name, '') || ' ' || COALESCE(p.first_name, '') || ' ' ||
        COALESCE(p.last_name, '') || ' ' || COALESCE(p.bio, '')) ILIKE $${paramIndex}`);
      params.push(`%${filters.searchTerm}%`);
      paramIndex++;
    }

    const pageSize = pagination.pageSize || 20;
    const limit = pagination.limit || pageSize;
    const offset = ((pagination.page || 1) - 1) * pageSize;

    const sorts = { newest: 'p.created_at DESC', oldest: 'p.created_at ASC', name: "COALESCE(p.artist_name, p.first_name, '') ASC", city: "COALESCE(p.city, '') ASC" };
    const query = `
      SELECT p.id, p.user_id, p.artist_name, p.first_name, p.last_name,
             p.city, p.state, p.country, p.bio, p.profile_picture_url,
             p.created_at
      FROM profiles p
      JOIN users u ON u.id = p.user_id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY ${sorts[filters.sort] || sorts.newest}, p.id
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    params.push(limit, offset);
    const result = await realmConnector.execute(query, params);
    return result.rows;
  }

  async attachInstruments(profileId, instruments, executor = realmConnector) {
    await executor.execute(
      'DELETE FROM user_instruments WHERE profile_id = $1',
      [profileId],
    );

    if (!instruments || instruments.length === 0) return;

    const query = `
      INSERT INTO user_instruments (profile_id, instrument_id, years_experience, skill_level)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (profile_id, instrument_id)
      DO UPDATE SET years_experience = EXCLUDED.years_experience,
                    skill_level = EXCLUDED.skill_level
    `;

    for (const inst of instruments) {
      await executor.execute(query, [
        profileId,
        inst.instrumentId,
        inst.yearsExperience || 0,
        inst.skillLevel || 'beginner',
      ]);
    }
  }

  async attachGenres(profileId, genreIds, executor = realmConnector) {
    await executor.execute(
      'DELETE FROM user_genres WHERE profile_id = $1',
      [profileId]
    );

    if (!genreIds || genreIds.length === 0) return;

    const query = `
      INSERT INTO user_genres (profile_id, genre_id)
      VALUES ($1, $2)
      ON CONFLICT (profile_id, genre_id) DO NOTHING
    `;

    for (const genreId of genreIds) {
      await executor.execute(query, [profileId, genreId]);
    }
  }

  async addProject(profileId, projectData, executor = realmConnector) {
    const query = `
      INSERT INTO projects (
        profile_id, name, years_active, role, description,
        spotify_link, youtube_link, bandcamp_link, soundcloud_link, website_link, collaborators
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    const result = await executor.execute(query, [
      profileId,
      projectData.name,
      projectData.yearsActive || null,
      projectData.role || null,
      projectData.description || null,
      projectData.spotifyLink || null,
      projectData.youtubeLink || null,
      projectData.bandcampLink || null,
      projectData.soundcloudLink || null,
      projectData.websiteLink || null,
      JSON.stringify(projectData.collaborators || []),
    ]);
    return result.rows[0];
  }

  async updateProject(projectId, profileId, data, executor = realmConnector) {
    const fields = {
      name: 'name', yearsActive: 'years_active', role: 'role', description: 'description',
      spotifyLink: 'spotify_link', youtubeLink: 'youtube_link', bandcampLink: 'bandcamp_link',
      soundcloudLink: 'soundcloud_link', websiteLink: 'website_link', collaborators: 'collaborators',
    };
    const entries = Object.entries(fields).filter(([key]) => data[key] !== undefined);
    if (!entries.length) {
      const { rows } = await executor.execute('SELECT * FROM projects WHERE id = $1 AND profile_id = $2', [projectId, profileId]);
      return rows[0] || null;
    }
    const { rows } = await executor.execute(`
      UPDATE projects SET ${entries.map(([, column], i) => `${column} = $${i + 3}`).join(', ')}
      WHERE id = $1 AND profile_id = $2 RETURNING *`,
    [projectId, profileId, ...entries.map(([key]) => key === 'collaborators' ? JSON.stringify(data[key]) : data[key])]);
    return rows[0] || null;
  }

  async removeProject(projectId, profileId, executor = realmConnector) {
    const query = `
      DELETE FROM projects
      WHERE id = $1 AND profile_id = $2
      RETURNING id
    `;
    const result = await executor.execute(query, [projectId, profileId]);
    return result.rows[0] || null;
  }
}

export const musicianRepository = new MusicianRepository();
