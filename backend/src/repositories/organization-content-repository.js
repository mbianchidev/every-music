import { realmConnector } from './realm-connector.js';
import { publishEvent } from './event-publisher.js';
import { notificationRepository } from './notification-repository.js';
import { organizationRepository, organizationSummary, summarySql, displayName } from './organization-repository.js';
import { requestError } from '../engines/request-error.js';
import { LIMITS, RELATION_KINDS, distanceKm, similarityScore } from '../engines/organization-model.js';

function postView(row) {
  return {
    id: row.id, organizationId: row.organization_id, source: row.source, title: row.title, body: row.body, url: row.url,
    authorName: row.author_name ?? null, publishedAt: row.published_at,
    ...(row.organization_name ? { organization: { id: row.organization_id, name: row.organization_name, kind: row.organization_kind } } : {}),
  };
}

function releaseView(row) {
  return {
    id: row.id, title: row.title, releaseType: row.release_type, releaseDate: row.release_date, links: row.links, createdAt: row.created_at,
  };
}

function relationView(row) {
  return {
    id: row.id, kind: row.kind, status: row.status, createdAt: row.created_at, respondedAt: row.responded_at,
    organization: { id: row.organization_id, name: row.organization_name, kind: row.organization_kind },
    band: { id: row.band_id, name: row.band_name },
  };
}

const relationSql = `
  SELECT r.*, o.name AS organization_name, o.kind AS organization_kind, b.name AS band_name
  FROM organization_relations r JOIN organizations o ON o.id = r.organization_id AND o.is_deleted = FALSE
  JOIN organizations b ON b.id = r.band_id AND b.is_deleted = FALSE`;

class OrganizationContentRepository {
  async notifyFollowers(executor, organization, { postId, title, link, source, authorId = null }) {
    const recipients = await organizationRepository.followerIds(executor, organization.id, authorId ? [authorId] : []);
    await notificationRepository.createMany(executor, recipients, {
      kind: 'organization_update', title: `${organization.name}: ${title}`.slice(0, 255), link,
      keyPrefix: `organization-post:${postId}`,
      params: { organizationId: organization.id, organizationName: organization.name, source, title },
    });
  }

  async posts(reference, { page, pageSize }) {
    const id = await organizationRepository.resolveId(realmConnector, reference);
    const { rows } = await realmConnector.execute(`
      SELECT ps.*, ${displayName('p')} AS author_name FROM organization_posts ps LEFT JOIN profiles p ON p.user_id = ps.author_id
      WHERE ps.organization_id = $1 ORDER BY ps.published_at DESC, ps.id DESC LIMIT $2 OFFSET $3`,
    [id, pageSize + 1, (page - 1) * pageSize]);
    return rows.map(postView);
  }

  async followingUpdates(userId, { page, pageSize }) {
    const { rows } = await realmConnector.execute(`
      SELECT ps.*, o.name AS organization_name, o.kind AS organization_kind, ${displayName('p')} AS author_name
      FROM organization_followers f JOIN organizations o ON o.id = f.organization_id AND o.is_deleted = FALSE
      JOIN organization_posts ps ON ps.organization_id = o.id LEFT JOIN profiles p ON p.user_id = ps.author_id
      WHERE f.user_id = $1 ORDER BY ps.published_at DESC, ps.id DESC LIMIT $2 OFFSET $3`,
    [userId, pageSize + 1, (page - 1) * pageSize]);
    return rows.map(postView);
  }

  async createPost(organizationId, userId, { title = null, body = null, url = null }) {
    return realmConnector.transaction(async executor => {
      const { organization } = await organizationRepository.requireMember(executor, organizationId, userId, 'post_announcements');
      if (!organization.managed) throw requestError(409, 'ORGANIZATION_UNMANAGED', 'Community-maintained venues cannot publish updates');
      const { rows: [post] } = await executor.execute(`
        INSERT INTO organization_posts (organization_id, source, title, body, url, author_id)
        VALUES ($1, 'manual', $2, $3, $4, $5) RETURNING *`, [organizationId, title, body, url, userId]);
      await this.notifyFollowers(executor, organization, {
        postId: post.id, title: title || (body.length > 80 ? `${body.slice(0, 77)}...` : body),
        link: `#organization?id=${organizationId}`, source: 'manual', authorId: userId,
      });
      await publishEvent(executor, 'organizations.changed', { id: organizationId });
      return postView(post);
    });
  }

