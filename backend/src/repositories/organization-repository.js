import { realmConnector } from './realm-connector.js';
import { publishEvent, publishAdminEvent } from './event-publisher.js';
import { notificationRepository } from './notification-repository.js';
import { entitlementRepository } from './entitlement-repository.js';
import { requestError } from '../engines/request-error.js';
import {
  BUSINESS_KINDS, LIMITS, MEMBER_PERMISSIONS, effectivePermissions, hasPermission,
} from '../engines/organization-model.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUMNS = {
  name: 'name', slug: 'slug', bio: 'bio', pictureUrl: 'picture_url', city: 'city', region: 'region', country: 'country',
  latitude: 'latitude', longitude: 'longitude', contactEmail: 'contact_email', contactPhone: 'contact_phone',
  workWithUs: 'work_with_us', venueType: 'venue_type', capacity: 'capacity', activeSince: 'active_since',
  activeUntil: 'active_until', parkingInfo: 'parking_info', directions: 'directions', formedYear: 'formed_year',
  youtubeChannelId: 'youtube_channel_id',
};
const OPEN_TO_COLUMNS = {
  tours: 'open_to_tours', live: 'open_to_live', supportActs: 'open_to_support_acts', endorsements: 'open_to_endorsements',
};

export const displayName = alias => `COALESCE(NULLIF(${alias}.artist_name, ''), NULLIF(btrim(COALESCE(${alias}.first_name, '') || ' ' || COALESCE(${alias}.last_name, '')), ''), 'Musician')`;

export const summarySql = `
  o.id, o.kind, o.name, o.slug, o.bio, o.picture_url, o.city, o.region, o.country, o.managed,
  o.verified_at, o.created_at,
  (SELECT COUNT(*) FROM organization_followers f WHERE f.organization_id = o.id)::int AS follower_count,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) ORDER BY g.name)
    FROM organization_genres og JOIN genres g ON g.id = og.genre_id WHERE og.organization_id = o.id), '[]'::jsonb) AS genres`;

export function organizationSummary(row) {
  return {
    id: row.id, kind: row.kind, name: row.name, slug: row.slug, bio: row.bio, pictureUrl: row.picture_url,
    location: { city: row.city, region: row.region, country: row.country },
    managed: row.managed, verified: Boolean(row.verified_at), verifiedAt: row.verified_at,
    followerCount: row.follower_count ?? 0, genres: row.genres ?? [], createdAt: row.created_at,
  };
}

function number(value) {
  return value === null || value === undefined ? null : Number(value);
}

function memberView(row) {
  return {
    memberId: row.id, userId: row.user_id, name: row.member_name, pictureUrl: row.member_picture_url, role: row.role, status: row.status,
    title: row.title, joinedOn: row.joined_on, leftOn: row.left_on,
  };
}

function conflict(error, code, message) {
  if (error?.code === '23505') throw requestError(409, code, message);
  throw error;
}

class OrganizationRepository {
  async membership(executor, organizationId, userId, { lock = false } = {}) {
    if (!UUID.test(organizationId)) return null;
    const { rows } = await executor.execute(`
      SELECT o.id, o.kind, o.name, o.slug, o.managed, o.created_by,
        m.id AS member_id, m.role, m.permissions, m.title
      FROM organizations o
      LEFT JOIN organization_members m ON m.organization_id = o.id AND m.user_id = $2 AND m.status = 'active'
      WHERE o.id = $1 AND o.is_deleted = FALSE ${lock ? 'FOR UPDATE OF o' : ''}`, [organizationId, userId ?? null]);
    return rows[0] || null;
  }

  // Reusable authorization entry point for every organization feature.
  // Resolves the caller's active membership and throws 404 when the page does
  // not exist or 403 when the caller lacks `permission` (one of
  // MEMBER_PERMISSIONS, or null for "any active member"). Leaders and admins
  // hold every permission. The creator of a community-maintained (unmanaged)
  // venue acts as its sole `maintainer` with `manage_profile` until a claim is
  // approved. Pass `{ lock: true }` to serialize changes on the organization.
  async requireMember(executor, organizationId, userId, permission = null, { lock = false } = {}) {
    if (permission !== null && !MEMBER_PERMISSIONS.includes(permission)) throw new Error(`Unknown organization permission: ${permission}`);
    const row = await this.membership(executor, organizationId, userId, { lock });
    if (!row) throw requestError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found');
    const organization = { id: row.id, kind: row.kind, name: row.name, slug: row.slug, managed: row.managed, createdBy: row.created_by };
    if (!row.member_id && !row.managed && userId && row.created_by === userId && (permission === null || permission === 'manage_profile')) {
      return { organization, memberId: null, role: 'maintainer', permissions: ['manage_profile'] };
    }
    const membership = row.member_id ? { role: row.role, permissions: row.permissions } : null;
    if (!membership || !hasPermission(membership, permission)) {
      throw requestError(403, 'ORGANIZATION_PERMISSION_REQUIRED', 'You do not have permission to do this for this organization');
    }
    return {
      organization, memberId: row.member_id, role: row.role, title: row.title,
      permissions: effectivePermissions(row.role, row.permissions),
    };
  }

  // Active member user IDs holding `permission` (leaders/admins included).
  async managerIds(executor, organizationId, permission = 'manage_profile') {
    const { rows } = await executor.execute(`
      SELECT m.user_id FROM organization_members m JOIN users u ON u.id = m.user_id AND u.is_active AND NOT u.is_deleted
      WHERE m.organization_id = $1 AND m.status = 'active'
        AND (m.role IN ('leader', 'admin') OR $2 = ANY(m.permissions))`, [organizationId, permission]);
    return rows.map(row => row.user_id);
  }

  async followerIds(executor, organizationId, excludeUserIds = []) {
    const { rows } = await executor.execute(`
      SELECT f.user_id FROM organization_followers f
      WHERE f.organization_id = $1 AND NOT (f.user_id = ANY($2::uuid[]))`, [organizationId, excludeUserIds]);
    return rows.map(row => row.user_id);
  }

