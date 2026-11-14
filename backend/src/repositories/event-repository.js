import { realmConnector } from './realm-connector.js';
import { publishEvent } from './event-publisher.js';
import { notificationRepository } from './notification-repository.js';
import { organizationRepository, displayName } from './organization-repository.js';
import { joinedPlace, placeJoinColumns } from './place-repository.js';
import { requestError } from '../engines/request-error.js';
import { binder, proximity } from '../engines/geo.js';
import { openStreetMapLinks } from '../engines/organization-model.js';
import {
  DEFAULT_DURATION_HOURS, LIMITS, ORGANIZER_KINDS, effectiveStatus, eventInputErrors, googleCalendarUrl, reminderOffsetsError,
  ticketsSoldPercent, utcToZoned, zonedToUtc,
} from '../engines/event-model.js';

const notFound = () => requestError(404, 'EVENT_NOT_FOUND', 'Event not found');

export const endSql = alias => `COALESCE(${alias}.ends_at, ${alias}.starts_at + make_interval(hours => ${DEFAULT_DURATION_HOURS}))`;

// Anyone may see a published event unless its owning account is suspended or
// deleted. Keep in sync with media-references.js.
export const VISIBLE_EVENT = `e.visibility = 'published' AND (e.owner_user_id IS NULL OR EXISTS(
  SELECT 1 FROM users ou WHERE ou.id = e.owner_user_id AND ou.is_active AND NOT ou.is_deleted))`;

// SQL boolean: `user` may edit event `alias`, either as its owner or as an
// active member with manage_calendar (leaders and admins hold it) of one of its
// organizers. Mirrors organizationRepository.requireMember(..., 'manage_calendar').
export const editorSql = (alias, user) => `COALESCE(${alias}.owner_user_id = ${user} OR EXISTS(
  SELECT 1 FROM event_organizers eo JOIN organizations o ON o.id = eo.organization_id AND o.is_deleted = FALSE
  JOIN organization_members m ON m.organization_id = o.id AND m.status = 'active' AND m.user_id = ${user}
  WHERE eo.event_id = ${alias}.id AND (m.role IN ('leader', 'admin') OR 'manage_calendar' = ANY(m.permissions))), FALSE)`;

const latitudeSql = 'COALESCE(e.latitude, v.latitude::float8, pl.latitude)';
const longitudeSql = 'COALESCE(e.longitude, v.longitude::float8, pl.longitude)';

const columns = viewer => `
  e.*, ${endSql('e')} AS effective_end, ${latitudeSql} AS effective_latitude, ${longitudeSql} AS effective_longitude,
  ${placeJoinColumns('pl')},
  v.name AS venue_name, v.slug AS venue_slug, v.verified_at AS venue_verified_at, v.picture_url AS venue_picture_url, v.city AS venue_city,
  CASE WHEN e.owner_user_id IS NOT NULL THEN ${displayName('op')} END AS owner_name,
  op.profile_picture_url AS owner_picture_url, op.verified_at AS owner_verified_at,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'kind', o.kind, 'slug', o.slug,
      'verified', o.verified_at IS NOT NULL, 'pictureUrl', o.picture_url) ORDER BY eo.position, o.name)
    FROM event_organizers eo JOIN organizations o ON o.id = eo.organization_id AND o.is_deleted = FALSE
    WHERE eo.event_id = e.id), '[]'::jsonb) AS organizers,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'role', l.role, 'position', l.position,
      'bandId', b.id, 'bandName', b.name, 'bandSlug', b.slug, 'bandVerified', b.verified_at IS NOT NULL, 'bandPictureUrl', b.picture_url,
      'artistId', au.id, 'artistName', CASE WHEN au.id IS NOT NULL THEN ${displayName('ap')} END,
      'artistPictureUrl', ap.profile_picture_url, 'artistVerifiedAt', ap.verified_at,
      'name', l.name, 'setStartsAt', l.set_starts_at, 'setEndsAt', l.set_ends_at) ORDER BY l.position)
    FROM event_lineup l
    LEFT JOIN organizations b ON b.id = l.band_id AND b.is_deleted = FALSE
    LEFT JOIN users au ON au.id = l.artist_user_id AND au.is_active AND NOT au.is_deleted
    LEFT JOIN profiles ap ON ap.user_id = au.id
    WHERE l.event_id = e.id AND (l.band_id IS NULL OR b.id IS NOT NULL) AND (l.artist_user_id IS NULL OR au.id IS NOT NULL)), '[]'::jsonb) AS lineup,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) ORDER BY g.name)
    FROM event_genres eg JOIN genres g ON g.id = eg.genre_id WHERE eg.event_id = e.id), '[]'::jsonb) AS genres,
  COALESCE((SELECT jsonb_agg('/realm/media/' || ei.media_id ORDER BY ei.position) FROM event_images ei WHERE ei.event_id = e.id), '[]'::jsonb) AS images,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('label', t.label, 'url', t.url) ORDER BY t.position)
    FROM event_ticket_links t WHERE t.event_id = e.id), '[]'::jsonb) AS ticket_links,
  (SELECT COUNT(*) FROM event_attendees a WHERE a.event_id = e.id AND a.status = 'going')::int AS going_count,
  (SELECT COUNT(*) FROM event_attendees a WHERE a.event_id = e.id AND a.status = 'interested')::int AS interested_count,
  (SELECT a.status FROM event_attendees a WHERE a.event_id = e.id AND a.user_id = ${viewer}::uuid) AS viewer_attendance,
  (SELECT a.show_on_profile FROM event_attendees a WHERE a.event_id = e.id AND a.user_id = ${viewer}::uuid) AS viewer_show_on_profile,
  ${editorSql('e', `${viewer}::uuid`)} AS viewer_can_edit`;

const source = `events e LEFT JOIN places pl ON pl.id = e.place_id
  LEFT JOIN organizations v ON v.id = e.venue_id AND v.is_deleted = FALSE
  LEFT JOIN profiles op ON op.user_id = e.owner_user_id`;