  async removePost(organizationId, userId, postId) {
    return realmConnector.transaction(async executor => {
      await organizationRepository.requireMember(executor, organizationId, userId, 'post_announcements');
      const { rowCount } = await executor.execute("DELETE FROM organization_posts WHERE id = $1 AND organization_id = $2 AND source <> 'release'", [postId, organizationId]);
      if (!rowCount) throw requestError(404, 'POST_NOT_FOUND', 'Update not found. Remove a release from the releases list.');
      await publishEvent(executor, 'organizations.changed', { id: organizationId });
    });
  }

  // Imports parsed YouTube entries for one band. Duplicates are ignored by the
  // (organization, source, external_id) index. Videos published before the
  // channel was linked are imported silently so linking never floods followers.
  async importYoutubeEntries(executor, organizationId, channelId, entries) {
    const { rows } = await executor.execute(`
      SELECT id, name, kind, managed, youtube_linked_at FROM organizations
      WHERE id = $1 AND youtube_channel_id = $2 AND is_deleted = FALSE FOR UPDATE`, [organizationId, channelId]);
    if (!rows.length) return [];
    const organization = rows[0];
    const created = [];
    for (const entry of entries) {
      const { rows: inserted } = await executor.execute(`
        INSERT INTO organization_posts (organization_id, source, external_id, title, url, published_at)
        VALUES ($1, 'youtube', $2, $3, $4, $5)
        ON CONFLICT (organization_id, source, external_id) WHERE external_id IS NOT NULL DO NOTHING RETURNING *`,
      [organizationId, entry.videoId, entry.title, entry.url, entry.publishedAt]);
      if (!inserted.length) continue;
      created.push(postView(inserted[0]));
      if (organization.youtube_linked_at && new Date(entry.publishedAt) >= organization.youtube_linked_at) {
        await this.notifyFollowers(executor, organization, {
          postId: inserted[0].id, title: `New video: ${entry.title}`, link: `#organization?id=${organizationId}`, source: 'youtube',
        });
      }
    }
    if (created.length) await publishEvent(executor, 'organizations.changed', { id: organizationId });
    return created;
  }

  async releases(organizationId, executor = realmConnector) {
    const { rows } = await executor.execute(`
      SELECT id, title, release_type, to_char(release_date, 'YYYY-MM-DD') AS release_date, links, created_at
      FROM organization_releases WHERE organization_id = $1 ORDER BY release_date DESC NULLS LAST, created_at DESC, id`, [organizationId]);
    return rows.map(releaseView);
  }

  async createRelease(organizationId, userId, input) {
    return realmConnector.transaction(async executor => {
      const { organization } = await organizationRepository.requireMember(executor, organizationId, userId, 'manage_profile');
      if (organization.kind !== 'band') throw requestError(409, 'BAND_REQUIRED', 'Only bands publish releases');
      const { rows: [release] } = await executor.execute(`
        INSERT INTO organization_releases (organization_id, title, release_type, release_date, links, created_by)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, title, release_type, to_char(release_date, 'YYYY-MM-DD') AS release_date, links, created_at`,
      [organizationId, input.title, input.releaseType, input.releaseDate ?? null, JSON.stringify(input.links ?? []), userId]);
      const { rows: [post] } = await executor.execute(`
        INSERT INTO organization_posts (organization_id, source, external_id, title, url, author_id)
        VALUES ($1, 'release', $2, $3, $4, $5) RETURNING id`,
      [organizationId, release.id, `${input.releaseType.toUpperCase()}: ${input.title}`.slice(0, 255), input.links?.[0]?.url ?? null, userId]);
      await this.notifyFollowers(executor, organization, {
        postId: post.id, title: `New ${input.releaseType}: ${input.title}`, link: `#organization?id=${organizationId}`, source: 'release', authorId: userId,
      });
      await publishEvent(executor, 'organizations.changed', { id: organizationId });
      return releaseView(release);
    });
  }