  async ownedMedia(executor, url, userId) {
    if (url === null || url === undefined) return url;
    const { rows } = await executor.execute(
      "SELECT id FROM media WHERE id = $1 AND user_id = $2 AND purpose = 'organization'",
      [url.slice('/realm/media/'.length), userId],
    );
    if (!rows.length) throw requestError(400, 'INVALID_MEDIA', 'Upload an organization image with this account first');
    return `/realm/media/${rows[0].id}`;
  }

  async assertGenres(executor, genreIds) {
    if (!genreIds?.length) return;
    const { rows } = await executor.execute('SELECT COUNT(*)::int AS count FROM genres WHERE id = ANY($1::uuid[])', [genreIds]);
    if (rows[0].count !== new Set(genreIds.map(id => id.toLowerCase())).size) throw requestError(400, 'INVALID_GENRE', 'Choose genres from the catalog');
  }

  async replaceGenres(executor, organizationId, genreIds) {
    await executor.execute('DELETE FROM organization_genres WHERE organization_id = $1', [organizationId]);
    if (genreIds.length) {
      await executor.execute(`
        INSERT INTO organization_genres (organization_id, genre_id)
        SELECT $1, UNNEST($2::uuid[]) ON CONFLICT DO NOTHING`, [organizationId, genreIds]);
    }
  }

  async replaceLinks(executor, organizationId, links) {
    await executor.execute('DELETE FROM organization_links WHERE organization_id = $1', [organizationId]);
    for (const [position, link] of links.entries()) {
      await executor.execute('INSERT INTO organization_links (organization_id, link_type, url, position) VALUES ($1, $2, $3, $4)',
        [organizationId, link.linkType, link.url, position]);
    }
  }

  async assertSlugAvailable(executor, slug, organizationId = null) {
    if (!slug) return;
    const { rowCount } = await executor.execute('SELECT 1 FROM organizations WHERE slug = $1 AND id IS DISTINCT FROM $2', [slug, organizationId]);
    if (rowCount) throw requestError(409, 'SLUG_TAKEN', 'This page address is already taken');
  }

  async create(userId, input) {
    return realmConnector.transaction(async executor => {
      const managed = input.kind !== 'venue' || input.managed !== false;
      if (!managed && input.kind !== 'venue') throw requestError(400, 'VALIDATION_ERROR', 'Only venues can be community-maintained');
      await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (managed && BUSINESS_KINDS.includes(input.kind)) await entitlementRepository.requireLimit(userId, 'businessPages', 0, executor);
      const { rows: [count] } = await executor.execute(
        'SELECT COUNT(*)::int AS count FROM organizations WHERE created_by = $1 AND is_deleted = FALSE', [userId]);
      if (count.count >= LIMITS.ledOrganizations) {
        throw requestError(403, 'ORGANIZATION_LIMIT', `You can create at most ${LIMITS.ledOrganizations} pages`);
      }
      await this.assertSlugAvailable(executor, input.slug);
      await this.assertGenres(executor, input.genreIds);
      const pictureUrl = await this.ownedMedia(executor, input.pictureUrl, userId);
      const entries = Object.entries(COLUMNS).filter(([key]) => input[key] !== undefined && key !== 'pictureUrl');
      const openTo = Object.entries(OPEN_TO_COLUMNS).filter(([key]) => input.openTo?.[key] !== undefined);
      const columns = ['kind', 'managed', 'created_by', 'picture_url', ...entries.map(([, column]) => column), ...openTo.map(([, column]) => column)];
      const values = [input.kind, managed, userId, pictureUrl ?? null, ...entries.map(([key]) => input[key]), ...openTo.map(([key]) => input.openTo[key])];
      if (input.youtubeChannelId) { columns.push('youtube_linked_at'); values.push(new Date()); }
      let id;
      try {
        ({ rows: [{ id }] } = await executor.execute(`
          INSERT INTO organizations (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
          RETURNING id`, values));
      } catch (error) { conflict(error, 'SLUG_TAKEN', 'This page address is already taken'); }
      if (input.genreIds?.length) await this.replaceGenres(executor, id, input.genreIds);
      if (input.links?.length) await this.replaceLinks(executor, id, input.links);
      if (managed) {
        await executor.execute(`
          INSERT INTO organization_members (organization_id, user_id, role, status, title, joined_on)
          VALUES ($1, $2, 'leader', 'active', $3, CURRENT_DATE)`, [id, userId, input.title ?? null]);
      }
      await publishEvent(executor, 'organizations.changed', { id });
      return { id };
    });
  }

  async update(organizationId, userId, input) {
    return realmConnector.transaction(async executor => {
      await this.requireMember(executor, organizationId, userId, 'manage_profile', { lock: true });
      const { rows: [current] } = await executor.execute('SELECT * FROM organizations WHERE id = $1', [organizationId]);
      await this.assertSlugAvailable(executor, input.slug, organizationId);
      await this.assertGenres(executor, input.genreIds);
      const changes = Object.entries(COLUMNS).filter(([key]) => input[key] !== undefined).map(([key, column]) => [column, input[key]]);
      for (const [key, column] of Object.entries(OPEN_TO_COLUMNS)) if (input.openTo?.[key] !== undefined) changes.push([column, input.openTo[key]]);
      const picture = changes.find(([column]) => column === 'picture_url');
      if (picture && picture[1] !== null && picture[1] !== current.picture_url) picture[1] = await this.ownedMedia(executor, picture[1], userId);
      if (input.youtubeChannelId !== undefined && input.youtubeChannelId !== current.youtube_channel_id) {
        changes.push(['youtube_linked_at', input.youtubeChannelId ? new Date() : null], ['feed_checked_at', null]);
      }
      if (changes.length) {
        try {
          await executor.execute(`
            UPDATE organizations SET ${changes.map(([column], i) => `${column} = $${i + 2}`).join(', ')}, updated_at = NOW()
            WHERE id = $1`, [organizationId, ...changes.map(([, value]) => value)]);
        } catch (error) { conflict(error, 'SLUG_TAKEN', 'This page address is already taken'); }
      }
      if (input.genreIds !== undefined) await this.replaceGenres(executor, organizationId, input.genreIds);
      if (input.links !== undefined) await this.replaceLinks(executor, organizationId, input.links);
      await publishEvent(executor, 'organizations.changed', { id: organizationId });
      return { id: organizationId };
    });
  }

