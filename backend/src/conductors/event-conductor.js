import { eventRepository } from '../repositories/event-repository.js';
import { eventDiscussionRepository } from '../repositories/event-discussion-repository.js';
import { organizationVerificationRepository } from '../repositories/organization-verification-repository.js';
import { placeRepository } from '../repositories/place-repository.js';
import { buildIcs, safeFileName } from '../engines/event-model.js';
import { requestError } from '../engines/request-error.js';
import { ok, pagination, pageOf } from './response-helpers.js';

const DEFAULT_RADIUS_KM = 50;
const lower = value => (value ? value.toLowerCase() : undefined);
const userOf = request => request.authenticatedUser?.userId ?? null;
const adminOf = request => request.authenticatedUser?.role === 'admin';
const eventOf = request => request.params.eventId.toLowerCase();

function coordinate(value, limit) {
  if (value === undefined || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > limit) throw requestError(400, 'VALIDATION_ERROR', 'Coordinates are out of range');
  return number;
}

export async function searchFilters(query, places = placeRepository) {
  const filters = {
    q: query.q?.trim() || undefined, when: query.when || 'upcoming', type: query.type || undefined, sort: query.sort || 'date',
    bandId: lower(query.bandId), artistId: lower(query.artistId), organizerId: lower(query.organizerId), venueId: lower(query.venueId),
    genreId: lower(query.genreId), from: query.from || undefined, to: query.to || undefined, location: query.location?.trim() || undefined,
  };
  if (filters.from && filters.to && filters.from > filters.to) throw requestError(400, 'VALIDATION_ERROR', 'The start date must be before the end date');
  const radius = query.radiusKm ? Number(query.radiusKm) : DEFAULT_RADIUS_KM;
  if (!Number.isInteger(radius) || radius < 1 || radius > 500) throw requestError(400, 'VALIDATION_ERROR', 'Choose a radius from 1 to 500 km');
  const latitude = coordinate(query.latitude, 90);
  const longitude = coordinate(query.longitude, 180);
  if ((latitude === undefined) !== (longitude === undefined)) throw requestError(400, 'VALIDATION_ERROR', 'Send latitude and longitude together');
  if (query.placeId) {
    const place = await places.find(Number(query.placeId));
    if (!place) throw requestError(404, 'PLACE_NOT_FOUND', 'Place not found');
    filters.center = { latitude: place.latitude, longitude: place.longitude };
  } else if (latitude !== undefined) filters.center = { latitude, longitude };
  if (filters.center) filters.radiusKm = radius;
  return filters;
}

const normalizeIds = body => ({
  ...body,
  ...(body.venueId ? { venueId: body.venueId.toLowerCase() } : {}),
  ...(body.organizerIds ? { organizerIds: body.organizerIds.map(id => id.toLowerCase()) } : {}),
  ...(body.genreIds ? { genreIds: body.genreIds.map(id => id.toLowerCase()) } : {}),
  ...(body.images ? { images: body.images.map(url => url.toLowerCase()) } : {}),
});

export class EventConductor {
  search = async (request, reply) => {
    const page = pagination(request);
    const rows = await eventRepository.search(await searchFilters(request.query), page, userOf(request));
    return ok(reply, pageOf(rows, 'events', page));
  };

  mine = async (request, reply) => {
    const page = pagination(request);
    const rows = await eventRepository.mine(userOf(request), { role: request.query.role || 'organizing', when: request.query.when || 'upcoming' }, page);
    return ok(reply, pageOf(rows, 'events', page));
  };

  forOrganization = async (request, reply) => {
    const page = pagination(request);
    const rows = await eventRepository.forOrganization(request.params.organizationId.toLowerCase(), request.query.when || 'upcoming', page, userOf(request));
    return ok(reply, pageOf(rows, 'events', page));
  };

  forProfile = async (request, reply) => {
    const page = pagination(request);
    const rows = await eventRepository.forProfile(request.params.userId.toLowerCase(), request.query.when || 'upcoming', page, userOf(request));
    return ok(reply, pageOf(rows, 'events', page));
  };

  detail = async (request, reply) => ok(reply, await eventRepository.detail(eventOf(request), userOf(request), adminOf(request)));

  calendar = async (request, reply) => {
    const event = await eventRepository.calendar(eventOf(request), userOf(request));
    return reply.type('text/calendar; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${safeFileName(event.title)}"`)
      .send(buildIcs(event, { origin: eventRepository.origin }));
  };

  create = async (request, reply) => ok(reply, await eventRepository.create(userOf(request), normalizeIds(request.body)), 201);

  update = async (request, reply) => ok(reply, await eventRepository.update(userOf(request), eventOf(request), normalizeIds(request.body)));

  remove = async (request, reply) => ok(reply, await eventRepository.remove(userOf(request), eventOf(request)));

  attend = async (request, reply) => ok(reply, request.method === 'DELETE'
    ? await eventRepository.removeAttendance(userOf(request), eventOf(request))
    : await eventRepository.setAttendance(userOf(request), eventOf(request), request.body));

  reminders = async (request, reply) => ok(reply, await eventRepository.setReminders(userOf(request), eventOf(request), request.body.offsets));

  leaveLineup = async (request, reply) => ok(reply,
    await eventRepository.leaveLineup(userOf(request), eventOf(request), request.params.entryId.toLowerCase()));

  posts = async (request, reply) => {
    const page = pagination(request);
    const rows = await eventDiscussionRepository.posts(userOf(request), eventOf(request), page, adminOf(request));
    return ok(reply, pageOf(rows, 'posts', page));
  };

  createPost = async (request, reply) => ok(reply,
    await eventDiscussionRepository.createPost(userOf(request), eventOf(request), request.body.body, adminOf(request)), 201);

  removePost = async (request, reply) => ok(reply, await eventDiscussionRepository.removePost(
    userOf(request), eventOf(request), request.params.postId.toLowerCase(), adminOf(request)));

  reportPost = async (request, reply) => ok(reply, await eventDiscussionRepository.reportPost(
    userOf(request), eventOf(request), request.params.postId.toLowerCase(), request.body, adminOf(request)), 201);

  reportEvent = async (request, reply) => ok(reply,
    await eventDiscussionRepository.reportEvent(userOf(request), eventOf(request), request.body), 201);

  communicate = async (request, reply) => ok(reply,
    await eventDiscussionRepository.createCommunication(userOf(request), eventOf(request), request.body), 201);

  verificationStatus = async (request, reply) => ok(reply,
    await organizationVerificationRepository.status(request.params.organizationId.toLowerCase(), userOf(request)));

  requestVerification = async (request, reply) => ok(reply,
    await organizationVerificationRepository.submit(request.params.organizationId.toLowerCase(), userOf(request), request.body), 201);

  cancelVerification = async (request, reply) => ok(reply, await organizationVerificationRepository.cancel(
    request.params.organizationId.toLowerCase(), userOf(request), request.params.requestId.toLowerCase()));
}