  async updateRelease(organizationId, userId, releaseId, input) {
    return realmConnector.transaction(async executor => {
      await organizationRepository.requireMember(executor, organizationId, userId, 'manage_profile');
      const columns = { title: 'title', releaseType: 'release_type', releaseDate: 'release_date', links: 'links' };
      const changes = Object.entries(columns).filter(([key]) => input[key] !== undefined)
        .map(([key, column]) => [column, key === 'links' ? JSON.stringify(input.links) : input[key]]);
      const { rows } = await executor.execute(`
        UPDATE organization_releases SET ${[...changes.map(([column], i) => `${column} = $${i + 3}`), 'id = id'].join(', ')}
        WHERE id = $1 AND organization_id = $2
        RETURNING id, title, release_type, to_char(release_date, 'YYYY-MM-DD') AS release_date, links, created_at`,
      [releaseId, organizationId, ...changes.map(([, value]) => value)]);
      if (!rows.length) throw requestError(404, 'RELEASE_NOT_FOUND', 'Release not found');
      await executor.execute(`
        UPDATE organization_posts SET title = $3, url = $4 WHERE organization_id = $1 AND source = 'release' AND external_id = $2`,
      [organizationId, releaseId, `${rows[0].release_type.toUpperCase()}: ${rows[0].title}`.slice(0, 255), rows[0].links[0]?.url ?? null]);
      await publishEvent(executor, 'organizations.changed', { id: organizationId });
      return releaseView(rows[0]);
    });
  }

  async removeRelease(organizationId, userId, releaseId) {
    return realmConnector.transaction(async executor => {
      await organizationRepository.requireMember(executor, organizationId, userId, 'manage_profile');
      const { rowCount } = await executor.execute('DELETE FROM organization_releases WHERE id = $1 AND organization_id = $2', [releaseId, organizationId]);
      if (!rowCount) throw requestError(404, 'RELEASE_NOT_FOUND', 'Release not found');
      await executor.execute("DELETE FROM organization_posts WHERE organization_id = $1 AND source = 'release' AND external_id = $2", [organizationId, releaseId]);
      await publishEvent(executor, 'organizations.changed', { id: organizationId });
    });
  }

  async relations(organizationId, executor = realmConnector, statuses = ['accepted']) {
    const { rows } = await executor.execute(`${relationSql}
      WHERE (r.organization_id = $1 OR r.band_id = $1) AND r.status = ANY($2::text[])
      ORDER BY r.created_at DESC, r.id`, [organizationId, statuses]);
    return rows.map(relationView);
  }

  async managedRelations(organizationId, userId) {
    return realmConnector.transaction(async executor => {
      await organizationRepository.requireMember(executor, organizationId, userId, 'manage_profile');
      return this.relations(organizationId, executor, ['pending', 'accepted']);
    });
  }

  async pendingRelationRequests(userId) {
    const { rows } = await realmConnector.execute(`${relationSql}
      JOIN organization_members m ON m.organization_id = r.band_id AND m.user_id = $1 AND m.status = 'active'
        AND (m.role IN ('leader', 'admin') OR 'manage_profile' = ANY(m.permissions))
      WHERE r.status = 'pending' ORDER BY r.created_at DESC, r.id`, [userId]);
    return rows.map(relationView);
  }

  async requestRelation(organizationId, userId, bandId) {
    return realmConnector.transaction(async executor => {
      const { organization } = await organizationRepository.requireMember(executor, organizationId, userId, 'manage_profile', { lock: true });
      const kind = RELATION_KINDS[organization.kind];
      if (!kind) throw requestError(409, 'RELATION_UNSUPPORTED', 'Only booking agencies and labels can add bands');
      if (!organization.managed) throw requestError(409, 'ORGANIZATION_UNMANAGED', 'Claim this page first');
      const { rows: [band] } = await executor.execute(
        "SELECT id, name FROM organizations WHERE id = $1 AND kind = 'band' AND is_deleted = FALSE", [bandId]);
      if (!band) throw requestError(404, 'BAND_NOT_FOUND', 'Band not found');
      let relation;
      try {
        ({ rows: [relation] } = await executor.execute(`
          INSERT INTO organization_relations (kind, organization_id, band_id, requested_by) VALUES ($1, $2, $3, $4) RETURNING id`,
        [kind, organizationId, bandId, userId]));
      } catch (error) {
        if (error.code === '23505') throw requestError(409, 'RELATION_EXISTS', 'This band already has a pending or accepted request');
        throw error;
      }
      const managers = await organizationRepository.managerIds(executor, bandId, 'manage_profile');
      await notificationRepository.createMany(executor, managers, {
        kind: 'organization_relation',
        title: kind === 'roster' ? `${organization.name} wants to add ${band.name} to its roster` : `${organization.name} wants to sign ${band.name}`,
        link: '#your-pages', keyPrefix: `organization-relation:${relation.id}`,
        params: { relationId: relation.id, relationKind: kind, organizationId, organizationName: organization.name, bandId, bandName: band.name, status: 'pending' },
      });
      await publishEvent(executor, 'organizations.changed', { id: bandId });
      for (const manager of managers) await publishEvent(executor, 'organizations.changed', { userId: manager });
      return { id: relation.id, kind, status: 'pending' };
    });
  }