  async remove(organizationId, userId) {
    return realmConnector.transaction(async executor => {
      const access = await this.requireMember(executor, organizationId, userId, 'manage_profile', { lock: true });
      if (!['leader', 'maintainer'].includes(access.role)) throw requestError(403, 'LEADER_REQUIRED', 'Only the leader can delete this page');
      await executor.execute('UPDATE organizations SET is_deleted = TRUE, slug = NULL, updated_at = NOW() WHERE id = $1', [organizationId]);
      await executor.execute(`
        UPDATE organization_relations SET status = 'ended', responded_at = NOW()
        WHERE (organization_id = $1 OR band_id = $1) AND status IN ('pending', 'accepted')`, [organizationId]);
      await executor.execute("UPDATE organization_claims SET status = 'rejected', reviewed_at = NOW(), review_note = 'Page deleted' WHERE organization_id = $1 AND status = 'pending'", [organizationId]);
      await publishEvent(executor, 'organizations.changed', { id: organizationId });
    });
  }

  async kindOf(organizationId) {
    const { rows } = await realmConnector.execute('SELECT kind FROM organizations WHERE id = $1 AND is_deleted = FALSE', [organizationId]);
    if (!rows.length) throw requestError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found');
    return rows[0].kind;
  }

  async resolveId(executor, reference) {
    const { rows } = await executor.execute(`
      SELECT id FROM organizations WHERE is_deleted = FALSE AND ${UUID.test(reference) ? 'id = $1' : 'slug = $1'}`,
    [UUID.test(reference) ? reference.toLowerCase() : reference]);
    if (!rows.length) throw requestError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found');
    return rows[0].id;
  }

  async detail(reference, viewerId, executor = realmConnector) {
    const id = await this.resolveId(executor, reference);
    const { rows: [row] } = await executor.execute(`
      SELECT o.*, ${summarySql},
        EXISTS(SELECT 1 FROM organization_followers f WHERE f.organization_id = o.id AND f.user_id = $2) AS is_following,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('linkType', l.link_type, 'url', l.url) ORDER BY l.position, l.id)
          FROM organization_links l WHERE l.organization_id = o.id), '[]'::jsonb) AS links,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id', ph.id, 'url', ph.url, 'category', ph.category, 'caption', ph.caption)
          ORDER BY ph.created_at, ph.id) FROM organization_photos ph WHERE ph.organization_id = o.id), '[]'::jsonb) AS photos,
        (SELECT ${displayName('p')} FROM profiles p WHERE p.user_id = o.created_by) AS creator_name
      FROM organizations o WHERE o.id = $1`, [id, viewerId ?? null]);
    const { rows: members } = await executor.execute(`
      SELECT m.id, m.user_id, m.role, m.status, m.title, to_char(m.joined_on, 'YYYY-MM-DD') AS joined_on,
        to_char(m.left_on, 'YYYY-MM-DD') AS left_on, ${displayName('p')} AS member_name, p.profile_picture_url AS member_picture_url
      FROM organization_members m JOIN users u ON u.id = m.user_id AND u.is_active AND NOT u.is_deleted
      LEFT JOIN profiles p ON p.user_id = m.user_id
      WHERE m.organization_id = $1 AND m.status IN ('active', 'left', 'removed')
      ORDER BY m.status = 'active' DESC, CASE m.role WHEN 'leader' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
        m.joined_on NULLS LAST, m.created_at, m.id`, [id]);
    const { rows: viewerRows } = viewerId ? await executor.execute(`
      SELECT role, status, permissions, title FROM organization_members
      WHERE organization_id = $1 AND user_id = $2 AND status IN ('active', 'invited')`, [id, viewerId]) : { rows: [] };
    const { rows: claims } = viewerId && !row.managed ? await executor.execute(`
      SELECT id, status, created_at FROM organization_claims WHERE organization_id = $1 AND user_id = $2
      ORDER BY created_at DESC LIMIT 1`, [id, viewerId]) : { rows: [] };
    const viewer = viewerRows.find(item => item.status === 'active');
    const maintainer = !row.managed && viewerId && row.created_by === viewerId;
    const latitude = number(row.latitude);
    const longitude = number(row.longitude);
    return {
      ...organizationSummary(row),
      contacts: { email: row.contact_email, phone: row.contact_phone },
      workWithUs: row.work_with_us,
      coordinates: latitude === null || longitude === null ? null : { latitude, longitude },
      venue: row.kind === 'venue' ? {
        type: row.venue_type, capacity: row.capacity, activeSince: row.active_since, activeUntil: row.active_until,
        parkingInfo: row.parking_info, directions: row.directions,
      } : null,
      band: row.kind === 'band' ? {
        formedYear: row.formed_year, youtubeChannelId: row.youtube_channel_id,
        openTo: { tours: row.open_to_tours, live: row.open_to_live, supportActs: row.open_to_support_acts, endorsements: row.open_to_endorsements },
      } : null,
      activeSince: row.active_since, activeUntil: row.active_until,
      links: row.links, photos: row.photos,
      createdBy: row.managed ? null : row.created_by,
      creatorName: row.managed ? null : row.creator_name,
      reportUserId: row.managed ? members.find(member => member.role === 'leader' && member.status === 'active')?.user_id ?? null : row.created_by,
      isFollowing: row.is_following,
      members: members.filter(member => member.status === 'active').map(memberView),
      history: members.filter(member => member.status !== 'active').map(memberView),
      viewer: {
        role: viewer?.role ?? (maintainer ? 'maintainer' : null),
        permissions: viewer ? effectivePermissions(viewer.role, viewer.permissions) : maintainer ? ['manage_profile'] : [],
        invited: viewerRows.some(item => item.status === 'invited'),
        claim: claims[0] ? { id: claims[0].id, status: claims[0].status, createdAt: claims[0].created_at } : null,
      },
    };
  }