const iso = value => (value ? new Date(value).toISOString() : null);

function lineupView(entry, timeZone) {
  return {
    id: entry.id, role: entry.role, position: entry.position,
    name: entry.bandName ?? entry.artistName ?? entry.name,
    band: entry.bandId ? { id: entry.bandId, name: entry.bandName, slug: entry.bandSlug, verified: entry.bandVerified, pictureUrl: entry.bandPictureUrl } : null,
    artist: entry.artistId ? { userId: entry.artistId, name: entry.artistName, pictureUrl: entry.artistPictureUrl, verifiedAt: entry.artistVerifiedAt } : null,
    setStartsAt: iso(entry.setStartsAt), setEndsAt: iso(entry.setEndsAt),
    local: { setStartsAt: utcToZoned(entry.setStartsAt, timeZone), setEndsAt: utcToZoned(entry.setEndsAt, timeZone) },
  };
}

export function eventView(row, { origin = '', now = new Date() } = {}) {
  const latitude = row.effective_latitude === null ? null : Number(row.effective_latitude);
  const longitude = row.effective_longitude === null ? null : Number(row.effective_longitude);
  const coordinates = Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  const view = {
    id: row.id, title: row.title, description: row.description, type: row.event_type,
    status: effectiveStatus({ status: row.status, startsAt: row.starts_at, endsAt: row.ends_at }, now),
    scheduledStatus: row.status, visibility: row.visibility,
    startsAt: iso(row.starts_at), endsAt: iso(row.ends_at), doorsOpenAt: iso(row.doors_open_at), timezone: row.timezone,
    local: {
      startsAt: utcToZoned(row.starts_at, row.timezone), endsAt: utcToZoned(row.ends_at, row.timezone),
      doorsOpenAt: utcToZoned(row.doors_open_at, row.timezone),
    },
    upcoming: new Date(row.effective_end) > now,
    venue: row.venue_id && row.venue_name ? {
      id: row.venue_id, name: row.venue_name, slug: row.venue_slug, verified: Boolean(row.venue_verified_at),
      pictureUrl: row.venue_picture_url, city: row.venue_city,
    } : null,
    place: joinedPlace(row),
    address: row.address,
    coordinates,
    explicitCoordinates: row.latitude === null ? null : { latitude: Number(row.latitude), longitude: Number(row.longitude) },
    map: coordinates ? openStreetMapLinks(coordinates.latitude, coordinates.longitude) : null,
    capacity: row.capacity, ticketsSold: row.tickets_sold, ticketsSoldPercent: ticketsSoldPercent(row.capacity, row.tickets_sold),
    soldOut: Boolean(row.capacity) && row.tickets_sold >= row.capacity,
    ticketLinks: row.ticket_links, images: row.images, genres: row.genres,
    organizers: row.organizers,
    owner: row.owner_user_id ? {
      userId: row.owner_user_id, name: row.owner_name, pictureUrl: row.owner_picture_url, verifiedAt: row.owner_verified_at,
    } : null,
    lineup: row.lineup.map(entry => lineupView(entry, row.timezone)),
    attendance: { going: row.going_count, interested: row.interested_count },
    revision: row.revision, publishedAt: row.published_at, createdAt: row.created_at, updatedAt: row.updated_at,
    viewer: {
      canEdit: Boolean(row.viewer_can_edit), attendance: row.viewer_attendance ?? null,
      showOnProfile: row.viewer_show_on_profile ?? null,
    },
  };
  view.calendar = { googleUrl: googleCalendarUrl(view, { origin }), icsPath: `/realm/gigs/${row.id}/calendar.ics` };
  return view;
}

// API shape of a stored event, used to merge partial edits before validation.
function editable(row, relations) {
  return {
    title: row.title, description: row.description, type: row.event_type, timezone: row.timezone,
    startsAt: utcToZoned(row.starts_at, row.timezone), endsAt: utcToZoned(row.ends_at, row.timezone),
    doorsOpenAt: utcToZoned(row.doors_open_at, row.timezone),
    venueId: row.venue_id, placeId: row.place_id, address: row.address, latitude: row.latitude, longitude: row.longitude,
    capacity: row.capacity, ticketsSold: row.tickets_sold, visibility: row.visibility,
    lineup: relations.lineup.map(entry => ({
      role: entry.role, bandId: entry.band_id, artistId: entry.artist_user_id, name: entry.name,
      setStartsAt: utcToZoned(entry.set_starts_at, row.timezone), setEndsAt: utcToZoned(entry.set_ends_at, row.timezone),
    })),
    organizerIds: relations.organizerIds, images: relations.images, ticketLinks: relations.ticketLinks, genreIds: relations.genreIds,
  };
}

export function escapeLike(value) {
  return value.replace(/[\\%_]/g, match => `\\${match}`);
}

const unique = ids => [...new Set((ids ?? []).map(id => String(id).toLowerCase()))];

class EventRepository {
  constructor() {
    this.origin = '';
  }

  configure({ origin = '' } = {}) {
    this.origin = origin;
  }

  view(row) {
    return eventView(row, { origin: this.origin });
  }

  async load(executor, id, viewerId) {
    const { rows } = await executor.execute(`SELECT ${columns('$2')} FROM ${source} WHERE e.id = $1`, [id, viewerId]);
    return rows[0] ? this.view(rows[0]) : null;
  }

  async relations(executor, id) {
    const lineup = await executor.execute('SELECT * FROM event_lineup WHERE event_id = $1 ORDER BY position', [id]);
    const organizers = await executor.execute('SELECT organization_id FROM event_organizers WHERE event_id = $1 ORDER BY position', [id]);
    const images = await executor.execute("SELECT '/realm/media/' || media_id AS url FROM event_images WHERE event_id = $1 ORDER BY position", [id]);
    const ticketLinks = await executor.execute('SELECT label, url FROM event_ticket_links WHERE event_id = $1 ORDER BY position', [id]);
    const genres = await executor.execute('SELECT genre_id FROM event_genres WHERE event_id = $1', [id]);
    return {
      lineup: lineup.rows, organizerIds: organizers.rows.map(row => row.organization_id), images: images.rows.map(row => row.url),
      ticketLinks: ticketLinks.rows, genreIds: genres.rows.map(row => row.genre_id),
    };
  }

