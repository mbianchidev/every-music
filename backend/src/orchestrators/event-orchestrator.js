import { EventConductor } from '../conductors/event-conductor.js';
import { EventReminderJob } from '../engines/event-reminder-job.js';
import { identityGuard, optionalIdentityGuard } from '../guards/identity-guard.js';
import { uuid, text, object, params, paging } from '../validators/http-schemas.js';
import { realmConnector } from '../repositories/realm-connector.js';
import { eventRepository } from '../repositories/event-repository.js';
import {
  ATTENDANCE_STATUSES, COMMUNICATION_KINDS, EVENT_STATUSES, EVENT_TYPES, LIMITS, LINEUP_ROLES, REMINDER_RANGE, SORTS, VISIBILITIES,
} from '../engines/event-model.js';

const local = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$' };
const nullable = schema => ({ ...schema, type: [schema.type, 'null'] });
const optionalId = { anyOf: [{ const: '' }, uuid] };
const mediaUrl = { type: 'string', pattern: '^/realm/media/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' };
const event = {
  title: text(160, 3),
  description: { type: ['string', 'null'], maxLength: 10000 },
  type: { enum: EVENT_TYPES },
  timezone: text(64),
  startsAt: local,
  endsAt: nullable(local),
  doorsOpenAt: nullable(local),
  venueId: nullable(uuid),
  placeId: { type: ['integer', 'null'], minimum: 1, maximum: 2147483647 },
  address: { type: ['string', 'null'], maxLength: 300 },
  latitude: { type: ['number', 'null'], minimum: -90, maximum: 90 },
  longitude: { type: ['number', 'null'], minimum: -180, maximum: 180 },
  capacity: { type: ['integer', 'null'], minimum: 1, maximum: 10000000 },
  ticketsSold: { type: 'integer', minimum: 0, maximum: 10000000 },
  genreIds: { type: 'array', maxItems: LIMITS.genres, uniqueItems: true, items: uuid },
  images: { type: 'array', maxItems: LIMITS.images, uniqueItems: true, items: mediaUrl },
  ticketLinks: { type: 'array', maxItems: LIMITS.ticketLinks, items: object({ label: text(80), url: text(2048) }, ['label', 'url']) },
  organizerIds: { type: 'array', maxItems: LIMITS.organizers, uniqueItems: true, items: uuid },
  lineup: {
    type: 'array', maxItems: LIMITS.lineup,
    items: object({
      role: { enum: LINEUP_ROLES }, bandId: nullable(uuid), artistId: nullable(uuid), name: { type: ['string', 'null'], maxLength: 160 },
      setStartsAt: nullable(local), setEndsAt: nullable(local),
    }, ['role']),
  },
  visibility: { enum: VISIBILITIES },
};
const when = { enum: ['', 'upcoming', 'past', 'all'] };
const search = object({
  ...paging, q: text(200, 0), when, type: { enum: ['', ...EVENT_TYPES] }, sort: { enum: ['', ...SORTS] },
  bandId: optionalId, artistId: optionalId, organizerId: optionalId, venueId: optionalId, genreId: optionalId,
  from: { type: 'string', pattern: '^(\\d{4}-\\d{2}-\\d{2})?$' }, to: { type: 'string', pattern: '^(\\d{4}-\\d{2}-\\d{2})?$' },
  placeId: { type: 'string', pattern: '^(\\d{1,10})?$' }, radiusKm: { type: 'string', pattern: '^(\\d{1,3})?$' },
  latitude: { type: 'string', pattern: '^(-?\\d{1,3}(\\.\\d{1,8})?)?$' }, longitude: { type: 'string', pattern: '^(-?\\d{1,3}(\\.\\d{1,8})?)?$' },
  location: text(160, 0),
});
const report = object({
  category: { enum: ['spam', 'harassment', 'threats', 'inappropriate_language', 'other'] }, details: text(2000, 5), consent: { const: true },
}, ['category', 'details', 'consent']);
const eventParams = params('eventId');
const lists = object({ ...paging, when });