  async respondToRelation(bandId, userId, relationId, accept) {
    return realmConnector.transaction(async executor => {
      const { organization: band } = await organizationRepository.requireMember(executor, bandId, userId, 'manage_profile', { lock: true });
      const { rows: [relation] } = await executor.execute(`${relationSql}
        WHERE r.id = $1 AND r.band_id = $2 FOR UPDATE OF r`, [relationId, bandId]);
      if (!relation) throw requestError(404, 'RELATION_NOT_FOUND', 'Request not found');
      if (relation.status !== 'pending') throw requestError(409, 'RELATION_RESOLVED', 'This request was already answered');
      const status = accept ? 'accepted' : 'declined';
      await executor.execute(`
        UPDATE organization_relations SET status = $2, responded_by = $3, responded_at = NOW() WHERE id = $1`, [relationId, status, userId]);
      const managers = await organizationRepository.managerIds(executor, relation.organization_id, 'manage_profile');
      await notificationRepository.createMany(executor, managers, {
        kind: 'organization_relation', title: `${band.name} ${status} your request`, link: `#organization?id=${relation.organization_id}`,
        keyPrefix: `organization-relation-response:${relationId}`,
        params: { relationId, relationKind: relation.kind, organizationId: relation.organization_id, organizationName: relation.organization_name, bandId, bandName: band.name, status },
      });
      await publishEvent(executor, 'organizations.changed', { id: bandId });
      await publishEvent(executor, 'organizations.changed', { id: relation.organization_id });
      return { id: relationId, status };
    });
  }

  async endRelation(organizationId, userId, relationId) {
    return realmConnector.transaction(async executor => {
      await organizationRepository.requireMember(executor, organizationId, userId, 'manage_profile');
      const { rows } = await executor.execute(`
        UPDATE organization_relations SET status = 'ended', responded_by = $3, responded_at = NOW()
        WHERE id = $1 AND (organization_id = $2 OR band_id = $2) AND status IN ('pending', 'accepted')
        RETURNING organization_id, band_id`, [relationId, organizationId, userId]);
      if (!rows.length) throw requestError(404, 'RELATION_NOT_FOUND', 'Relation not found');
      await publishEvent(executor, 'organizations.changed', { id: rows[0].organization_id });
      await publishEvent(executor, 'organizations.changed', { id: rows[0].band_id });
      return { id: relationId, status: 'ended' };
    });
  }

  async similar(organizationId, executor = realmConnector) {
    const { rows } = await executor.execute(`
      SELECT ${summarySql} FROM organization_similar s JOIN organizations o ON o.id = s.similar_id AND o.is_deleted = FALSE
      WHERE s.organization_id = $1 ORDER BY s.position, o.name`, [organizationId]);
    return rows.map(organizationSummary);
  }