  async search({ kind, q, genreId, location, sort = 'newest' }, { page, pageSize }) {
    const conditions = ['o.is_deleted = FALSE'];
    const values = [];
    const add = value => { values.push(value); return `$${values.length}`; };
    if (kind) conditions.push(`o.kind = ${add(kind)}`);
    if (q) conditions.push(`(o.name ILIKE ${add(`%${q}%`)} OR COALESCE(o.bio, '') ILIKE $${values.length})`);
    if (location) {
      conditions.push(`(COALESCE(o.city, '') || ' ' || COALESCE(o.region, '') || ' ' || COALESCE(o.country, '')) ILIKE ${add(`%${location}%`)}`);
    }
    if (genreId) conditions.push(`EXISTS(SELECT 1 FROM organization_genres og WHERE og.organization_id = o.id AND og.genre_id = ${add(genreId)})`);
    const order = { newest: 'o.created_at DESC', name: 'lower(o.name) ASC', followers: 'follower_count DESC' }[sort] || 'o.created_at DESC';
    const { rows } = await realmConnector.execute(`
      SELECT ${summarySql} FROM organizations o WHERE ${conditions.join(' AND ')}
      ORDER BY ${order}, o.id LIMIT ${add(pageSize + 1)} OFFSET ${add((page - 1) * pageSize)}`, values);
    return rows.map(organizationSummary);
  }

  async mine(userId) {
    const { rows } = await realmConnector.execute(`
      SELECT ${summarySql}, m.role, m.permissions, m.title,
        (SELECT COUNT(*) FROM organization_members i WHERE i.organization_id = o.id AND i.status = 'invited')::int AS pending_invitations,
        (SELECT COUNT(*) FROM organization_relations r WHERE r.band_id = o.id AND r.status = 'pending')::int AS pending_relations
      FROM organizations o
      LEFT JOIN organization_members m ON m.organization_id = o.id AND m.user_id = $1 AND m.status = 'active'
      WHERE o.is_deleted = FALSE AND (m.id IS NOT NULL OR (o.managed = FALSE AND o.created_by = $1))
      ORDER BY lower(o.name), o.id`, [userId]);
    return rows.map(row => ({
      ...organizationSummary(row),
      role: row.role ?? 'maintainer', title: row.title,
      permissions: row.role ? effectivePermissions(row.role, row.permissions) : ['manage_profile'],
      pendingInvitations: row.pending_invitations, pendingRelations: row.pending_relations,
    }));
  }

  async invitations(userId) {
    const { rows } = await realmConnector.execute(`
      SELECT ${summarySql}, m.role, m.title, m.created_at AS invited_at, ${displayName('p')} AS inviter_name
      FROM organization_members m JOIN organizations o ON o.id = m.organization_id AND o.is_deleted = FALSE
      LEFT JOIN profiles p ON p.user_id = m.invited_by
      WHERE m.user_id = $1 AND m.status = 'invited' ORDER BY m.created_at DESC, m.id`, [userId]);
    return rows.map(row => ({
      organization: organizationSummary(row), role: row.role, title: row.title, invitedAt: row.invited_at, inviterName: row.inviter_name,
    }));
  }

  async members(organizationId, userId) {
    return realmConnector.transaction(async executor => {
      await this.requireMember(executor, organizationId, userId, null);
      const { rows } = await executor.execute(`
        SELECT m.id, m.user_id, m.role, m.status, m.title, m.permissions, to_char(m.joined_on, 'YYYY-MM-DD') AS joined_on,
          to_char(m.left_on, 'YYYY-MM-DD') AS left_on, ${displayName('p')} AS member_name, p.profile_picture_url AS member_picture_url
        FROM organization_members m JOIN users u ON u.id = m.user_id AND u.is_active AND NOT u.is_deleted
        LEFT JOIN profiles p ON p.user_id = m.user_id
        WHERE m.organization_id = $1 AND m.status IN ('invited', 'active', 'left', 'removed')
        ORDER BY CASE m.status WHEN 'active' THEN 0 WHEN 'invited' THEN 1 ELSE 2 END,
          CASE m.role WHEN 'leader' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.joined_on NULLS LAST, m.created_at, m.id`, [organizationId]);
      return rows.map(row => ({ ...memberView(row), permissions: effectivePermissions(row.role, row.permissions) }));
    });
  }