  // Locks an event and checks that `userId` may edit it: the owning artist, or
  // a member with manage_calendar on one of its organizers (requireMember).
  async requireEditor(executor, id, userId) {
    const { rows } = await executor.execute('SELECT * FROM events WHERE id = $1 FOR UPDATE', [id]);
    const row = rows[0];
    if (!row) throw notFound();
    if (row.owner_user_id === userId) return row;
    const organizers = await executor.execute('SELECT organization_id FROM event_organizers WHERE event_id = $1 ORDER BY position', [row.id]);
    for (const { organization_id: organizationId } of organizers.rows) {
      try {
        await organizationRepository.requireMember(executor, organizationId, userId, 'manage_calendar');
        return row;
      } catch (error) {
        if (![403, 404].includes(error.statusCode)) throw error;
      }
    }
    const visible = await executor.execute(`SELECT 1 FROM events e WHERE e.id = $1 AND ${VISIBLE_EVENT}`, [row.id]);
    if (!visible.rowCount) throw notFound();
    throw requestError(403, 'EVENT_PERMISSION_REQUIRED', 'Only the event owner or organizers with the calendar permission can change this event');
  }

  async assertVenue(executor, venueId) {
    if (!venueId) return null;
    const { rows } = await executor.execute(
      "SELECT id, latitude, longitude FROM organizations WHERE id = $1 AND kind = 'venue' AND is_deleted = FALSE", [venueId]);
    if (!rows.length) throw requestError(400, 'INVALID_VENUE', 'Choose a venue page for the location');
    return rows[0];
  }

  async assertPlace(executor, placeId) {
    if (placeId === null || placeId === undefined) return;
    const { rowCount } = await executor.execute('SELECT 1 FROM places WHERE id = $1', [placeId]);
    if (!rowCount) throw requestError(400, 'INVALID_PLACE', 'Choose a city from the list');
  }

  // Adding or removing an organizer needs manage_calendar on that organizer.
  async changeOrganizers(executor, eventId, userId, before, after) {
    for (const organizationId of after.filter(id => !before.includes(id))) {
      const access = await organizationRepository.requireMember(executor, organizationId, userId, 'manage_calendar');
      if (!ORGANIZER_KINDS.includes(access.organization.kind) || !access.organization.managed) {
        throw requestError(400, 'INVALID_ORGANIZER', 'Choose a managed page as organizer');
      }
    }
    for (const organizationId of before.filter(id => !after.includes(id))) {
      await organizationRepository.requireMember(executor, organizationId, userId, 'manage_calendar');
    }
    await executor.execute('DELETE FROM event_organizers WHERE event_id = $1', [eventId]);
    if (after.length) {
      await executor.execute(`
        INSERT INTO event_organizers (event_id, organization_id, position)
        SELECT $1, organization_id, ordinality - 1 FROM unnest($2::uuid[]) WITH ORDINALITY AS item(organization_id, ordinality)`, [eventId, after]);
    }
  }

