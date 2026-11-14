import { createHash, randomBytes } from 'node:crypto';
import { realmConnector } from './realm-connector.js';
import { publishEvent } from './event-publisher.js';
import { notificationRepository } from './notification-repository.js';
import { organizationRepository, displayName } from './organization-repository.js';
import { joinedPlace, placeJoinColumns, placeRepository } from './place-repository.js';
import { requestError } from '../engines/request-error.js';
import { isTimeZone, localToUtc, utcToLocal } from '../engines/calendar-time.js';
import { buildCalendar } from '../engines/ics.js';
import { CALENDAR_LIMITS, REMINDER_OFFSETS } from '../engines/calendar-model.js';

const DAY = 24 * 60 * 60 * 1000;
const FEED_TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const hashFeedToken = token => createHash('sha256').update(token).digest('hex');
const notFound = () => requestError(404, 'CALENDAR_ENTRY_NOT_FOUND', 'Calendar entry not found');

// Who may see an entry: its owner, an explicit invitee, or an active member
// of the entry's band. `param` is the SQL expression for the viewer's ID.
export const calendarVisibleTo = (alias, param) => `(
  ${alias}.owner_id = ${param}
  OR EXISTS(SELECT 1 FROM calendar_participants vp WHERE vp.entry_id = ${alias}.id AND vp.user_id = ${param} AND vp.invited)
  OR EXISTS(SELECT 1 FROM organization_members vm JOIN organizations vo ON vo.id = vm.organization_id AND NOT vo.is_deleted
    WHERE vm.organization_id = ${alias}.organization_id AND vm.user_id = ${param} AND vm.status = 'active'))`;

const canManageSql = (alias, param) => `(
  ${alias}.owner_id = ${param}
  OR EXISTS(SELECT 1 FROM organization_members mm JOIN organizations mo ON mo.id = mm.organization_id AND NOT mo.is_deleted
    WHERE mm.organization_id = ${alias}.organization_id AND mm.user_id = ${param} AND mm.status = 'active'
      AND (mm.role IN ('leader', 'admin') OR 'manage_calendar' = ANY(mm.permissions))))`;

const entrySelect = viewer => `
  SELECT e.*, o.name AS organization_name, o.slug AS organization_slug, ${displayName('cp')} AS creator_name,
    ${placeJoinColumns('pl')},
    vr.response AS viewer_response, COALESCE(vr.invited, FALSE) AS viewer_invited,
    ${canManageSql('e', viewer)} AS can_manage,
    COALESCE((SELECT array_agg(r.offset_minutes ORDER BY r.offset_minutes) FROM calendar_reminders r
      WHERE r.entry_id = e.id AND r.user_id = ${viewer}), '{}') AS viewer_reminders
  FROM calendar_entries e
  LEFT JOIN organizations o ON o.id = e.organization_id
  LEFT JOIN profiles cp ON cp.user_id = e.created_by
  LEFT JOIN places pl ON pl.id = e.place_id
  LEFT JOIN calendar_participants vr ON vr.entry_id = e.id AND vr.user_id = ${viewer}`;

export function entryView(row) {
  return {
    id: row.id, kind: row.kind, title: row.title, status: row.status, sequence: row.sequence,
    startsAt: row.starts_at, endsAt: row.ends_at, timeZone: row.time_zone,
    startLocal: utcToLocal(row.starts_at, row.time_zone), endLocal: utcToLocal(row.ends_at, row.time_zone),
    place: joinedPlace(row), address: row.address, notes: row.notes,
    organization: row.organization_id ? { id: row.organization_id, name: row.organization_name, slug: row.organization_slug } : null,
    ownerId: row.owner_id,
    createdBy: row.created_by ? { userId: row.created_by, name: row.creator_name } : null,
    createdAt: row.created_at, updatedAt: row.updated_at,
    viewer: {
      canManage: Boolean(row.can_manage), invited: Boolean(row.viewer_invited),
      response: row.viewer_response ?? 'pending', reminders: row.viewer_reminders ?? [],
    },
  };
}