  async invite(organizationId, actorId, { userId, role = 'member', title = null, permissions = [] }) {
    return realmConnector.transaction(async executor => {
      const access = await this.requireMember(executor, organizationId, actorId, 'manage_members', { lock: true });
      if (!access.organization.managed) throw requestError(409, 'ORGANIZATION_UNMANAGED', 'Claim this venue before adding members');
      if (role === 'admin' && access.role !== 'leader') throw requestError(403, 'LEADER_REQUIRED', 'Only the leader can invite administrators');
      if (permissions.length && !['leader', 'admin'].includes(access.role)) {
        throw requestError(403, 'ORGANIZATION_PERMISSION_REQUIRED', 'Only the leader or an administrator can grant permissions');
      }
      const { rowCount } = await executor.execute(
        'SELECT 1 FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = $1 AND u.is_active AND NOT u.is_deleted', [userId]);
      if (!rowCount) throw requestError(404, 'ACCOUNT_NOT_FOUND', 'Choose an existing musician');
      const { rows: pending } = await executor.execute(`
        SELECT COUNT(*)::int AS count FROM organization_members WHERE organization_id = $1 AND status = 'invited'`, [organizationId]);
      if (pending[0].count >= 50) throw requestError(429, 'INVITATION_LIMIT', 'Resolve pending invitations before sending more');
      try {
        await executor.execute(`
          INSERT INTO organization_members (organization_id, user_id, role, status, title, permissions, invited_by)
          VALUES ($1, $2, $3, 'invited', $4, $5, $6)`, [organizationId, userId, role, title, role === 'member' ? permissions : [], actorId]);
      } catch (error) { conflict(error, 'MEMBER_EXISTS', 'This person is already a member or has a pending invitation'); }
      const name = access.organization.name;
      await notificationRepository.create(executor, {
        userId, kind: 'organization_invitation', title: `You were invited to join ${name}`, link: '#your-pages',
        key: `organization-invitation:${organizationId}:${userId}:${Date.now()}`,
        params: { organizationId, organizationName: name, organizationKind: access.organization.kind, role },
      });
      await publishEvent(executor, 'organizations.changed', { userId });
      await publishEvent(executor, 'organizations.changed', { id: organizationId });
      return { userId, status: 'invited' };
    });
  }

  async respondToInvitation(organizationId, userId, accept) {
    return realmConnector.transaction(async executor => {
      const { rows } = await executor.execute(`
        SELECT m.id, m.invited_by, o.name, o.kind FROM organization_members m
        JOIN organizations o ON o.id = m.organization_id AND o.is_deleted = FALSE
        WHERE m.organization_id = $1 AND m.user_id = $2 AND m.status = 'invited' FOR UPDATE OF m`, [organizationId, userId]);
      if (!rows.length) throw requestError(404, 'INVITATION_NOT_FOUND', 'Invitation not found');
      await executor.execute(`
        UPDATE organization_members SET status = $2, joined_on = CASE WHEN $2 = 'active' THEN COALESCE(joined_on, CURRENT_DATE) END,
          updated_at = NOW() WHERE id = $1`, [rows[0].id, accept ? 'active' : 'declined']);
      if (rows[0].invited_by && rows[0].invited_by !== userId) {
        const { rows: [person] } = await executor.execute(`SELECT ${displayName('p')} AS name FROM profiles p WHERE p.user_id = $1`, [userId]);
        await notificationRepository.create(executor, {
          userId: rows[0].invited_by, kind: 'organization_membership',
          title: `${person?.name ?? 'A musician'} ${accept ? 'accepted' : 'declined'} your invitation to ${rows[0].name}`,
          link: `#organization?id=${organizationId}`, key: `organization-invitation-response:${rows[0].id}`,
          params: { organizationId, organizationName: rows[0].name, name: person?.name ?? null, response: accept ? 'accepted' : 'declined' },
        });
      }
      await publishEvent(executor, 'organizations.changed', { userId });
      await publishEvent(executor, 'organizations.changed', { id: organizationId });
      return { status: accept ? 'active' : 'declined' };
    });
  }

  // `memberId` selects one membership period; without it the current
  // (active or invited) period is changed.
  async updateMember(organizationId, actorId, targetId, { memberId = null, ...changes }) {
    return realmConnector.transaction(async executor => {
      const self = actorId === targetId;
      const titleOnly = Object.keys(changes).every(key => key === 'title');
      const access = await this.requireMember(executor, organizationId, actorId, self && titleOnly && !memberId ? null : 'manage_members', { lock: true });
      const { rows } = await executor.execute(`
        SELECT id, role, status, joined_on, left_on FROM organization_members
        WHERE organization_id = $1 AND user_id = $2
          AND (id = $3 OR ($3::uuid IS NULL AND status IN ('active', 'invited')))`, [organizationId, targetId, memberId]);
      const target = rows[0];
      if (!target) throw requestError(404, 'MEMBER_NOT_FOUND', 'Member not found');
      if (!self && access.role !== 'leader' && target.role !== 'member') {
        throw requestError(403, 'LEADER_REQUIRED', 'Only the leader can change the leader or administrators');
      }
      if (changes.role !== undefined) {
        if (access.role !== 'leader') throw requestError(403, 'LEADER_REQUIRED', 'Only the leader can change roles');
        if (target.role === 'leader' || target.status !== 'active') throw requestError(409, 'INVALID_ROLE_CHANGE', 'Transfer leadership instead, or choose an active member');
      }
      if (changes.permissions !== undefined && !['leader', 'admin'].includes(access.role)) {
        throw requestError(403, 'ORGANIZATION_PERMISSION_REQUIRED', 'Only the leader or an administrator can change permissions');
      }
      if (changes.leftOn !== undefined && changes.leftOn !== null && ['active', 'invited'].includes(target.status)) {
        throw requestError(409, 'MEMBER_ACTIVE', 'Only former members have an end date');
      }
      const updates = [];
      if (changes.title !== undefined) updates.push(['title', changes.title]);
      if (changes.role !== undefined) updates.push(['role', changes.role]);
      if (changes.permissions !== undefined) updates.push(['permissions', changes.permissions]);
      if (changes.joinedOn !== undefined) updates.push(['joined_on', changes.joinedOn]);
      if (changes.leftOn !== undefined) updates.push(['left_on', changes.leftOn]);
      if (updates.length) {
        try {
          await executor.execute(`
            UPDATE organization_members SET ${updates.map(([column], i) => `${column} = $${i + 2}`).join(', ')}, updated_at = NOW()
            WHERE id = $1`, [target.id, ...updates.map(([, value]) => value)]);
        } catch (error) {
          if (error.code === '23514') throw requestError(400, 'INVALID_TIMELINE', 'The end date must be on or after the start date');
          throw error;
        }
      }
      await publishEvent(executor, 'organizations.changed', { id: organizationId });
      return { userId: targetId };
    });
  }