  async replaceLineup(executor, eventId, lineup, timeZone) {
    if (lineup.length > LIMITS.lineup) throw requestError(400, 'INVALID_EVENT', `Add at most ${LIMITS.lineup} lineup entries`);
    const bands = unique(lineup.map(entry => entry.bandId).filter(Boolean));
    const artists = unique(lineup.map(entry => entry.artistId).filter(Boolean));
    if (bands.length) {
      const { rows } = await executor.execute(
        "SELECT COUNT(*)::int AS count FROM organizations WHERE id = ANY($1::uuid[]) AND kind = 'band' AND is_deleted = FALSE", [bands]);
      if (rows[0].count !== bands.length) throw requestError(400, 'INVALID_LINEUP', 'Choose bands from existing band pages');
    }
    if (artists.length) {
      const { rows } = await executor.execute(`
        SELECT COUNT(*)::int AS count FROM users u JOIN profiles p ON p.user_id = u.id
        WHERE u.id = ANY($1::uuid[]) AND u.is_active AND NOT u.is_deleted`, [artists]);
      if (rows[0].count !== artists.length) throw requestError(400, 'INVALID_LINEUP', 'Choose artists from existing profiles');
    }
    await executor.execute('DELETE FROM event_lineup WHERE event_id = $1', [eventId]);
    for (const [position, entry] of lineup.entries()) {
      await executor.execute(`
        INSERT INTO event_lineup (event_id, position, role, band_id, artist_user_id, name, set_starts_at, set_ends_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
        eventId, position, entry.role, entry.bandId?.toLowerCase() ?? null, entry.artistId?.toLowerCase() ?? null,
        entry.bandId || entry.artistId ? null : entry.name.trim(),
        entry.setStartsAt ? zonedToUtc(entry.setStartsAt, timeZone) : null, entry.setEndsAt ? zonedToUtc(entry.setEndsAt, timeZone) : null,
      ]);
    }
  }

  async replaceImages(executor, eventId, userId, images) {
    if (images.length > LIMITS.images) throw requestError(400, 'INVALID_EVENT', `Add at most ${LIMITS.images} images`);
    const ids = images.map(url => url.slice('/realm/media/'.length).toLowerCase());
    if (ids.length) {
      const { rows } = await executor.execute(`
        SELECT m.id FROM media m WHERE m.id = ANY($1::uuid[]) AND (
          (m.user_id = $2 AND m.purpose = 'event')
          OR EXISTS(SELECT 1 FROM event_images ei WHERE ei.event_id = $3 AND ei.media_id = m.id))`, [ids, userId, eventId]);
      if (rows.length !== ids.length) throw requestError(400, 'INVALID_MEDIA', 'Upload event images with this account');
    }
    await executor.execute('DELETE FROM event_images WHERE event_id = $1', [eventId]);
    if (ids.length) {
      await executor.execute(`
        INSERT INTO event_images (event_id, media_id, position)
        SELECT $1, media_id, ordinality - 1 FROM unnest($2::uuid[]) WITH ORDINALITY AS image(media_id, ordinality)`, [eventId, ids]);
    }
  }

  async replaceTicketLinks(executor, eventId, links) {
    if (links.length > LIMITS.ticketLinks) throw requestError(400, 'INVALID_EVENT', `Add at most ${LIMITS.ticketLinks} ticket links`);
    await executor.execute('DELETE FROM event_ticket_links WHERE event_id = $1', [eventId]);
    for (const [position, link] of links.entries()) {
      await executor.execute('INSERT INTO event_ticket_links (event_id, label, url, position) VALUES ($1, $2, $3, $4)',
        [eventId, link.label.trim(), link.url, position]);
    }
  }

  async replaceGenres(executor, eventId, genreIds) {
    const ids = unique(genreIds);
    if (ids.length > LIMITS.genres) throw requestError(400, 'INVALID_EVENT', `Choose at most ${LIMITS.genres} genres`);
    await executor.execute('DELETE FROM event_genres WHERE event_id = $1', [eventId]);
    if (!ids.length) return;
    const { rowCount } = await executor.execute(
      'INSERT INTO event_genres (event_id, genre_id) SELECT $1, id FROM genres WHERE id = ANY($2::uuid[])', [eventId, ids]);
    if (rowCount !== ids.length) throw requestError(400, 'INVALID_GENRE', 'Choose genres from the catalog');
  }

  validate(merged) {
    const errors = eventInputErrors(merged);
    if (errors.length) throw requestError(400, 'INVALID_EVENT', errors.join('. '));
  }

  async create(userId, input) {
    const organizerIds = unique(input.organizerIds);
    const merged = {
      type: 'concert', visibility: 'draft', lineup: [], images: [], ticketLinks: [], genreIds: [], ticketsSold: 0, ...input, organizerIds,
    };
    this.validate(merged);
    return realmConnector.transaction(async executor => {
      await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      await this.assertVenue(executor, merged.venueId?.toLowerCase());
      await this.assertPlace(executor, merged.placeId);
      const { rows: [{ id }] } = await executor.execute(`
        INSERT INTO events (title, description, event_type, timezone, starts_at, ends_at, doors_open_at, venue_id, place_id, address,
          latitude, longitude, capacity, tickets_sold, owner_user_id, created_by, visibility)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`, [
        merged.title.trim(), merged.description?.trim() || null, merged.type, merged.timezone,
        zonedToUtc(merged.startsAt, merged.timezone), merged.endsAt ? zonedToUtc(merged.endsAt, merged.timezone) : null,
        merged.doorsOpenAt ? zonedToUtc(merged.doorsOpenAt, merged.timezone) : null,
        merged.venueId?.toLowerCase() ?? null, merged.placeId ?? null, merged.address?.trim() || null,
        merged.latitude ?? null, merged.longitude ?? null, merged.capacity ?? null, merged.ticketsSold ?? 0,
        organizerIds.length ? null : userId, userId, merged.visibility,
      ]);
      await this.changeOrganizers(executor, id, userId, [], organizerIds);
      await this.replaceLineup(executor, id, merged.lineup, merged.timezone);
      await this.replaceImages(executor, id, userId, merged.images);
      await this.replaceTicketLinks(executor, id, merged.ticketLinks);
      await this.replaceGenres(executor, id, merged.genreIds);
      if (merged.visibility === 'published') await this.publish(executor, id, userId);
      await publishEvent(executor, 'gigs.changed', { id });
      return this.load(executor, id, userId);
    });
  }

  async update(userId, id, changes) {
    return realmConnector.transaction(async executor => {
      const row = await this.requireEditor(executor, id, userId);
      const relations = await this.relations(executor, row.id);
      const fields = Object.fromEntries(Object.entries(changes).filter(([key, value]) => value !== undefined && !['status', 'statusNote'].includes(key)));
      const merged = { ...editable(row, relations), ...fields };
      if (fields.organizerIds) merged.organizerIds = unique(fields.organizerIds);
      this.validate(merged);
      if (!row.owner_user_id && !merged.organizerIds.length) {
        throw requestError(400, 'ORGANIZER_REQUIRED', 'Keep at least one organizer for this event');
      }
      if (row.visibility === 'published' && merged.visibility === 'draft') {
        const { rows } = await executor.execute('SELECT COUNT(*)::int AS count FROM event_attendees WHERE event_id = $1', [row.id]);
        if (rows[0].count) throw requestError(409, 'EVENT_HAS_ATTENDEES', 'People already plan to attend. Cancel the event instead of unpublishing it.');
      }
      if (fields.venueId !== undefined) await this.assertVenue(executor, merged.venueId?.toLowerCase());
      if (fields.placeId !== undefined) await this.assertPlace(executor, merged.placeId);
      const startsAt = zonedToUtc(merged.startsAt, merged.timezone);
      const status = changes.status ?? row.status;
      const timeChanged = startsAt.getTime() !== new Date(row.starts_at).getTime();
      const statusChanged = status !== row.status;
      const lineupBefore = this.lineupReferences(relations.lineup);
      await executor.execute(`
        UPDATE events SET title = $2, description = $3, event_type = $4, timezone = $5, starts_at = $6, ends_at = $7, doors_open_at = $8,
          venue_id = $9, place_id = $10, address = $11, latitude = $12, longitude = $13, capacity = $14, tickets_sold = $15,
          status = $16, visibility = $17, revision = revision + 1, updated_at = NOW()
        WHERE id = $1`, [
        row.id, merged.title.trim(), merged.description?.trim() || null, merged.type, merged.timezone, startsAt,
        merged.endsAt ? zonedToUtc(merged.endsAt, merged.timezone) : null,
        merged.doorsOpenAt ? zonedToUtc(merged.doorsOpenAt, merged.timezone) : null,
        merged.venueId?.toLowerCase() ?? null, merged.placeId ?? null, merged.address?.trim() || null,
        merged.latitude ?? null, merged.longitude ?? null, merged.capacity ?? null, merged.ticketsSold ?? 0, status, merged.visibility,
      ]);
      if (fields.organizerIds) await this.changeOrganizers(executor, row.id, userId, relations.organizerIds, merged.organizerIds);
      if (fields.lineup || fields.timezone !== undefined) await this.replaceLineup(executor, row.id, merged.lineup, merged.timezone);
      if (fields.images) await this.replaceImages(executor, row.id, userId, merged.images);
      if (fields.ticketLinks) await this.replaceTicketLinks(executor, row.id, merged.ticketLinks);
      if (fields.genreIds) await this.replaceGenres(executor, row.id, merged.genreIds);
      if (timeChanged) {
        await executor.execute(`
          UPDATE event_reminders r SET remind_at = e.starts_at - make_interval(mins => r.offset_minutes),
            sent_at = CASE WHEN e.starts_at - make_interval(mins => r.offset_minutes) > NOW() THEN NULL ELSE r.sent_at END
          FROM events e WHERE e.id = r.event_id AND r.event_id = $1`, [row.id]);
      }
      if (merged.visibility === 'published') {
        if (row.visibility !== 'published') await this.publish(executor, row.id, userId);
        else if (fields.lineup) await this.notifyLineup(executor, row.id, userId, lineupBefore);
      }
      if (statusChanged && merged.visibility === 'published' && ['cancelled', 'postponed'].includes(status)) {
        await this.insertCommunication(executor, row.id, userId, {
          kind: status === 'cancelled' ? 'cancellation' : 'postponement', body: changes.statusNote?.trim() || null, automatic: true,
        });
      }
      await publishEvent(executor, 'gigs.changed', { id: row.id });
      return this.load(executor, row.id, userId);
    });
  }

  async remove(userId, id) {
    return realmConnector.transaction(async executor => {
      const row = await this.requireEditor(executor, id, userId);
      const status = effectiveStatus({ status: row.status, startsAt: row.starts_at, endsAt: row.ends_at });
      if (row.visibility === 'published' && !['cancelled', 'completed'].includes(status)) {
        throw requestError(409, 'EVENT_ACTIVE', 'Cancel a published event before deleting it so attendees are told');
      }
      await executor.execute('DELETE FROM events WHERE id = $1', [row.id]);
      await publishEvent(executor, 'gigs.changed', { id: row.id });
      return { id: row.id, deleted: true };
    });
  }

  lineupReferences(lineup) {
    return lineup.map(entry => (entry.band_id ? `band:${entry.band_id}` : entry.artist_user_id ? `artist:${entry.artist_user_id}` : null))
      .filter(Boolean);
  }

  // First publication: followers of the organizers, lineup bands, venue,
  // owner and lineup artists hear about it once; performers are told they are
  // on the lineup.
  async publish(executor, id, actorId) {
    const { rows: [event] } = await executor.execute(`
      UPDATE events SET published_at = COALESCE(published_at, NOW()) WHERE id = $1
      RETURNING id, title, starts_at, timezone, owner_user_id, venue_id, (published_at = NOW()) AS first`, [id]);
    if (!event.first) return;
    const { rows } = await executor.execute(`
      SELECT DISTINCT f.user_id FROM organization_followers f
      WHERE f.organization_id IN (
        SELECT organization_id FROM event_organizers WHERE event_id = $1
        UNION SELECT band_id FROM event_lineup WHERE event_id = $1 AND band_id IS NOT NULL
        UNION SELECT venue_id FROM events WHERE id = $1 AND venue_id IS NOT NULL)
      UNION
      SELECT DISTINCT fl.follower_id FROM followers fl
      WHERE fl.following_id IN (
        SELECT artist_user_id FROM event_lineup WHERE event_id = $1 AND artist_user_id IS NOT NULL
        UNION SELECT owner_user_id FROM events WHERE id = $1 AND owner_user_id IS NOT NULL)`, [id]);
    const params = { eventId: id, title: event.title, startsAt: new Date(event.starts_at).toISOString(), timezone: event.timezone };
    await notificationRepository.createMany(executor, rows.map(row => row.user_id).filter(userId => userId !== actorId), {
      kind: 'event_published', title: `New event: ${event.title}`, link: `#event?id=${id}`, keyPrefix: `event-published:${id}`, params,
    });
    await this.notifyLineup(executor, id, actorId, []);
  }

