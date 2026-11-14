import { organizationRepository } from '../repositories/organization-repository.js';
import { organizationContentRepository } from '../repositories/organization-content-repository.js';
import { administrationRepository } from '../repositories/administration-repository.js';
import { requestError } from '../engines/request-error.js';
import {
  LIMITS, LINK_TYPES, isCalendarDate, isManagedMediaUrl, isWebUrl, organizationInputErrors, validateLinks,
} from '../engines/organization-model.js';
import { ok, pagination, pageOf } from './response-helpers.js';

const TEXT_FIELDS = [
  'name', 'slug', 'bio', 'pictureUrl', 'city', 'region', 'country', 'contactEmail', 'contactPhone', 'workWithUs',
  'parkingInfo', 'directions', 'youtubeChannelId', 'title', 'caption', 'body', 'url', 'message', 'note',
];

// Trims text, turns blank optional text into null and lower-cases IDs so the
// repositories always receive canonical values.
export function normalizeInput(body = {}) {
  const input = { ...body };
  for (const key of TEXT_FIELDS) {
    if (typeof input[key] !== 'string') continue;
    const value = input[key].trim();
    input[key] = value === '' && key !== 'name' ? null : value;
  }
  if (typeof input.slug === 'string') input.slug = input.slug.toLowerCase();
  if (Array.isArray(input.genreIds)) input.genreIds = [...new Set(input.genreIds.map(id => id.toLowerCase()))];
  if (Array.isArray(input.bandIds)) input.bandIds = input.bandIds.map(id => id.toLowerCase());
  if (typeof input.userId === 'string') input.userId = input.userId.toLowerCase();
  if (typeof input.bandId === 'string') input.bandId = input.bandId.toLowerCase();
  if (typeof input.memberId === 'string') input.memberId = input.memberId.toLowerCase();
  if (Array.isArray(input.links)) input.links = input.links.map(link => ({ linkType: link.linkType, url: String(link.url).trim() }));
  return input;
}

function invalid(reply, details) {
  return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input data', details } });
}

const viewerOf = request => request.authenticatedUser?.userId ?? null;
const userOf = request => request.authenticatedUser.userId;
const idOf = request => request.params.organizationId.toLowerCase();

export class OrganizationConductor {
  async fullDetail(reference, viewerId) {
    const organization = await organizationRepository.detail(reference, viewerId);
    return { ...organization, ...await organizationContentRepository.extras(organization) };
  }

  search = async (request, reply) => {
    const page = pagination(request);
    const { kind, q, genreId, location, sort } = request.query;
    const rows = await organizationRepository.search({
      kind: kind || null, q: q?.trim() || null, genreId: genreId || null, location: location?.trim() || null, sort,
    }, page);
    return ok(reply, pageOf(rows, 'organizations', page));
  };

  create = async (request, reply) => {
    const input = normalizeInput(request.body);
    const errors = organizationInputErrors(input.kind, input);
    if (errors.length) return invalid(reply, errors);
    const { id } = await organizationRepository.create(userOf(request), input);
    return ok(reply, await this.fullDetail(id, userOf(request)), 201);
  };

  getOne = async (request, reply) => ok(reply, await this.fullDetail(request.params.organizationId, viewerOf(request)));

  update = async (request, reply) => {
    const input = normalizeInput(request.body);
    const kind = await organizationRepository.kindOf(idOf(request));
    const errors = organizationInputErrors(kind, input);
    if (errors.length) return invalid(reply, errors);
    await organizationRepository.update(idOf(request), userOf(request), input);
    return ok(reply, await this.fullDetail(idOf(request), userOf(request)));
  };

  remove = async (request, reply) => {
    await organizationRepository.remove(idOf(request), userOf(request));
    return ok(reply, { message: 'Page deleted' });
  };

  mine = async (request, reply) => ok(reply, {
    organizations: await organizationRepository.mine(userOf(request)),
    invitations: await organizationRepository.invitations(userOf(request)),
    relationRequests: await organizationContentRepository.pendingRelationRequests(userOf(request)),
  });

  invitations = async (request, reply) => ok(reply, { invitations: await organizationRepository.invitations(userOf(request)) });

  members = async (request, reply) => ok(reply, { members: await organizationRepository.members(idOf(request), userOf(request)) });

  invite = async (request, reply) => {
    const input = normalizeInput(request.body);
    if (input.userId === userOf(request)) throw requestError(400, 'VALIDATION_ERROR', 'You are already part of this page');
    return ok(reply, await organizationRepository.invite(idOf(request), userOf(request), input), 201);
  };

  respondToInvitation = async (request, reply) => ok(reply,
    await organizationRepository.respondToInvitation(idOf(request), userOf(request), request.body.response === 'accept'));

  updateMember = async (request, reply) => {
    const input = normalizeInput(request.body);
    for (const key of ['joinedOn', 'leftOn']) {
      if (input[key] !== undefined && input[key] !== null && !isCalendarDate(input[key])) return invalid(reply, [`${key} must be a calendar date`]);
    }
    await organizationRepository.updateMember(idOf(request), userOf(request), request.params.userId.toLowerCase(), input);
    return ok(reply, { members: await organizationRepository.members(idOf(request), userOf(request)) });
  };

  removeMember = async (request, reply) => ok(reply,
    await organizationRepository.removeMember(idOf(request), userOf(request), request.params.userId.toLowerCase()));

  transferLeadership = async (request, reply) => ok(reply,
    await organizationRepository.transferLeadership(idOf(request), userOf(request), request.body.userId.toLowerCase()));

  addPhoto = async (request, reply) => {
    const input = normalizeInput(request.body);
    if (!isManagedMediaUrl(input.url)) return invalid(reply, ['Upload the photo as an organization image']);
    return ok(reply, await organizationRepository.addPhoto(idOf(request), userOf(request), input), 201);
  };