  async removeMember(organizationId, actorId, targetId) {
    return realmConnector.transaction(async executor => {
      const self = actorId === targetId;
      const access = await this.requireMember(executor, organizationId, actorId, self ? null : 'manage_members', { lock: true });
      const { rows } = await executor.execute(`
        SELECT id, role, status FROM organization_members
        WHERE organization_id = $1 AND user_id = $2 AND status IN ('active', 'invited')`, [organizationId, targetId]);
      const target = rows[0];
      if (!target) throw requestError(404, 'MEMBER_NOT_FOUND', 'Member not found');
      if (target.role === 'leader') throw requestError(409, 'LEADER_MUST_TRANSFER', 'Transfer leadership before the leader leaves');
      if (!self && target.role === 'admin' && access.role !== 'leader') throw requestError(403, 'LEADER_REQUIRED', 'Only the leader can remove administrators');
      if (target.status === 'invited') {
        await executor.execute('DELETE FROM organization_members WHERE id = $1', [target.id]);
      } else {
        await executor.execute(`
          UPDATE organization_members SET status = $2, left_on = GREATEST(CURRENT_DATE, COALESCE(joined_on, CURRENT_DATE)), updated_at = NOW()
          WHERE id = $1`, [target.id, self ? 'left' : 'removed']);
        if (!self) {
          await notificationRepository.create(executor, {
            userId: targetId, kind: 'organization_membership', title: `You are no longer a member of ${access.organization.name}`,
            link: `#organization?id=${organizationId}`, key: `organization-removed:${target.id}`,
            params: { organizationId, organizationName: access.organization.name, change: 'removed' },
          });
        }
      }
      await publishEvent(executor, 'organizations.changed', { userId: targetId });
      await publishEvent(executor, 'organizations.changed', { id: organizationId });
      return { userId: targetId };
    });
  }

  async transferLeadership(organizationId, actorId, targetId) {
    if (actorId === targetId) throw requestError(400, 'INVALID_TRANSFER', 'Choose another active member');
    return realmConnector.transaction(async executor => {
      const access = await this.requireMember(executor, organizationId, actorId, null, { lock: true });
      if (access.role !== 'leader') throw requestError(403, 'LEADER_REQUIRED', 'Only the leader can transfer leadership');
      const { rowCount } = await executor.execute(`
        SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active'`, [organizationId, targetId]);
      if (!rowCount) throw requestError(404, 'MEMBER_NOT_FOUND', 'Choose an active member');
      await executor.execute(`UPDATE organization_members SET role = 'admin', updated_at = NOW() WHERE id = $1`, [access.memberId]);
      await executor.execute(`
        UPDATE organization_members SET role = 'leader', permissions = '{}', updated_at = NOW()
        WHERE organization_id = $1 AND user_id = $2 AND status = 'active'`, [organizationId, targetId]);
      await notificationRepository.create(executor, {
        userId: targetId, kind: 'organization_membership', title: `You are now the leader of ${access.organization.name}`,
        link: `#organization?id=${organizationId}`, key: `organization-leader:${organizationId}:${targetId}:${Date.now()}`,
        params: { organizationId, organizationName: access.organization.name, change: 'leader' },
      });
      await publishEvent(executor, 'organizations.changed', { id: organizationId });
      return { leaderId: targetId };
    });
  }

  async addPhoto(organizationId, userId, { url, category, caption = null }) {
    return realmConnector.transaction(async executor => {
      await this.requireMember(executor, organizationId, userId, 'manage_profile', { lock: true });
      const { rows: [count] } = await executor.execute('SELECT COUNT(*)::int AS count FROM organization_photos WHERE organization_id = $1', [organizationId]);
      if (count.count >= LIMITS.photos) throw requestError(409, 'PHOTO_LIMIT', `A page can show at most ${LIMITS.photos} photos`);
      const owned = await this.ownedMedia(executor, url, userId);
      const { rows } = await executor.execute(`
        INSERT INTO organization_photos (organization_id, url, category, caption, uploaded_by) VALUES ($1, $2, $3, $4, $5)
        RETURNING id, url, category, caption`, [organizationId, owned, category, caption, userId]);
      await publishEvent(executor, 'organizations.changed', { id: organizationId });
      return rows[0];
    });
  }

  async removePhoto(organizationId, userId, photoId) {
    return realmConnector.transaction(async executor => {
      await this.requireMember(executor, organizationId, userId, 'manage_profile');
      const { rowCount } = await executor.execute('DELETE FROM organization_photos WHERE id = $1 AND organization_id = $2', [photoId, organizationId]);
      if (!rowCount) throw requestError(404, 'PHOTO_NOT_FOUND', 'Photo not found');
      await publishEvent(executor, 'organizations.changed', { id: organizationId });
    });
  }

  async follow(organizationId, userId, following) {
    return realmConnector.transaction(async executor => {
      if (!await this.membership(executor, organizationId, userId)) throw requestError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found');
      await executor.execute(following
        ? 'INSERT INTO organization_followers (organization_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING'
        : 'DELETE FROM organization_followers WHERE organization_id = $1 AND user_id = $2', [organizationId, userId]);
      await publishEvent(executor, 'organizations.changed', { id: organizationId });
      return { following };
    });
  }

  async requestClaim(organizationId, userId, message) {
    return realmConnector.transaction(async executor => {
      const row = await this.membership(executor, organizationId, userId, { lock: true });
      if (!row) throw requestError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found');
      if (row.managed) throw requestError(409, 'ORGANIZATION_MANAGED', 'This page is already managed');
      await entitlementRepository.requireLimit(userId, 'businessPages', 0, executor);
      let claim;
      try {
        ({ rows: [claim] } = await executor.execute(`
          INSERT INTO organization_claims (organization_id, user_id, message) VALUES ($1, $2, $3)
          RETURNING id, status, created_at`, [organizationId, userId, message]));
      } catch (error) { conflict(error, 'CLAIM_EXISTS', 'You already have a pending claim for this venue'); }
      await publishAdminEvent(executor);
      await publishEvent(executor, 'organizations.changed', { userId });
      return { id: claim.id, status: claim.status, createdAt: claim.created_at };
    });
  }