// Resolves local wall-clock start/end and a time zone into UTC instants.
export function resolveTimes({ startLocal, endLocal, timeZone }) {
  if (!isTimeZone(timeZone)) throw requestError(400, 'INVALID_TIME_ZONE', 'Choose a valid time zone');
  const startsAt = localToUtc(startLocal, timeZone);
  const endsAt = localToUtc(endLocal, timeZone);
  if (!startsAt || !endsAt) {
    throw requestError(400, 'INVALID_TIME', 'Choose a start and end time that exist in the chosen time zone');
  }
  if (endsAt <= startsAt) throw requestError(400, 'INVALID_TIME', 'The end must be after the start');
  if (endsAt - startsAt > CALENDAR_LIMITS.maxDurationDays * DAY) {
    throw requestError(400, 'INVALID_TIME', `Entries can last at most ${CALENDAR_LIMITS.maxDurationDays} days`);
  }
  return { startsAt, endsAt, timeZone };
}

class CalendarRepository {
  async place(executor, placeId) {
    if (placeId === null || placeId === undefined) return null;
    const place = await placeRepository.find(placeId, executor);
    if (!place) throw requestError(400, 'INVALID_PLACE', 'Choose a city from the suggestions');
    return place;
  }

  async row(executor, entryId, viewerId) {
    const { rows } = await executor.execute(`${entrySelect('$2::uuid')}
      WHERE e.id = $1 AND ${calendarVisibleTo('e', '$2::uuid')}`, [entryId, viewerId]);
    return rows[0] || null;
  }

  async participants(executor, entry) {
    const { rows } = await executor.execute(`
      SELECT u.id AS user_id, ${displayName('p')} AS name, p.profile_picture_url AS picture_url,
        COALESCE(cp.invited, FALSE) AS invited, COALESCE(cp.response, 'pending') AS response,
        (m.user_id IS NOT NULL) AS member, (u.id = $3::uuid) AS organizer
      FROM (
        SELECT user_id FROM organization_members WHERE organization_id = $2::uuid AND status = 'active'
        UNION SELECT user_id FROM calendar_participants WHERE entry_id = $1 AND invited
        UNION SELECT $3::uuid WHERE $3::uuid IS NOT NULL
      ) people
      JOIN users u ON u.id = people.user_id AND u.is_active AND NOT u.is_deleted
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN calendar_participants cp ON cp.entry_id = $1 AND cp.user_id = u.id
      LEFT JOIN organization_members m ON m.organization_id = $2::uuid AND m.user_id = u.id AND m.status = 'active'
      ORDER BY (u.id = $3::uuid) DESC, name, u.id`, [entry.id, entry.organization_id, entry.owner_id]);
    return rows.map(row => ({
      userId: row.user_id, name: row.name, pictureUrl: row.picture_url, invited: row.invited,
      response: row.response, member: row.member, organizer: row.organizer,
    }));
  }

  async viewerIds(executor, entry) {
    const { rows } = await executor.execute(`
      SELECT DISTINCT people.user_id FROM (
        SELECT m.user_id FROM organization_members m JOIN organizations o ON o.id = m.organization_id AND NOT o.is_deleted
        WHERE m.organization_id = $2::uuid AND m.status = 'active'
        UNION SELECT user_id FROM calendar_participants WHERE entry_id = $1 AND invited
        UNION SELECT $3::uuid WHERE $3::uuid IS NOT NULL
      ) people JOIN users u ON u.id = people.user_id AND u.is_active AND NOT u.is_deleted`,
    [entry.id, entry.organization_id, entry.owner_id]);
    return rows.map(row => row.user_id);
  }

  async publish(executor, entry, userIds) {
    for (const userId of new Set(userIds)) await publishEvent(executor, 'calendar.changed', { userId, id: entry.id });
  }

  async detail(executor, entryId, viewerId) {
    const row = await this.row(executor, entryId, viewerId);
    if (!row) throw notFound();
    return { ...entryView(row), participants: await this.participants(executor, row) };
  }

  async get(entryId, viewerId) {
    return this.detail(realmConnector, entryId, viewerId);
  }

  // Locks an entry the viewer may edit. Viewers without the right get 403,
  // everyone else 404, so entry IDs do not reveal private calendars.
  async lockManaged(executor, entryId, userId) {
    const { rows } = await executor.execute(`
      SELECT e.*, ${calendarVisibleTo('e', '$2::uuid')} AS visible, ${canManageSql('e', '$2::uuid')} AS can_manage
      FROM calendar_entries e WHERE e.id = $1 FOR UPDATE OF e`, [entryId, userId]);
    const entry = rows[0];
    if (!entry?.visible) throw notFound();
    if (!entry.can_manage) {
      throw requestError(403, 'CALENDAR_PERMISSION_REQUIRED', entry.organization_id
        ? 'You need the calendar permission for this band to change this entry'
        : 'Only the organizer can change this entry');
    }
    return entry;
  }