  async notifyLineup(executor, id, actorId, before) {
    const { rows: entries } = await executor.execute('SELECT band_id, artist_user_id FROM event_lineup WHERE event_id = $1', [id]);
    const { rows: [event] } = await executor.execute('SELECT title FROM events WHERE id = $1', [id]);
    for (const reference of this.lineupReferences(entries).filter(item => !before.includes(item))) {
      const [type, referenceId] = reference.split(':');
      const recipients = type === 'artist' ? [referenceId] : await organizationRepository.managerIds(executor, referenceId, 'manage_calendar');
      await notificationRepository.createMany(executor, recipients.filter(userId => userId !== actorId), {
        kind: 'event_lineup', title: `You are on the lineup of ${event.title}`, link: `#event?id=${id}`,
        keyPrefix: `event-lineup:${id}:${referenceId}`, params: { eventId: id, title: event.title },
      });
    }
  }

  // Official communication from the organizers, shown on the event page and
  // sent to everyone going or interested on every channel of the catalog.
  async insertCommunication(executor, eventId, authorId, { kind, body = null, automatic = false }) {
    const { rows: [communication] } = await executor.execute(`
      INSERT INTO event_communications (event_id, author_id, kind, body, automatic) VALUES ($1, $2, $3, $4, $5)
      RETURNING id, kind, body, automatic, created_at`, [eventId, authorId, kind, body, automatic]);
    const { rows: [event] } = await executor.execute('SELECT title FROM events WHERE id = $1', [eventId]);
    const { rows: attendees } = await executor.execute('SELECT user_id FROM event_attendees WHERE event_id = $1', [eventId]);
    await notificationRepository.createMany(executor, attendees.map(row => row.user_id).filter(userId => userId !== authorId), {
      kind: 'event_communication', title: `Update about ${event.title}`, link: `#event?id=${eventId}`,
      keyPrefix: `event-communication:${communication.id}`, params: { eventId, title: event.title, communicationKind: kind },
    });
    await publishEvent(executor, 'gigs.changed', { id: eventId });
    return {
      id: communication.id, kind: communication.kind, body: communication.body, automatic: communication.automatic,
      createdAt: communication.created_at,
    };
  }