  async claims(executor, status, { page, pageSize }) {
    const { rows } = await executor.execute(`
      SELECT c.id, c.status, c.message, c.review_note, c.created_at, c.reviewed_at, c.user_id,
        o.id AS organization_id, o.name AS organization_name, o.city, o.country,
        ${displayName('p')} AS claimant_name
      FROM organization_claims c JOIN organizations o ON o.id = c.organization_id
      LEFT JOIN profiles p ON p.user_id = c.user_id
      WHERE ($1::text IS NULL OR c.status = $1)
      ORDER BY c.created_at ${status === 'pending' ? 'ASC' : 'DESC'}, c.id LIMIT $2 OFFSET $3`,
    [status || null, pageSize + 1, (page - 1) * pageSize]);
    return rows.map(row => ({
      id: row.id, status: row.status, message: row.message, reviewNote: row.review_note, createdAt: row.created_at,
      reviewedAt: row.reviewed_at, claimant: { userId: row.user_id, name: row.claimant_name },
      organization: { id: row.organization_id, name: row.organization_name, city: row.city, country: row.country },
    }));
  }

  async decideClaim(executor, actorId, claimId, { decision, note = null }) {
    const { rows } = await executor.execute(`
      SELECT c.*, o.name, o.managed, o.is_deleted FROM organization_claims c JOIN organizations o ON o.id = c.organization_id
      WHERE c.id = $1 FOR UPDATE OF c, o`, [claimId]);
    const claim = rows[0];
    if (!claim) throw requestError(404, 'CLAIM_NOT_FOUND', 'Claim not found');
    if (claim.status !== 'pending') throw requestError(409, 'CLAIM_REVIEWED', 'This claim was already reviewed');
    const approve = decision === 'approve';
    if (approve && (claim.managed || claim.is_deleted)) throw requestError(409, 'ORGANIZATION_MANAGED', 'This venue is no longer available to claim');
    await executor.execute(`
      UPDATE organization_claims SET status = $2, reviewer_id = $3, review_note = $4, reviewed_at = NOW() WHERE id = $1`,
    [claimId, approve ? 'approved' : 'rejected', actorId, note]);
    const notified = [[claim.user_id, approve ? 'approved' : 'rejected', claimId]];
    if (approve) {
      await executor.execute('UPDATE organizations SET managed = TRUE, updated_at = NOW() WHERE id = $1', [claim.organization_id]);
      await executor.execute(`
        INSERT INTO organization_members (organization_id, user_id, role, status, joined_on)
        VALUES ($1, $2, 'leader', 'active', CURRENT_DATE)`, [claim.organization_id, claim.user_id]);
      const { rows: others } = await executor.execute(`
        UPDATE organization_claims SET status = 'rejected', reviewer_id = $2, review_note = 'Another claim was approved', reviewed_at = NOW()
        WHERE organization_id = $1 AND status = 'pending' RETURNING id, user_id`, [claim.organization_id, actorId]);
      notified.push(...others.map(other => [other.user_id, 'rejected', other.id]));
    }
    for (const [userId, outcome, id] of notified) {
      await notificationRepository.create(executor, {
        userId, kind: 'organization_claim', title: `Your claim for ${claim.name} was ${outcome}`,
        link: `#organization?id=${claim.organization_id}`, key: `organization-claim:${id}`,
        params: { organizationId: claim.organization_id, organizationName: claim.name, outcome },
      });
      await publishEvent(executor, 'organizations.changed', { userId });
    }
    await publishEvent(executor, 'organizations.changed', { id: claim.organization_id });
    await publishAdminEvent(executor);
    return { id: claimId, organizationId: claim.organization_id, status: approve ? 'approved' : 'rejected' };
  }

  async setVerified(executor, actorId, organizationId, verified) {
    const { rows } = await executor.execute(`
      UPDATE organizations SET verified_at = CASE WHEN $2 THEN COALESCE(verified_at, NOW()) END,
        verified_by = CASE WHEN $2 THEN $3::uuid END, updated_at = NOW()
      WHERE id = $1 AND is_deleted = FALSE RETURNING id, verified_at`, [organizationId, verified, actorId]);
    if (!rows.length) throw requestError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found');
    await publishEvent(executor, 'organizations.changed', { id: organizationId });
    return { id: organizationId, verified: Boolean(rows[0].verified_at), verifiedAt: rows[0].verified_at };
  }

  // Announcements keep their author as owner; this only records the page they
  // were published for, after checking `post_announcements` on that page.
  async attachAnnouncement(executor, announcementId, organizationId, userId) {
    if (organizationId) {
      const access = await this.requireMember(executor, organizationId, userId, 'post_announcements');
      if (!access.organization.managed) throw requestError(409, 'ORGANIZATION_UNMANAGED', 'Community-maintained venues cannot publish announcements');
    }
    await executor.execute('UPDATE announcements SET organization_id = $2 WHERE id = $1 AND user_id = $3',
      [announcementId, organizationId || null, userId]);
  }

  async announcementPublished(executor, announcement) {
    if (!announcement.organization_id) return;
    const { rows } = await executor.execute(`
      SELECT f.user_id FROM organization_followers f JOIN organizations o ON o.id = f.organization_id AND o.is_deleted = FALSE
      WHERE f.organization_id = $1 AND f.user_id <> $2
        AND NOT EXISTS(SELECT 1 FROM followers u WHERE u.follower_id = f.user_id AND u.following_id = $2)`,
    [announcement.organization_id, announcement.user_id]);
    const { rows: [organization] } = await executor.execute('SELECT name FROM organizations WHERE id = $1', [announcement.organization_id]);
    await notificationRepository.createMany(executor, rows.map(row => row.user_id), {
      kind: 'organization_update', title: `${organization.name} published an announcement`,
      link: `#announcement?id=${announcement.id}`, keyPrefix: `organization-announcement:${announcement.id}`,
      params: { organizationId: announcement.organization_id, organizationName: organization.name, source: 'announcement', title: announcement.title },
    });
  }