  async setSimilar(organizationId, userId, bandIds) {
    return realmConnector.transaction(async executor => {
      const { organization } = await organizationRepository.requireMember(executor, organizationId, userId, 'manage_profile', { lock: true });
      if (organization.kind !== 'band') throw requestError(409, 'BAND_REQUIRED', 'Only bands list similar bands');
      const ids = [...new Set(bandIds.map(id => id.toLowerCase()))];
      if (ids.length > LIMITS.similar) throw requestError(400, 'VALIDATION_ERROR', `Choose at most ${LIMITS.similar} similar bands`);
      if (ids.includes(organizationId.toLowerCase())) throw requestError(400, 'VALIDATION_ERROR', 'A band cannot be similar to itself');
      const { rows: [valid] } = await executor.execute(`
        SELECT COUNT(*)::int AS count FROM organizations WHERE id = ANY($1::uuid[]) AND kind = 'band' AND is_deleted = FALSE`, [ids]);
      if (valid.count !== ids.length) throw requestError(400, 'BAND_NOT_FOUND', 'Choose existing bands');
      await executor.execute('DELETE FROM organization_similar WHERE organization_id = $1', [organizationId]);
      for (const [position, id] of ids.entries()) {
        await executor.execute('INSERT INTO organization_similar (organization_id, similar_id, position) VALUES ($1, $2, $3)', [organizationId, id, position]);
      }
      await publishEvent(executor, 'organizations.changed', { id: organizationId });
      return this.similar(organizationId, executor);
    });
  }

  // Candidate bands share a genre, a current or former member, or a nearby
  // location; the score itself is computed by `similarityScore`.
  async suggestions(organizationId, limit = 6) {
    const { rows: [band] } = await realmConnector.execute(
      "SELECT id, city, latitude, longitude FROM organizations WHERE id = $1 AND kind = 'band' AND is_deleted = FALSE", [organizationId]);
    if (!band) throw requestError(404, 'BAND_NOT_FOUND', 'Band not found');
    const { rows } = await realmConnector.execute(`
      WITH mine AS (SELECT genre_id FROM organization_genres WHERE organization_id = $1),
        people AS (SELECT DISTINCT user_id FROM organization_members WHERE organization_id = $1 AND status IN ('active', 'left', 'removed'))
      SELECT ${summarySql}, o.latitude, o.longitude,
        (SELECT COUNT(*) FROM organization_genres g WHERE g.organization_id = o.id AND g.genre_id IN (SELECT genre_id FROM mine))::int AS shared_genres,
        (SELECT COUNT(DISTINCT m.user_id) FROM organization_members m WHERE m.organization_id = o.id
          AND m.status IN ('active', 'left', 'removed') AND m.user_id IN (SELECT user_id FROM people))::int AS shared_members,
        ($2::text IS NOT NULL AND lower(o.city) = lower($2)) AS same_city
      FROM organizations o
      WHERE o.kind = 'band' AND o.is_deleted = FALSE AND o.id <> $1
        AND NOT EXISTS(SELECT 1 FROM organization_similar s WHERE s.organization_id = $1 AND s.similar_id = o.id)
        AND (EXISTS(SELECT 1 FROM organization_genres g WHERE g.organization_id = o.id AND g.genre_id IN (SELECT genre_id FROM mine))
          OR EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id = o.id AND m.user_id IN (SELECT user_id FROM people)
            AND m.status IN ('active', 'left', 'removed'))
          OR ($2::text IS NOT NULL AND lower(o.city) = lower($2))
          OR ($3::numeric IS NOT NULL AND o.latitude BETWEEN $3::numeric - 2 AND $3::numeric + 2
            AND o.longitude BETWEEN $4::numeric - 3 AND $4::numeric + 3))
      ORDER BY o.created_at DESC LIMIT 200`, [organizationId, band.city, band.latitude, band.longitude]);
    const origin = { latitude: Number(band.latitude ?? NaN), longitude: Number(band.longitude ?? NaN) };
    return rows.map(row => {
      const target = { latitude: Number(row.latitude ?? NaN), longitude: Number(row.longitude ?? NaN) };
      const scored = similarityScore({
        sharedGenres: row.shared_genres, sharedMembers: row.shared_members, sameCity: row.same_city, distance: distanceKm(origin, target),
      });
      return { ...organizationSummary(row), score: scored.score, reasons: scored.reasons };
    }).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  async extras(organization, executor = realmConnector) {
    return {
      releases: organization.kind === 'band' ? await this.releases(organization.id, executor) : [],
      relations: await this.relations(organization.id, executor),
      similar: organization.kind === 'band' ? await this.similar(organization.id, executor) : [],
    };
  }
}

export const organizationContentRepository = new OrganizationContentRepository();
