import { createHash } from 'node:crypto';
import { BandCollabConductor } from '../conductors/band-collab-conductor.js';
import { BandCollabJobs } from '../engines/band-collab-jobs.js';
import { identityGuard } from '../guards/identity-guard.js';
import { realmConnector } from '../repositories/realm-connector.js';
import { uuid, text, object, params, paging } from '../validators/http-schemas.js';
import {
  CALENDAR_KINDS, CALENDAR_LIMITS, CALENDAR_RESPONSES, CALENDAR_STATUSES, LOCAL_TIME_PATTERN, REMINDER_OFFSETS,
} from '../engines/calendar-model.js';
import { GROUP_LIMITS } from '../engines/message-security.js';

const limit = (max, timeWindow, extra = {}) => ({ rateLimit: { max, timeWindow, ...extra } });
const nullableText = maxLength => ({ type: ['string', 'null'], maxLength });
const localTime = { type: 'string', pattern: LOCAL_TIME_PATTERN };
const ids = maxItems => ({ type: 'array', maxItems, uniqueItems: true, items: uuid });
const entryFields = {
  kind: { enum: CALENDAR_KINDS },
  title: text(CALENDAR_LIMITS.title),
  startLocal: localTime,
  endLocal: localTime,
  timeZone: text(64),
  placeId: { type: ['integer', 'null'], minimum: 1, maximum: 2147483647 },
  address: nullableText(CALENDAR_LIMITS.address),
  notes: nullableText(CALENDAR_LIMITS.notes),
};
const offsets = { type: 'array', maxItems: CALENDAR_LIMITS.reminders, uniqueItems: true, items: { enum: REMINDER_OFFSETS } };
const listQuery = object({ ...paging, when: { enum: ['upcoming', 'past'] } });
const profile = object({ profileId: uuid }, ['profileId']);
const stars = { type: 'integer', minimum: 1, maximum: 5 };
const reportCategories = ['spam', 'harassment', 'threats', 'inappropriate_language', 'fake_profile', 'other'];