export async function eventOrchestrator(fastify, { config = {}, connector = realmConnector, backgroundJobs = true }) {
  eventRepository.configure({ origin: config.boundaries?.portalOrigins?.[0] ?? '' });
  const conductor = new EventConductor();
  const job = new EventReminderJob({ intervalSeconds: config.events?.reminderIntervalSeconds ?? 60, connector, logger: fastify.log });
  const route = (method, url, handler, schema = {}, guard = identityGuard, extra = {}) => fastify.route({
    method, url, preHandler: guard, schema, handler, ...extra,
  });
  const limited = (max, timeWindow = '1 hour') => ({ config: { rateLimit: { max, timeWindow } } });

  route('GET', '/gigs', conductor.search, { querystring: search }, optionalIdentityGuard);
  route('POST', '/gigs', conductor.create, { body: object(event, ['title', 'timezone', 'startsAt']) }, identityGuard, limited(20));
  route('GET', '/gigs/mine', conductor.mine, { querystring: object({ ...paging, when, role: { enum: ['', 'organizing', 'attending'] } }) });
  route('GET', '/gigs/organizations/:organizationId', conductor.forOrganization,
    { params: params('organizationId'), querystring: lists }, optionalIdentityGuard);
  route('GET', '/gigs/profiles/:userId', conductor.forProfile, { params: params('userId'), querystring: lists }, optionalIdentityGuard);
  route('GET', '/gigs/:eventId', conductor.detail, { params: eventParams }, optionalIdentityGuard);
  route('GET', '/gigs/:eventId/calendar.ics', conductor.calendar, { params: eventParams }, optionalIdentityGuard);
  route('PATCH', '/gigs/:eventId', conductor.update, {
    params: eventParams,
    body: { ...object({ ...event, status: { enum: EVENT_STATUSES }, statusNote: { type: ['string', 'null'], maxLength: 4000 } }), minProperties: 1 },
  }, identityGuard, limited(120));
  route('DELETE', '/gigs/:eventId', conductor.remove, { params: eventParams });
  route('PUT', '/gigs/:eventId/attendance', conductor.attend, {
    params: eventParams, body: object({ status: { enum: ATTENDANCE_STATUSES }, showOnProfile: { type: 'boolean' } }, ['status']),
  }, identityGuard, limited(120));
  route('DELETE', '/gigs/:eventId/attendance', conductor.attend, { params: eventParams });
  route('PUT', '/gigs/:eventId/reminders', conductor.reminders, {
    params: eventParams,
    body: object({
      offsets: {
        type: 'array', maxItems: LIMITS.reminders, uniqueItems: true,
        items: { type: 'integer', minimum: REMINDER_RANGE.minimum, maximum: REMINDER_RANGE.maximum },
      },
    }, ['offsets']),
  }, identityGuard, limited(60));
  route('DELETE', '/gigs/:eventId/lineup/:entryId', conductor.leaveLineup, { params: params('eventId', 'entryId') });
  route('GET', '/gigs/:eventId/posts', conductor.posts, { params: eventParams, querystring: object(paging) });
  route('POST', '/gigs/:eventId/posts', conductor.createPost, {
    params: eventParams, body: object({ body: text(2000) }, ['body']),
  }, identityGuard, limited(30, '10 minutes'));
  route('DELETE', '/gigs/:eventId/posts/:postId', conductor.removePost, { params: params('eventId', 'postId') });
  route('POST', '/gigs/:eventId/posts/:postId/reports', conductor.reportPost, {
    params: params('eventId', 'postId'), body: report,
  }, identityGuard, limited(20));
  route('POST', '/gigs/:eventId/reports', conductor.reportEvent, { params: eventParams, body: report }, identityGuard, limited(20));
  route('POST', '/gigs/:eventId/communications', conductor.communicate, {
    params: eventParams, body: object({ kind: { enum: COMMUNICATION_KINDS }, body: text(4000) }, ['kind', 'body']),
  }, identityGuard, limited(30));

  route('GET', '/organizations/:organizationId/verification-request', conductor.verificationStatus, { params: params('organizationId') });
  route('POST', '/organizations/:organizationId/verification-request', conductor.requestVerification, {
    params: params('organizationId'), body: object({ note: text(2000, 10), documentMediaId: nullable(uuid) }, ['note']),
  }, identityGuard, limited(5, '1 day'));
  route('DELETE', '/organizations/:organizationId/verification-request/:requestId', conductor.cancelVerification, {
    params: params('organizationId', 'requestId'),
  });

  fastify.addHook('onListen', async () => { if (backgroundJobs) job.start(); });
  fastify.addHook('preClose', async () => { await job.stop(); });
}