  async list(viewerId, { when = 'upcoming', organizationId = null }, { page, pageSize }) {
    return realmConnector.transaction(async executor => {
      if (organizationId) {
        const access = await organizationRepository.requireMember(executor, organizationId, viewerId, null);
        if (access.organization.kind !== 'band') throw requestError(404, 'CALENDAR_UNAVAILABLE', 'Calendars are available for band pages');
      }
      const past = when === 'past';
      const { rows } = await executor.execute(`${entrySelect('$1::uuid')}
        WHERE ${organizationId ? 'e.organization_id = $4::uuid' : calendarVisibleTo('e', '$1::uuid')}
          AND ${past ? 'e.ends_at < NOW()' : 'e.ends_at >= NOW()'}
        ORDER BY e.starts_at ${past ? 'DESC' : 'ASC'}, e.id LIMIT $2 OFFSET $3`,
      [viewerId, pageSize + 1, (page - 1) * pageSize, ...(organizationId ? [organizationId] : [])]);
      return rows.map(entryView);
    });
  }

  async addInvitees(executor, entry, actorId, userIds) {
    const ids = [...new Set(userIds.map(id => id.toLowerCase()))].filter(id => id !== actorId && id !== entry.owner_id);
    if (!ids.length) return [];
    const { rows: valid } = await executor.execute(`
      SELECT u.id FROM users u JOIN profiles p ON p.user_id = u.id
      WHERE u.id = ANY($1::uuid[]) AND u.is_active AND NOT u.is_deleted
        AND NOT EXISTS(SELECT 1 FROM blocked_users b WHERE (b.user_id = $2 AND b.blocked_user_id = u.id)
          OR (b.user_id = u.id AND b.blocked_user_id = $2))`, [ids, actorId]);
    if (valid.length !== ids.length) throw requestError(400, 'INVALID_INVITEE', 'Invite active musicians you have not blocked');
    const { rows: members } = await executor.execute(`
      SELECT user_id FROM organization_members WHERE organization_id = $1::uuid AND status = 'active' AND user_id = ANY($2::uuid[])`,
    [entry.organization_id, ids]);
    const outsiders = ids.filter(id => !members.some(member => member.user_id === id));
    const { rows: count } = await executor.execute(`
      SELECT COUNT(*)::int AS count FROM calendar_participants WHERE entry_id = $1 AND invited AND NOT (user_id = ANY($2::uuid[]))`,
    [entry.id, outsiders]);
    if (count[0].count + outsiders.length > CALENDAR_LIMITS.invitees) {
      throw requestError(400, 'INVITEE_LIMIT', `An entry can have at most ${CALENDAR_LIMITS.invitees} invitees`);
    }
    if (!outsiders.length) return [];
    const { rows } = await executor.execute(`
      INSERT INTO calendar_participants (entry_id, user_id, invited, invited_by)
      SELECT $1, id, TRUE, $3 FROM unnest($2::uuid[]) AS id
      ON CONFLICT (entry_id, user_id) DO UPDATE SET invited = TRUE, invited_by = EXCLUDED.invited_by
        WHERE NOT calendar_participants.invited
      RETURNING user_id`, [entry.id, outsiders, actorId]);
    return rows.map(row => row.user_id);
  }

  async notifyInvited(executor, entry, userIds) {
    if (!userIds.length) return;
    await notificationRepository.createMany(executor, userIds, {
      kind: 'calendar_invite', title: `You are invited: ${entry.title}`, link: `#calendar-entry?id=${entry.id}`,
      keyPrefix: `calendar-invite:${entry.id}:invited`,
      params: { entryId: entry.id, title: entry.title, startsAt: new Date(entry.starts_at).toISOString(), change: 'invited' },
    });
  }

  async notifyChange(executor, entry, actorId, change) {
    const recipients = (await this.viewerIds(executor, entry)).filter(id => id !== actorId);
    await notificationRepository.createMany(executor, recipients, {
      kind: 'calendar_invite',
      title: change === 'cancelled' ? `Cancelled: ${entry.title}` : change === 'created' ? `New in your band calendar: ${entry.title}` : `Updated: ${entry.title}`,
      link: change === 'removed' ? '#calendar' : `#calendar-entry?id=${entry.id}`,
      keyPrefix: `calendar-change:${entry.id}:${entry.sequence}:${change}`,
      params: { entryId: entry.id, title: entry.title, startsAt: new Date(entry.starts_at).toISOString(), change },
    });
  }