  async detail(id, viewerId, admin = false) {
    const { rows } = await realmConnector.execute(`
      SELECT ${columns('$2')} FROM ${source}
      WHERE e.id = $1 AND (${VISIBLE_EVENT} OR $3::boolean OR ${editorSql('e', '$2::uuid')})`, [id, viewerId, admin]);
    if (!rows[0]) throw notFound();
    const event = this.view(rows[0]);
    const { rows: reminders } = viewerId ? await realmConnector.execute(
      'SELECT offset_minutes FROM event_reminders WHERE event_id = $1 AND user_id = $2 ORDER BY offset_minutes', [id, viewerId]) : { rows: [] };
    const { rows: communications } = await realmConnector.execute(`
      SELECT c.id, c.kind, c.body, c.automatic, c.created_at, CASE WHEN c.author_id IS NOT NULL THEN ${displayName('p')} END AS author_name
      FROM event_communications c LEFT JOIN profiles p ON p.user_id = c.author_id
      WHERE c.event_id = $1 ORDER BY c.created_at DESC, c.id DESC LIMIT 50`, [id]);
    event.viewer.reminders = reminders.map(row => row.offset_minutes);
    event.viewer.canDiscuss = Boolean(event.viewer.canEdit || event.viewer.attendance || admin);
    event.viewer.canModerate = Boolean(event.viewer.canEdit || admin);
    event.communications = communications.map(row => ({
      id: row.id, kind: row.kind, body: row.body, automatic: row.automatic, createdAt: row.created_at, authorName: row.author_name,
    }));
    return event;
  }

  async calendar(id, viewerId) {
    const { rows } = await realmConnector.execute(`
      SELECT ${columns('$2')} FROM ${source} WHERE e.id = $1 AND (${VISIBLE_EVENT} OR ${editorSql('e', '$2::uuid')})`, [id, viewerId]);
    if (!rows[0]) throw notFound();
    return this.view(rows[0]);
  }