  removePhoto = async (request, reply) => {
    await organizationRepository.removePhoto(idOf(request), userOf(request), request.params.photoId.toLowerCase());
    return ok(reply, { message: 'Photo removed' });
  };

  follow = async (request, reply) => ok(reply,
    await organizationRepository.follow(idOf(request), userOf(request), request.method === 'POST'));

  posts = async (request, reply) => {
    const page = pagination(request);
    return ok(reply, pageOf(await organizationContentRepository.posts(request.params.organizationId, page), 'posts', page));
  };

  followingUpdates = async (request, reply) => {
    const page = pagination(request);
    return ok(reply, pageOf(await organizationContentRepository.followingUpdates(userOf(request), page), 'posts', page));
  };

  createPost = async (request, reply) => {
    const input = normalizeInput(request.body);
    if (!input.title && !input.body) return invalid(reply, ['Add a title or some text']);
    if (input.url && !isWebUrl(input.url)) return invalid(reply, ['Link must be an http(s) URL']);
    return ok(reply, await organizationContentRepository.createPost(idOf(request), userOf(request), input), 201);
  };

  removePost = async (request, reply) => {
    await organizationContentRepository.removePost(idOf(request), userOf(request), request.params.postId.toLowerCase());
    return ok(reply, { message: 'Update removed' });
  };

  releaseErrors(input) {
    const errors = [];
    if (input.title !== undefined && !input.title) errors.push('Title is required');
    if (input.releaseDate !== undefined && input.releaseDate !== null && !isCalendarDate(input.releaseDate)) errors.push('Release date must be a calendar date');
    const linkError = validateLinks(input.links, LINK_TYPES, LIMITS.releaseLinks);
    if (linkError) errors.push(linkError);
    return errors;
  }

  createRelease = async (request, reply) => {
    const input = normalizeInput(request.body);
    const errors = this.releaseErrors(input);
    if (errors.length) return invalid(reply, errors);
    return ok(reply, await organizationContentRepository.createRelease(idOf(request), userOf(request), input), 201);
  };

  updateRelease = async (request, reply) => {
    const input = normalizeInput(request.body);
    const errors = this.releaseErrors(input);
    if (errors.length) return invalid(reply, errors);
    return ok(reply, await organizationContentRepository.updateRelease(idOf(request), userOf(request), request.params.releaseId.toLowerCase(), input));
  };

  removeRelease = async (request, reply) => {
    await organizationContentRepository.removeRelease(idOf(request), userOf(request), request.params.releaseId.toLowerCase());
    return ok(reply, { message: 'Release removed' });
  };

  relations = async (request, reply) => ok(reply, {
    relations: await organizationContentRepository.managedRelations(idOf(request), userOf(request)),
  });

  requestRelation = async (request, reply) => ok(reply,
    await organizationContentRepository.requestRelation(idOf(request), userOf(request), request.body.bandId.toLowerCase()), 201);

  respondToRelation = async (request, reply) => ok(reply, await organizationContentRepository.respondToRelation(
    idOf(request), userOf(request), request.params.relationId.toLowerCase(), request.body.response === 'accept'));

  endRelation = async (request, reply) => ok(reply,
    await organizationContentRepository.endRelation(idOf(request), userOf(request), request.params.relationId.toLowerCase()));

  setSimilar = async (request, reply) => ok(reply, {
    similar: await organizationContentRepository.setSimilar(idOf(request), userOf(request), normalizeInput(request.body).bandIds),
  });

  suggestions = async (request, reply) => ok(reply, {
    suggestions: await organizationContentRepository.suggestions(idOf(request)),
  });

  announcements = async (request, reply) => {
    const page = pagination(request);
    return ok(reply, pageOf(await organizationRepository.announcements(idOf(request), page), 'announcements', page));
  };

  requestClaim = async (request, reply) => ok(reply,
    await organizationRepository.requestClaim(idOf(request), userOf(request), normalizeInput(request.body).message), 201);

  claims = async (request, reply) => {
    const page = pagination(request);
    const rows = await administrationRepository.withAdmin(userOf(request),
      executor => organizationRepository.claims(executor, request.query.status || null, page));
    return ok(reply, pageOf(rows, 'claims', page));
  };

  decideClaim = async (request, reply) => {
    const input = normalizeInput(request.body);
    return ok(reply, await administrationRepository.withAdmin(userOf(request), async executor => {
      const result = await organizationRepository.decideClaim(executor, userOf(request), request.params.claimId.toLowerCase(), input);
      await administrationRepository.audit(executor, userOf(request),
        result.status === 'approved' ? 'organization_claim_approved' : 'organization_claim_rejected', result.organizationId);
      return result;
    }));
  };

  setVerified = async (request, reply) => ok(reply, await administrationRepository.withAdmin(userOf(request), async executor => {
    const result = await organizationRepository.setVerified(executor, userOf(request), idOf(request), request.body.verified);
    await administrationRepository.audit(executor, userOf(request), result.verified ? 'organization_verified' : 'organization_unverified', result.id);
    return result;
  }));

  userFollows = async (request, reply) => ok(reply, await organizationRepository.follows(request.params.userId.toLowerCase(), viewerOf(request)));

  userOrganizations = async (request, reply) => ok(reply, {
    organizations: await organizationRepository.userOrganizations(request.params.userId.toLowerCase()),
  });

  followVisibility = async (request, reply) => ok(reply, await organizationRepository.followVisibility(userOf(request)));

  setFollowVisibility = async (request, reply) => ok(reply, await organizationRepository.setFollowVisibility(userOf(request), request.body.visible));
}

export const organizationConductor = new OrganizationConductor();