  async writeReminders(executor, entry, userId, offsets) {
    const unique = [...new Set(offsets)];
    if (unique.length > CALENDAR_LIMITS.reminders || unique.some(offset => !REMINDER_OFFSETS.includes(offset))) {
      throw requestError(400, 'INVALID_REMINDERS', `Choose up to ${CALENDAR_LIMITS.reminders} reminder times from the list`);
    }
    await executor.execute(`
      DELETE FROM calendar_reminders WHERE entry_id = $1 AND user_id = $2 AND NOT (offset_minutes = ANY($3::int[]))`,
    [entry.id, userId, unique]);
    await executor.execute(`
      INSERT INTO calendar_reminders (entry_id, user_id, offset_minutes, remind_at, sent_at)
      SELECT $1, $2, value, $4::timestamptz - make_interval(mins => value),
        CASE WHEN $4::timestamptz - make_interval(mins => value) <= NOW() THEN NOW() END
      FROM unnest($3::int[]) AS value
      ON CONFLICT (entry_id, user_id, offset_minutes) DO NOTHING`, [entry.id, userId, unique, entry.starts_at]);
  }

  async create(userId, input) {
    const times = resolveTimes(input);
    return realmConnector.transaction(async executor => {
      if (input.organizationId) {
        const access = await organizationRepository.requireMember(executor, input.organizationId, userId, 'manage_calendar', { lock: true });
        if (access.organization.kind !== 'band') throw requestError(400, 'CALENDAR_BAND_ONLY', 'Calendars are available for band pages');
      } else {
        await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      }
      const scope = input.organizationId ? ['organization_id', input.organizationId] : ['owner_id', userId];
      const { rows: upcoming } = await executor.execute(
        `SELECT COUNT(*)::int AS count FROM calendar_entries WHERE ${scope[0]} = $1 AND ends_at >= NOW()`, [scope[1]]);
      if (upcoming[0].count >= 500) throw requestError(429, 'CALENDAR_LIMIT', 'At most 500 upcoming entries are allowed per calendar');
      const place = await this.place(executor, input.placeId);
      const { rows } = await executor.execute(`
        INSERT INTO calendar_entries (organization_id, owner_id, created_by, kind, title, starts_at, ends_at, time_zone,
          place_id, address, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [input.organizationId ?? null, input.organizationId ? null : userId, userId, input.kind, input.title, times.startsAt,
        times.endsAt, times.timeZone, place?.id ?? null, input.address ?? null, input.notes ?? null]);
      const entry = rows[0];
      const invited = await this.addInvitees(executor, entry, userId, input.inviteeIds ?? []);
      await this.writeReminders(executor, entry, userId, input.reminderOffsets ?? []);
      if (entry.organization_id) {
        const members = (await this.viewerIds(executor, entry)).filter(id => id !== userId && !invited.includes(id));
        await notificationRepository.createMany(executor, members, {
          kind: 'calendar_invite', title: `New in your band calendar: ${entry.title}`, link: `#calendar-entry?id=${entry.id}`,
          keyPrefix: `calendar-change:${entry.id}:0:created`,
          params: { entryId: entry.id, title: entry.title, startsAt: entry.starts_at.toISOString(), change: 'created' },
        });
      }
      await this.notifyInvited(executor, entry, invited);
      await this.publish(executor, entry, await this.viewerIds(executor, entry));
      return this.detail(executor, entry.id, userId);
    });
  }

  async update(entryId, userId, changes) {
    return realmConnector.transaction(async executor => {
      const entry = await this.lockManaged(executor, entryId, userId);
      const before = await this.viewerIds(executor, entry);
      const updates = {};
      if (changes.startLocal !== undefined) {
        const times = resolveTimes(changes);
        Object.assign(updates, { starts_at: times.startsAt, ends_at: times.endsAt, time_zone: times.timeZone });
      }
      if (changes.placeId !== undefined) updates.place_id = (await this.place(executor, changes.placeId))?.id ?? null;
      for (const [key, column] of [['kind', 'kind'], ['title', 'title'], ['address', 'address'], ['notes', 'notes'], ['status', 'status']]) {
        if (changes[key] !== undefined) updates[column] = changes[key];
      }
      const significant = ['starts_at', 'ends_at', 'time_zone', 'place_id', 'address', 'title', 'status', 'kind']
        .some(column => Object.hasOwn(updates, column) && String(updates[column]) !== String(entry[column]));
      const entries = Object.entries(updates);
      const { rows } = await executor.execute(`
        UPDATE calendar_entries SET ${entries.map(([column], index) => `${column} = $${index + 2}`).join(', ')}${entries.length ? ', ' : ''}
          sequence = sequence + $${entries.length + 2}, updated_at = NOW()
        WHERE id = $1 RETURNING *`, [entry.id, ...entries.map(([, value]) => value), significant ? 1 : 0]);
      const updated = rows[0];
      if (updates.starts_at) {
        await executor.execute(`
          UPDATE calendar_reminders SET remind_at = $2::timestamptz - make_interval(mins => offset_minutes),
            sent_at = CASE WHEN $2::timestamptz - make_interval(mins => offset_minutes) > NOW() THEN NULL ELSE COALESCE(sent_at, NOW()) END
          WHERE entry_id = $1`, [entry.id, updated.starts_at]);
      }
      if (significant) {
        const change = updated.status === 'cancelled' && entry.status !== 'cancelled' ? 'cancelled' : 'updated';
        await this.notifyChange(executor, updated, userId, change);
      }
      await this.publish(executor, updated, [...before, userId]);
      return this.detail(executor, updated.id, userId);
    });
  }

  async remove(entryId, userId) {
    return realmConnector.transaction(async executor => {
      const entry = await this.lockManaged(executor, entryId, userId);
      const viewers = await this.viewerIds(executor, entry);
      if (entry.status === 'scheduled' && new Date(entry.ends_at) > new Date()) {
        await this.notifyChange(executor, { ...entry, sequence: entry.sequence + 1 }, userId, 'removed');
      }
      await executor.execute('DELETE FROM calendar_entries WHERE id = $1', [entry.id]);
      await this.publish(executor, entry, viewers);
    });
  }

  async invite(entryId, actorId, userIds) {
    return realmConnector.transaction(async executor => {
      const entry = await this.lockManaged(executor, entryId, actorId);
      const invited = await this.addInvitees(executor, entry, actorId, userIds);
      await this.notifyInvited(executor, entry, invited);
      await this.publish(executor, entry, await this.viewerIds(executor, entry));
      return this.detail(executor, entry.id, actorId);
    });
  }

  // Removes an invitation. Invitees may remove themselves; organizers anyone.
  async uninvite(entryId, actorId, userId) {
    return realmConnector.transaction(async executor => {
      const self = actorId === userId;
      const entry = self
        ? (await executor.execute(`SELECT e.* FROM calendar_entries e WHERE e.id = $1 AND ${calendarVisibleTo('e', '$2::uuid')} FOR UPDATE OF e`,
          [entryId, actorId])).rows[0]
        : await this.lockManaged(executor, entryId, actorId);
      if (!entry) throw notFound();
      const viewers = await this.viewerIds(executor, entry);
      const { rowCount } = await executor.execute(`
        UPDATE calendar_participants SET invited = FALSE, invited_by = NULL WHERE entry_id = $1 AND user_id = $2 AND invited`,
      [entry.id, userId]);
      if (!rowCount) throw requestError(404, 'INVITEE_NOT_FOUND', 'This person is not invited');
      await executor.execute(`
        DELETE FROM calendar_participants cp USING calendar_entries e
        WHERE cp.entry_id = $1 AND cp.user_id = $2 AND e.id = cp.entry_id AND NOT ${calendarVisibleTo('e', 'cp.user_id')}`, [entry.id, userId]);
      await executor.execute(`
        DELETE FROM calendar_reminders r USING calendar_entries e
        WHERE r.entry_id = $1 AND r.user_id = $2 AND e.id = r.entry_id AND NOT ${calendarVisibleTo('e', 'r.user_id')}`, [entry.id, userId]);
      await this.publish(executor, entry, viewers);
    });
  }

  async respond(entryId, userId, response) {
    return realmConnector.transaction(async executor => {
      const row = await this.row(executor, entryId, userId);
      if (!row) throw notFound();
      await executor.execute(`
        INSERT INTO calendar_participants (entry_id, user_id, response, responded_at) VALUES ($1, $2, $3, NOW())
        ON CONFLICT (entry_id, user_id) DO UPDATE SET response = EXCLUDED.response, responded_at = NOW()`,
      [row.id, userId, response]);
      await this.publish(executor, row, await this.viewerIds(executor, row));
      return this.detail(executor, row.id, userId);
    });
  }

  async setReminders(entryId, userId, offsets) {
    return realmConnector.transaction(async executor => {
      const row = await this.row(executor, entryId, userId);
      if (!row) throw notFound();
      await this.writeReminders(executor, row, userId, offsets);
      await publishEvent(executor, 'calendar.changed', { userId, id: row.id });
      return this.detail(executor, row.id, userId);
    });
  }

  async entryIcs(entryId, userId, origin) {
    const entry = await this.get(entryId, userId);
    return { entry, body: buildCalendar([entry], { name: entry.title, origin }) };
  }

  async feedStatus(userId) {
    const { rows } = await realmConnector.execute(
      'SELECT created_at, last_used_at FROM calendar_feed_tokens WHERE user_id = $1', [userId]);
    return rows[0] ? { active: true, createdAt: rows[0].created_at, lastUsedAt: rows[0].last_used_at } : { active: false };
  }

  // Issues a new feed token, replacing (and so revoking) any previous one.
  // Only its hash is stored; the token itself is returned once.
  async createFeed(userId) {
    const token = randomBytes(32).toString('base64url');
    const { rows } = await realmConnector.execute(`
      INSERT INTO calendar_feed_tokens (user_id, token_hash) VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, created_at = NOW(), last_used_at = NULL
      RETURNING created_at`, [userId, hashFeedToken(token)]);
    return { token, active: true, createdAt: rows[0].created_at, lastUsedAt: null };
  }

  async revokeFeed(userId) {
    await realmConnector.execute('DELETE FROM calendar_feed_tokens WHERE user_id = $1', [userId]);
  }

  async feed(token, origin) {
    if (!FEED_TOKEN.test(token)) return null;
    const { rows: owners } = await realmConnector.execute(`
      UPDATE calendar_feed_tokens t SET last_used_at = CASE
          WHEN t.last_used_at IS NULL OR t.last_used_at < NOW() - INTERVAL '1 hour' THEN NOW() ELSE t.last_used_at END
      FROM users u WHERE t.token_hash = $1 AND u.id = t.user_id AND u.is_active AND NOT u.is_deleted
      RETURNING t.user_id`, [hashFeedToken(token)]);
    if (!owners.length) return null;
    const userId = owners[0].user_id;
    const { rows } = await realmConnector.execute(`${entrySelect('$1::uuid')}
      WHERE ${calendarVisibleTo('e', '$1::uuid')}
        AND e.ends_at >= NOW() - INTERVAL '90 days' AND e.starts_at <= NOW() + INTERVAL '400 days'
      ORDER BY e.starts_at, e.id LIMIT 1000`, [userId]);
    return buildCalendar(rows.map(entryView), { name: 'Every.music calendar', origin });
  }

  // Leases due reminders with SKIP LOCKED and creates their notifications in
  // the same transaction. Reminders for cancelled, finished or no longer
  // visible entries are marked sent without a notification.
  async dispatchDue(executor, { batchSize = 100 } = {}) {
    const { rows: due } = await executor.execute(`
      WITH due AS (
        SELECT id FROM calendar_reminders WHERE sent_at IS NULL AND remind_at <= NOW()
        ORDER BY remind_at LIMIT $1 FOR UPDATE SKIP LOCKED
      )
      UPDATE calendar_reminders r SET sent_at = NOW() FROM due WHERE r.id = due.id RETURNING r.id`, [batchSize]);
    if (!due.length) return { leased: 0, sent: 0 };
    const { rows } = await executor.execute(`
      SELECT r.id AS reminder_id, r.user_id, r.offset_minutes, r.remind_at, e.id, e.title, e.starts_at
      FROM calendar_reminders r JOIN calendar_entries e ON e.id = r.entry_id
      WHERE r.id = ANY($1::uuid[]) AND e.status = 'scheduled' AND e.ends_at > NOW() AND ${calendarVisibleTo('e', 'r.user_id')}`,
    [due.map(row => row.id)]);
    let sent = 0;
    for (const row of rows) {
      const id = await notificationRepository.create(executor, {
        userId: row.user_id, kind: 'calendar_reminder', title: `Reminder: ${row.title}`, link: `#calendar-entry?id=${row.id}`,
        key: `calendar-reminder:${row.reminder_id}:${new Date(row.remind_at).getTime()}`,
        params: { entryId: row.id, title: row.title, startsAt: new Date(row.starts_at).toISOString(), offsetMinutes: row.offset_minutes },
      });
      if (id) sent += 1;
    }
    return { leased: due.length, sent };
  }
}

export const calendarRepository = new CalendarRepository();