  // Shared filter builder for search and profile/page lists.
  async list({ where, values, order, page, pageSize, viewerId }) {
    values.push(pageSize + 1, (page - 1) * pageSize);
    const { rows } = await realmConnector.execute(`
      SELECT ${columns('$1')} FROM ${source} WHERE ${where.join(' AND ')}
      ORDER BY ${order}, e.id LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    return rows.map(row => this.view(row));
  }

  whenCondition(when) {
    if (when === 'past') return { condition: `${endSql('e')} <= NOW()`, order: 'e.starts_at DESC' };
    if (when === 'all') return { condition: 'TRUE', order: 'e.starts_at ASC' };
    return { condition: `${endSql('e')} > NOW()`, order: 'e.starts_at ASC' };
  }

  async search(filters, { page, pageSize }, viewerId) {
    const values = [viewerId];
    const add = binder(values);
    const when = this.whenCondition(filters.when);
    const where = [VISIBLE_EVENT, when.condition];
    if (viewerId) {
      where.push(`(e.owner_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM blocked_users b
        WHERE (b.user_id = $1 AND b.blocked_user_id = e.owner_user_id) OR (b.user_id = e.owner_user_id AND b.blocked_user_id = $1)))`);
    }
    if (filters.q) {
      const term = add(`%${escapeLike(filters.q)}%`);
      where.push(`(e.title ILIKE ${term} OR COALESCE(e.description, '') ILIKE ${term} OR COALESCE(v.name, '') ILIKE ${term}
        OR EXISTS(SELECT 1 FROM event_lineup l LEFT JOIN organizations b ON b.id = l.band_id LEFT JOIN profiles ap ON ap.user_id = l.artist_user_id
          WHERE l.event_id = e.id AND (l.name ILIKE ${term} OR b.name ILIKE ${term} OR ap.artist_name ILIKE ${term})))`);
    }
    if (filters.type) where.push(`e.event_type = ${add(filters.type)}`);
    if (filters.bandId) where.push(`EXISTS(SELECT 1 FROM event_lineup l WHERE l.event_id = e.id AND l.band_id = ${add(filters.bandId)})`);
    if (filters.artistId) where.push(`EXISTS(SELECT 1 FROM event_lineup l WHERE l.event_id = e.id AND l.artist_user_id = ${add(filters.artistId)})`);
    if (filters.organizerId) {
      where.push(`EXISTS(SELECT 1 FROM event_organizers eo WHERE eo.event_id = e.id AND eo.organization_id = ${add(filters.organizerId)})`);
    }
    if (filters.venueId) where.push(`e.venue_id = ${add(filters.venueId)}`);
    if (filters.genreId) where.push(`EXISTS(SELECT 1 FROM event_genres eg WHERE eg.event_id = e.id AND eg.genre_id = ${add(filters.genreId)})`);
    if (filters.from) where.push(`(e.starts_at AT TIME ZONE e.timezone)::date >= ${add(filters.from)}::date`);
    if (filters.to) where.push(`(e.starts_at AT TIME ZONE e.timezone)::date <= ${add(filters.to)}::date`);
    if (filters.location) {
      const term = add(`%${escapeLike(filters.location)}%`);
      where.push(`(COALESCE(pl.name, '') || ' ' || COALESCE(pl.region_name, '') || ' ' || COALESCE(pl.country_name, '') || ' '
        || COALESCE(e.address, '') || ' ' || COALESCE(v.city, '') || ' ' || COALESCE(v.name, '')) ILIKE ${term}`);
    }
    if (filters.center) {
      const near = proximity({ latitudeColumn: latitudeSql, longitudeColumn: longitudeSql, center: filters.center, radiusKm: filters.radiusKm }, add);
      where.push(...near.conditions);
    }
    const headliner = `(SELECT lower(COALESCE(b.name, ap.artist_name, l.name)) FROM event_lineup l
      LEFT JOIN organizations b ON b.id = l.band_id LEFT JOIN profiles ap ON ap.user_id = l.artist_user_id
      WHERE l.event_id = e.id ORDER BY (l.role = 'headliner') DESC, l.position LIMIT 1)`;
    const organizer = `COALESCE((SELECT lower(o.name) FROM event_organizers eo JOIN organizations o ON o.id = eo.organization_id
      WHERE eo.event_id = e.id ORDER BY eo.position LIMIT 1), lower(op.artist_name))`;
    const order = {
      date: when.order,
      band: `${headliner} ASC NULLS LAST, ${when.order}`,
      organizer: `${organizer} ASC NULLS LAST, ${when.order}`,
      location: `lower(COALESCE(pl.name, v.city, e.address)) ASC NULLS LAST, lower(v.name) ASC NULLS LAST, ${when.order}`,
    }[filters.sort || 'date'];
    return this.list({ where, values, order, page, pageSize, viewerId });
  }

  async mine(userId, { role = 'organizing', when = 'upcoming' }, { page, pageSize }) {
    const values = [userId];
    const timing = this.whenCondition(when);
    const where = [timing.condition, role === 'attending'
      ? `${VISIBLE_EVENT} AND EXISTS(SELECT 1 FROM event_attendees a WHERE a.event_id = e.id AND a.user_id = $1)`
      : editorSql('e', '$1::uuid')];
    return this.list({ where, values, order: timing.order, page, pageSize, viewerId: userId });
  }

  async forOrganization(organizationId, when, { page, pageSize }, viewerId) {
    const values = [viewerId];
    const timing = this.whenCondition(when);
    const id = binder(values)(organizationId);
    const where = [VISIBLE_EVENT, timing.condition, `(e.venue_id = ${id}
      OR EXISTS(SELECT 1 FROM event_organizers eo WHERE eo.event_id = e.id AND eo.organization_id = ${id})
      OR EXISTS(SELECT 1 FROM event_lineup l WHERE l.event_id = e.id AND l.band_id = ${id}))`];
    const rows = await this.list({ where, values, order: timing.order, page, pageSize, viewerId });
    return rows.map(event => ({
      ...event,
      relations: [
        ...(event.organizers.some(item => item.id === organizationId) ? ['organizer'] : []),
        ...(event.lineup.some(entry => entry.band?.id === organizationId) ? ['performer'] : []),
        ...(event.venue?.id === organizationId ? ['venue'] : []),
      ],
    }));
  }

  // Performances, events the person owns, and events they go to and chose to
  // show on their profile (always visible to themselves). Hidden from people
  // blocked in either direction.
  async forProfile(userId, when, { page, pageSize }, viewerId) {
    const values = [viewerId];
    const timing = this.whenCondition(when);
    const id = binder(values)(userId);
    const where = [VISIBLE_EVENT, timing.condition, `NOT EXISTS(SELECT 1 FROM blocked_users b
      WHERE (b.user_id = ${id} AND b.blocked_user_id = $1) OR (b.user_id = $1 AND b.blocked_user_id = ${id}))`,
    `(e.owner_user_id = ${id}
      OR EXISTS(SELECT 1 FROM event_lineup l WHERE l.event_id = e.id AND l.artist_user_id = ${id})
      OR EXISTS(SELECT 1 FROM event_attendees a WHERE a.event_id = e.id AND a.user_id = ${id} AND a.status = 'going'
        AND (a.show_on_profile OR ${id} = $1)))`];
    const { rows: user } = await realmConnector.execute('SELECT 1 FROM users WHERE id = $1 AND is_active AND NOT is_deleted', [userId]);
    if (!user.length) throw requestError(404, 'PROFILE_NOT_FOUND', 'Profile not found');
    const rows = await this.list({ where, values, order: timing.order, page, pageSize, viewerId });
    const { rows: attending } = await realmConnector.execute(`
      SELECT event_id FROM event_attendees WHERE user_id = $1 AND status = 'going' AND event_id = ANY($2::uuid[])`,
    [userId, rows.map(event => event.id)]);
    const going = new Set(attending.map(row => row.event_id));
    return rows.map(event => ({
      ...event,
      relations: [
        ...(event.owner?.userId === userId || event.lineup.some(entry => entry.artist?.userId === userId) ? ['performer'] : []),
        ...(going.has(event.id) ? ['attendee'] : []),
      ],
    }));
  }

  async visibleForUpdate(executor, id) {
    const { rows } = await executor.execute(`SELECT e.* FROM events e WHERE e.id = $1 AND ${VISIBLE_EVENT} FOR SHARE OF e`, [id]);
    if (!rows[0]) throw notFound();
    return rows[0];
  }

  async setAttendance(userId, id, { status, showOnProfile }) {
    return realmConnector.transaction(async executor => {
      const event = await this.visibleForUpdate(executor, id);
      if (event.status === 'cancelled') throw requestError(409, 'EVENT_CANCELLED', 'This event was cancelled');
      await executor.execute(`
        INSERT INTO event_attendees (event_id, user_id, status, show_on_profile) VALUES ($1, $2, $3, COALESCE($4, TRUE))
        ON CONFLICT (event_id, user_id) DO UPDATE SET status = EXCLUDED.status,
          show_on_profile = COALESCE($4, event_attendees.show_on_profile), updated_at = NOW()`,
      [event.id, userId, status, showOnProfile ?? null]);
      await publishEvent(executor, 'gigs.changed', { id: event.id });
      await publishEvent(executor, 'gigs.mine.changed', { userId });
      return this.load(executor, event.id, userId);
    });
  }

  async removeAttendance(userId, id) {
    return realmConnector.transaction(async executor => {
      const { rowCount } = await executor.execute('DELETE FROM event_attendees WHERE event_id = $1 AND user_id = $2', [id, userId]);
      if (rowCount) {
        await publishEvent(executor, 'gigs.changed', { id });
        await publishEvent(executor, 'gigs.mine.changed', { userId });
      }
      return { id, attendance: null };
    });
  }

  async setReminders(userId, id, offsets) {
    const error = reminderOffsetsError(offsets);
    if (error) throw requestError(400, 'INVALID_REMINDER', error);
    return realmConnector.transaction(async executor => {
      const event = await this.visibleForUpdate(executor, id);
      if (offsets.length) {
        if (event.status === 'cancelled') throw requestError(409, 'EVENT_CANCELLED', 'This event was cancelled');
        const passed = offsets.filter(minutes => new Date(event.starts_at).getTime() - minutes * 60000 <= Date.now());
        if (passed.length) throw requestError(400, 'REMINDER_IN_PAST', 'That reminder time has already passed for this event');
      }
      await executor.execute('DELETE FROM event_reminders WHERE event_id = $1 AND user_id = $2', [event.id, userId]);
      if (offsets.length) {
        await executor.execute(`
          INSERT INTO event_reminders (event_id, user_id, offset_minutes, remind_at)
          SELECT $1, $2, minutes, $3::timestamptz - make_interval(mins => minutes) FROM unnest($4::int[]) AS item(minutes)`,
        [event.id, userId, event.starts_at, offsets]);
      }
      await publishEvent(executor, 'gigs.mine.changed', { userId });
      return { id: event.id, reminders: [...offsets].sort((a, b) => a - b) };
    });
  }

  // Leases due reminders with SKIP LOCKED so several API processes never send
  // the same one twice, and notifies only for events that still go ahead.
  async sendDueReminders(executor, { batchSize = 100 } = {}) {
    const { rows } = await executor.execute(`
      WITH due AS (
        SELECT r.id FROM event_reminders r WHERE r.sent_at IS NULL AND r.remind_at <= NOW()
        ORDER BY r.remind_at, r.id LIMIT $1 FOR UPDATE OF r SKIP LOCKED
      )
      UPDATE event_reminders r SET sent_at = NOW() FROM due, events e
      WHERE r.id = due.id AND e.id = r.event_id
      RETURNING r.id, r.user_id, r.offset_minutes, r.remind_at, e.id AS event_id, e.title, e.starts_at, e.timezone, e.status,
        (${VISIBLE_EVENT}) AS visible`, [batchSize]);
    let sent = 0;
    for (const row of rows) {
      if (!row.visible || row.status === 'cancelled' || new Date(row.starts_at) <= new Date()) continue;
      if (await notificationRepository.create(executor, {
        userId: row.user_id, kind: 'event_reminder', title: `Reminder: ${row.title} starts soon`, link: `#event?id=${row.event_id}`,
        key: `event-reminder:${row.id}:${new Date(row.remind_at).getTime()}`,
        params: {
          eventId: row.event_id, title: row.title, startsAt: new Date(row.starts_at).toISOString(), timezone: row.timezone,
          offsetMinutes: row.offset_minutes,
        },
      })) sent += 1;
    }
    return { leased: rows.length, sent };
  }

  async purgeReminders(executor) {
    const { rowCount } = await executor.execute(`
      DELETE FROM event_reminders r USING events e
      WHERE e.id = r.event_id AND (${endSql('e')} < NOW() - INTERVAL '1 day' OR e.status = 'cancelled')`);
    return rowCount;
  }

  // Performers can take themselves (or a band they manage) off a lineup.
  async leaveLineup(userId, id, entryId) {
    return realmConnector.transaction(async executor => {
      const { rows } = await executor.execute(`
        SELECT l.* FROM event_lineup l JOIN events e ON e.id = l.event_id WHERE l.id = $1 AND l.event_id = $2 FOR UPDATE OF e`, [entryId, id]);
      const entry = rows[0];
      if (!entry) throw requestError(404, 'LINEUP_ENTRY_NOT_FOUND', 'Lineup entry not found');
      if (entry.artist_user_id !== userId) {
        if (!entry.band_id) throw requestError(403, 'EVENT_PERMISSION_REQUIRED', 'Only the performer can leave this lineup');
        await organizationRepository.requireMember(executor, entry.band_id, userId, 'manage_calendar');
      }
      await executor.execute('DELETE FROM event_lineup WHERE id = $1', [entry.id]);
      await executor.execute('UPDATE events SET revision = revision + 1, updated_at = NOW() WHERE id = $1', [id]);
      await publishEvent(executor, 'gigs.changed', { id });
      return { id: entry.id, removed: true };
    });
  }

  // Before an account is deleted, events it co-owns with organizations stay
  // with those organizations; events it owns alone are removed by cascade.
  async detachOnAccountDeletion(executor, userId) {
    await executor.execute(`
      UPDATE events e SET owner_user_id = NULL, updated_at = NOW()
      WHERE e.owner_user_id = $1 AND EXISTS(SELECT 1 FROM event_organizers eo WHERE eo.event_id = e.id)`, [userId]);
  }
}

export const eventRepository = new EventRepository();
