import { calendarRepository } from '../repositories/calendar-repository.js';
import { bandChatRepository } from '../repositories/band-chat-repository.js';
import { reviewRepository, profileRatingRepository } from '../repositories/review-repository.js';
import { requestError } from '../engines/request-error.js';
import { ok, pagination, pageOf } from './response-helpers.js';
import { DEFAULT_ATTACHMENT_BYTES } from '../../config/infrastructure.js';

const userOf = request => request.authenticatedUser.userId;
const lower = value => value.toLowerCase();
const optionalText = value => (typeof value === 'string' ? value.trim() || null : value);
const TIME_FIELDS = ['startLocal', 'endLocal', 'timeZone'];

// Normalizes calendar entry input. Start, end and time zone always travel
// together so the server can resolve them consistently.
export function calendarInput(body, { creating = false } = {}) {
  const input = {};
  if (body.kind !== undefined) input.kind = body.kind;
  if (body.status !== undefined) input.status = body.status;
  if (body.title !== undefined) {
    input.title = body.title.trim();
    if (!input.title) throw requestError(400, 'VALIDATION_ERROR', 'Add a title');
  }
  for (const key of ['address', 'notes']) if (body[key] !== undefined) input[key] = optionalText(body[key]);
  if (body.placeId !== undefined) input.placeId = body.placeId;
  const given = TIME_FIELDS.filter(key => body[key] !== undefined);
  if (given.length && given.length !== TIME_FIELDS.length) {
    throw requestError(400, 'VALIDATION_ERROR', 'Send startLocal, endLocal and timeZone together');
  }
  for (const key of given) input[key] = body[key];
  if (creating) {
    if (body.organizationId) input.organizationId = lower(body.organizationId);
    input.inviteeIds = (body.inviteeIds ?? []).map(lower);
    input.reminderOffsets = body.reminderOffsets ?? [];
  }
  return input;
}

function sendCalendar(reply, body, filename) {
  reply.type('text/calendar; charset=utf-8').header('Cache-Control', 'private, no-store');
  if (filename) reply.header('Content-Disposition', `attachment; filename="${filename}"`);
  return reply.send(body);
}

export class BandCollabConductor {
  constructor(config = {}) {
    this.origin = config.boundaries?.portalOrigins?.[0] ?? '';
    this.attachmentBytes = config.attachmentLimit ?? DEFAULT_ATTACHMENT_BYTES;
  }

  calendar = async (request, reply) => {
    const page = pagination(request);
    const rows = await calendarRepository.list(userOf(request), {
      when: request.query.when, organizationId: request.params.organizationId ? lower(request.params.organizationId) : null,
    }, page);
    return ok(reply, pageOf(rows, 'entries', page));
  };

  entry = async (request, reply) => ok(reply, await calendarRepository.get(lower(request.params.entryId), userOf(request)));

  createEntry = async (request, reply) => ok(reply,
    await calendarRepository.create(userOf(request), calendarInput(request.body, { creating: true })), 201);

  updateEntry = async (request, reply) => ok(reply,
    await calendarRepository.update(lower(request.params.entryId), userOf(request), calendarInput(request.body)));

  removeEntry = async (request, reply) => {
    await calendarRepository.remove(lower(request.params.entryId), userOf(request));
    return ok(reply, { message: 'Calendar entry removed' });
  };

  entryIcs = async (request, reply) => {
    const { body } = await calendarRepository.entryIcs(lower(request.params.entryId), userOf(request), this.origin);
    return sendCalendar(reply, body, `every-music-${lower(request.params.entryId)}.ics`);
  };

  invite = async (request, reply) => ok(reply,
    await calendarRepository.invite(lower(request.params.entryId), userOf(request), request.body.userIds));

  uninvite = async (request, reply) => {
    await calendarRepository.uninvite(lower(request.params.entryId), userOf(request), lower(request.params.userId));
    return ok(reply, { message: 'Invitation removed' });
  };

  respond = async (request, reply) => ok(reply,
    await calendarRepository.respond(lower(request.params.entryId), userOf(request), request.body.response));