export async function bandCollabOrchestrator(fastify, { config = {}, connector = realmConnector, backgroundJobs = true } = {}) {
  const conductor = new BandCollabConductor(config);
  const route = (method, url, handler, { schema = {}, guard = identityGuard, config: routeConfig, ...options } = {}) => fastify.route({
    method, url, schema, handler, ...(guard ? { preHandler: guard } : {}), ...(routeConfig ? { config: routeConfig } : {}), ...options,
  });
  const entry = params('entryId');
  const band = params('organizationId');

  route('GET', '/calendar', conductor.calendar, { schema: { querystring: listQuery } });
  route('POST', '/calendar/entries', conductor.createEntry, {
    config: limit(60, '1 hour'),
    schema: { body: object({
      ...entryFields, organizationId: uuid, inviteeIds: ids(CALENDAR_LIMITS.invitees), reminderOffsets: offsets,
    }, ['kind', 'title', 'startLocal', 'endLocal', 'timeZone']) },
  });
  route('GET', '/calendar/entries/:entryId', conductor.entry, { schema: { params: entry } });
  route('PATCH', '/calendar/entries/:entryId', conductor.updateEntry, {
    config: limit(240, '1 hour'),
    schema: { params: entry, body: { ...object({ ...entryFields, status: { enum: CALENDAR_STATUSES } }), minProperties: 1 } },
  });
  route('DELETE', '/calendar/entries/:entryId', conductor.removeEntry, { schema: { params: entry } });
  route('GET', '/calendar/entries/:entryId/ics', conductor.entryIcs, { schema: { params: entry } });
  route('POST', '/calendar/entries/:entryId/invitees', conductor.invite, {
    config: limit(60, '1 hour'),
    schema: { params: entry, body: object({ userIds: { ...ids(CALENDAR_LIMITS.invitees), minItems: 1 } }, ['userIds']) },
  });
  route('DELETE', '/calendar/entries/:entryId/invitees/:userId', conductor.uninvite, { schema: { params: params('entryId', 'userId') } });
  route('PUT', '/calendar/entries/:entryId/response', conductor.respond, {
    schema: { params: entry, body: object({ response: { enum: CALENDAR_RESPONSES } }, ['response']) },
  });
  route('PUT', '/calendar/entries/:entryId/reminders', conductor.reminders, {
    schema: { params: entry, body: object({ offsets }, ['offsets']) },
  });
  route('GET', '/calendar/feed', conductor.feedStatus);
  route('POST', '/calendar/feed', conductor.createFeed, { config: limit(10, '1 hour') });
  route('DELETE', '/calendar/feed', conductor.revokeFeed);
  // Calendar apps fetch the private feed without an Authorization header. The
  // token is the credential, so it is limited per token and kept out of logs.
  route('GET', '/calendar/feeds/:file', conductor.feed, {
    guard: null,
    logLevel: 'warn',
    config: limit(60, '1 hour', {
      keyGenerator: request => `calendar-feed:${createHash('sha256').update(String(request.params?.file ?? request.ip)).digest('hex')}`,
    }),
    schema: { params: object({ file: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}\\.ics$' } }, ['file']) },
  });
  route('GET', '/organizations/:organizationId/calendar', conductor.calendar, { schema: { params: band, querystring: listQuery } });

  route('GET', '/band-chats', conductor.bandChats);
  route('GET', '/organizations/:organizationId/chat', conductor.chat, { schema: { params: band, querystring: object(paging) } });
  route('PATCH', '/organizations/:organizationId/chat', conductor.readChat, {
    schema: { params: band, body: object({ read: { const: true } }, ['read']) },
  });
  route('POST', '/organizations/:organizationId/chat/messages', conductor.sendChat, {
    config: limit(60, '1 minute'),
    schema: { params: band, body: object({
      clientId: uuid, ciphertext: text(262144), senderKeyId: uuid,
      recipientKeyIds: { ...ids(GROUP_LIMITS.recipients), minItems: 1 }, attachmentIds: ids(GROUP_LIMITS.attachments),
    }, ['clientId', 'ciphertext', 'senderKeyId', 'recipientKeyIds']) },
  });
  route('DELETE', '/organizations/:organizationId/chat/messages/:messageId', conductor.removeChatMessage, {
    schema: { params: params('organizationId', 'messageId') },
  });
  route('POST', '/organizations/:organizationId/chat/messages/:messageId/reports', conductor.reportChatMessage, {
    config: limit(20, '1 hour'),
    schema: { params: params('organizationId', 'messageId'), body: object({
      category: { enum: reportCategories }, details: text(2000, 5), signedEvidence: text(32768), consent: { const: true },
    }, ['category', 'details', 'signedEvidence', 'consent']) },
  });

  route('GET', '/profiles/:profileId/reviews', conductor.reviews, { schema: { params: profile, querystring: object(paging) } });
  route('PUT', '/profiles/:profileId/review', conductor.writeReview, {
    config: limit(20, '1 hour'),
    schema: { params: profile, body: object({ stars, body: text(2000) }, ['stars', 'body']) },
  });
  route('DELETE', '/profiles/:profileId/review', conductor.removeOwnReview, { schema: { params: profile } });
  route('PATCH', '/reviews/:reviewId', conductor.moderateReview, {
    schema: { params: params('reviewId'), body: object({ status: { enum: ['approved', 'hidden'] } }, ['status']) },
  });
  route('DELETE', '/reviews/:reviewId', conductor.removeReview, { schema: { params: params('reviewId') } });
  route('GET', '/profiles/:profileId/rating', conductor.rating, { schema: { params: profile } });
  route('PUT', '/profiles/:profileId/rating', conductor.rate, {
    config: limit(60, '1 hour'), schema: { params: profile, body: object({ stars }, ['stars']) },
  });
  route('DELETE', '/profiles/:profileId/rating', conductor.removeRating, { schema: { params: profile } });

  const jobs = new BandCollabJobs({ config, connector, logger: fastify.log });
  fastify.addHook('onListen', async () => { if (backgroundJobs) jobs.start(); });
  fastify.addHook('preClose', async () => { await jobs.stop(); });
}