  async announcements(organizationId, { page, pageSize }) {
    const { rows } = await realmConnector.execute(`
      SELECT a.id, a.user_id, a.title, a.description, a.picture_url, a.city, a.state, a.country, a.is_remote,
        a.is_cover_band, a.created_at, a.expires_at, ${displayName('p')} AS creator_name, p.profile_picture_url AS creator_picture_url,
        jsonb_build_object('id', o.id, 'name', o.name, 'kind', o.kind, 'verified', o.verified_at IS NOT NULL) AS organization,
        (SELECT jsonb_agg(jsonb_build_object('instrument_id', ai.instrument_id, 'name', i.name) ORDER BY i.name)
          FROM announcement_instruments ai JOIN instruments i ON i.id = ai.instrument_id WHERE ai.announcement_id = a.id) AS instruments,
        (SELECT jsonb_agg(jsonb_build_object('genre_id', ag.genre_id, 'name', g.name) ORDER BY g.name)
          FROM announcement_genres ag JOIN genres g ON g.id = ag.genre_id WHERE ag.announcement_id = a.id) AS genres
      FROM announcements a JOIN organizations o ON o.id = a.organization_id AND o.is_deleted = FALSE
      JOIN users u ON u.id = a.user_id AND u.is_active AND NOT u.is_deleted
      LEFT JOIN profiles p ON p.user_id = a.user_id
      WHERE a.organization_id = $1 AND a.is_published = TRUE AND a.is_deleted = FALSE
        AND (a.expires_at IS NULL OR a.expires_at > NOW())
      ORDER BY a.created_at DESC, a.id LIMIT $2 OFFSET $3`, [organizationId, pageSize + 1, (page - 1) * pageSize]);
    return rows.map(row => ({
      id: row.id, userId: row.user_id, title: row.title, description: row.description, pictureUrl: row.picture_url,
      location: { city: row.city, state: row.state, country: row.country }, isRemote: row.is_remote, isCoverBand: row.is_cover_band,
      creatorName: row.creator_name, creatorPictureUrl: row.creator_picture_url, organization: row.organization,
      instruments: row.instruments || [], genres: row.genres || [], createdAt: row.created_at, expiresAt: row.expires_at,
    }));
  }

  async userOrganizations(userId) {
    const { rows } = await realmConnector.execute(`
      SELECT ${summarySql}, m.role, m.title, to_char(m.joined_on, 'YYYY-MM-DD') AS joined_on
      FROM organization_members m JOIN organizations o ON o.id = m.organization_id AND o.is_deleted = FALSE
      JOIN users u ON u.id = m.user_id AND u.is_active AND NOT u.is_deleted
      WHERE m.user_id = $1 AND m.status = 'active' ORDER BY lower(o.name), o.id LIMIT 100`, [userId]);
    return rows.map(row => ({ ...organizationSummary(row), role: row.role, title: row.title, joinedOn: row.joined_on }));
  }

  async follows(reference, viewerId) {
    const { rows: [profile] } = await realmConnector.execute(`
      SELECT p.user_id, p.follows_visible FROM profiles p JOIN users u ON u.id = p.user_id AND u.is_active AND NOT u.is_deleted
      WHERE p.user_id = $1 OR p.id = $1 LIMIT 1`, [reference]);
    if (!profile) throw requestError(404, 'PROFILE_NOT_FOUND', 'Profile not found');
    const userId = profile.user_id;
    if (!profile.follows_visible && userId !== viewerId) return { visible: false, artists: [], organizations: [] };
    const { rows: artists } = await realmConnector.execute(`
      SELECT p.user_id, ${displayName('p')} AS name, p.profile_picture_url, p.city, p.account_kind
      FROM followers f JOIN profiles p ON p.user_id = f.following_id JOIN users u ON u.id = f.following_id AND u.is_active AND NOT u.is_deleted
      WHERE f.follower_id = $1 ORDER BY f.created_at DESC, f.id LIMIT 100`, [userId]);
    const { rows: organizations } = await realmConnector.execute(`
      SELECT ${summarySql} FROM organization_followers f JOIN organizations o ON o.id = f.organization_id AND o.is_deleted = FALSE
      WHERE f.user_id = $1 ORDER BY f.created_at DESC, o.id LIMIT 100`, [userId]);
    return {
      visible: profile.follows_visible,
      artists: artists.map(row => ({ userId: row.user_id, name: row.name, pictureUrl: row.profile_picture_url, city: row.city, accountKind: row.account_kind })),
      organizations: organizations.map(organizationSummary),
    };
  }

  async followVisibility(userId) {
    const { rows } = await realmConnector.execute('SELECT follows_visible FROM profiles WHERE user_id = $1', [userId]);
    if (!rows.length) throw requestError(404, 'PROFILE_NOT_FOUND', 'Profile not found');
    return { visible: rows[0].follows_visible };
  }

  async setFollowVisibility(userId, visible) {
    return realmConnector.transaction(async executor => {
      const { rows } = await executor.execute('UPDATE profiles SET follows_visible = $2 WHERE user_id = $1 RETURNING follows_visible', [userId, visible]);
      if (!rows.length) throw requestError(404, 'PROFILE_NOT_FOUND', 'Profile not found');
      await publishEvent(executor, 'profiles.changed', { id: userId });
      return { visible: rows[0].follows_visible };
    });
  }
}

export const organizationRepository = new OrganizationRepository();
