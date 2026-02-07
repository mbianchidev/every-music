import { realmConnector } from './realm-connector.js';

export class MusicianRepository {
  async findByUserId(userId) {
    const query = `
      SELECT p.*, 
             array_agg(DISTINCT jsonb_build_object(
               'instrument_id', ui.instrument_id,
               'name', i.name,
               'category', i.category,
               'years_experience', ui.years_experience,
               'skill_level', ui.skill_level
             )) FILTER (WHERE ui.instrument_id IS NOT NULL) as instruments,
             array_agg(DISTINCT jsonb_build_object(
               'genre_id', ug.genre_id,
               'name', g.name
             )) FILTER (WHERE ug.genre_id IS NOT NULL) as genres,
             array_agg(DISTINCT jsonb_build_object(
               'id', pr.id,
               'name', pr.name,
               'years_active', pr.years_active,
               'role', pr.role,
               'description', pr.description,
               'spotify_link', pr.spotify_link,
               'youtube_link', pr.youtube_link,
               'bandcamp_link', pr.bandcamp_link
             )) FILTER (WHERE pr.id IS NOT NULL) as projects
      FROM profiles p
      LEFT JOIN user_instruments ui ON p.id = ui.profile_id
      LEFT JOIN instruments i ON ui.instrument_id = i.id
      LEFT JOIN user_genres ug ON p.id = ug.profile_id
      LEFT JOIN genres g ON ug.genre_id = g.id
      LEFT JOIN projects pr ON p.id = pr.profile_id
      WHERE p.user_id = $1
      GROUP BY p.id
    `;
    const result = await realmConnector.execute(query, [userId]);
    return result.rows[0] || null;
  }

  async createProfile(userId, profileData) {
    const query = `
      INSERT INTO profiles (
        user_id, artist_name, first_name, last_name, age,
        city, state, country, latitude, longitude, bio,
        profile_picture_url, phone, telegram_id, whatsapp, signal, website_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;
    const result = await realmConnector.execute(query, [
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

  async updateProfile(profileId, profileData) {
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

    const result = await realmConnector.execute(query, values);
    return result.rows[0] || null;
  }

  async searchProfiles(filters, pagination) {
    let whereConditions = ['1=1'];
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
      whereConditions.push(`(
        p.artist_name ILIKE $${paramIndex} OR 
        p.first_name ILIKE $${paramIndex} OR 
        p.last_name ILIKE $${paramIndex} OR
        p.bio ILIKE $${paramIndex}
      )`);
      params.push(`%${filters.searchTerm}%`);
      paramIndex++;
    }

    const limit = pagination.pageSize || 20;
    const offset = ((pagination.page || 1) - 1) * limit;

    const query = `
      SELECT p.id, p.user_id, p.artist_name, p.first_name, p.last_name,
             p.city, p.state, p.country, p.bio, p.profile_picture_url,
             p.created_at
      FROM profiles p
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY p.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    params.push(limit, offset);
    const result = await realmConnector.execute(query, params);
    return result.rows;
  }

  async attachInstruments(profileId, instruments) {
    if (!instruments || instruments.length === 0) return;

    const query = `
      INSERT INTO user_instruments (profile_id, instrument_id, years_experience, skill_level)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (profile_id, instrument_id) 
      DO UPDATE SET years_experience = EXCLUDED.years_experience, skill_level = EXCLUDED.skill_level
    `;

    for (const inst of instruments) {
      await realmConnector.execute(query, [
        profileId,
        inst.instrumentId,
        inst.yearsExperience || 0,
        inst.skillLevel || 'beginner',
      ]);
    }
  }

  async attachGenres(profileId, genreIds) {
    if (!genreIds || genreIds.length === 0) return;

    await realmConnector.execute(
      'DELETE FROM user_genres WHERE profile_id = $1',
      [profileId]
    );

    const query = `
      INSERT INTO user_genres (profile_id, genre_id)
      VALUES ($1, $2)
      ON CONFLICT (profile_id, genre_id) DO NOTHING
    `;

    for (const genreId of genreIds) {
      await realmConnector.execute(query, [profileId, genreId]);
    }
  }

  async addProject(profileId, projectData) {
    const query = `
      INSERT INTO projects (
        profile_id, name, years_active, role, description,
        spotify_link, youtube_link, bandcamp_link, soundcloud_link, website_link
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const result = await realmConnector.execute(query, [
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
    ]);
    return result.rows[0];
  }

  async removeProject(projectId, profileId) {
    const query = `
      DELETE FROM projects
      WHERE id = $1 AND profile_id = $2
      RETURNING id
    `;
    const result = await realmConnector.execute(query, [projectId, profileId]);
    return result.rows[0] || null;
  }
}

export const musicianRepository = new MusicianRepository();