  reminders = async (request, reply) => ok(reply,
    await calendarRepository.setReminders(lower(request.params.entryId), userOf(request), request.body.offsets));

  feedStatus = async (request, reply) => ok(reply, await calendarRepository.feedStatus(userOf(request)));

  createFeed = async (request, reply) => ok(reply, await calendarRepository.createFeed(userOf(request)), 201);

  revokeFeed = async (request, reply) => {
    await calendarRepository.revokeFeed(userOf(request));
    return ok(reply, { active: false });
  };

  // Unknown or revoked tokens answer directly instead of through the error
  // handler, so calendar apps polling an old link do not flood the error log.
  feed = async (request, reply) => {
    const body = await calendarRepository.feed(request.params.file.slice(0, -'.ics'.length), this.origin);
    if (!body) {
      return reply.code(404).send({
        success: false, error: { code: 'CALENDAR_FEED_NOT_FOUND', message: 'This calendar feed does not exist or was revoked' },
      });
    }
    return sendCalendar(reply, body);
  };

  bandChats = async (request, reply) => ok(reply, { chats: await bandChatRepository.list(userOf(request)) });

  chat = async (request, reply) => {
    const page = pagination(request);
    const result = await bandChatRepository.chat(lower(request.params.organizationId), userOf(request), page);
    const chat = { ...result.chat, limits: { ...result.chat.limits, attachmentBytes: this.attachmentBytes } };
    return ok(reply, { ...pageOf(result.rows, 'messages', page), chat, keys: result.keys });
  };

  sendChat = async (request, reply) => ok(reply,
    await bandChatRepository.send(lower(request.params.organizationId), userOf(request), request.body), 201);

  readChat = async (request, reply) => ok(reply,
    await bandChatRepository.markRead(lower(request.params.organizationId), userOf(request)));

  removeChatMessage = async (request, reply) => {
    await bandChatRepository.remove(lower(request.params.organizationId), lower(request.params.messageId), userOf(request));
    return ok(reply, { message: 'Message removed' });
  };

  reportChatMessage = async (request, reply) => ok(reply, await bandChatRepository.report(
    lower(request.params.organizationId), lower(request.params.messageId), userOf(request), request.body), 201);

  reviews = async (request, reply) => {
    const page = pagination(request);
    const result = await reviewRepository.list(request.params.profileId, userOf(request), page);
    return ok(reply, {
      ...pageOf(result.rows, 'reviews', page), subjectId: result.subjectId, summary: result.summary,
      mine: result.mine, manage: result.manage, canReview: result.canReview,
    });
  };

  writeReview = async (request, reply) => {
    const body = request.body.body.trim();
    if (!body) throw requestError(400, 'VALIDATION_ERROR', 'Write a few words for your review');
    const review = await reviewRepository.write(request.params.profileId, userOf(request), { stars: request.body.stars, body });
    const { created, ...view } = review;
    return ok(reply, view, created ? 201 : 200);
  };

  removeOwnReview = async (request, reply) => {
    await reviewRepository.removeOwn(request.params.profileId, userOf(request));
    return ok(reply, { message: 'Review removed' });
  };

  moderateReview = async (request, reply) => ok(reply,
    await reviewRepository.moderate(lower(request.params.reviewId), userOf(request), request.body.status));

  removeReview = async (request, reply) => {
    await reviewRepository.remove(lower(request.params.reviewId), userOf(request));
    return ok(reply, { message: 'Review removed' });
  };

  rating = async (request, reply) => ok(reply, await profileRatingRepository.summary(request.params.profileId, userOf(request)));

  rate = async (request, reply) => {
    await profileRatingRepository.rate(request.params.profileId, userOf(request), request.body.stars);
    return ok(reply, await profileRatingRepository.summary(request.params.profileId, userOf(request)));
  };

  removeRating = async (request, reply) => {
    await profileRatingRepository.remove(request.params.profileId, userOf(request));
    return ok(reply, await profileRatingRepository.summary(request.params.profileId, userOf(request)));
  };
}
