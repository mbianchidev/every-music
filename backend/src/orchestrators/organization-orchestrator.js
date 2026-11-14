import { organizationConductor as conductor } from '../conductors/organization-conductor.js';
import { adminGuard, identityGuard, optionalIdentityGuard } from '../guards/identity-guard.js';
import { uuid, text, object, params, paging } from '../validators/http-schemas.js';
import {
  LINK_TYPES, LIMITS, MEMBER_PERMISSIONS, ORGANIZATION_KINDS, PHOTO_CATEGORIES, RELEASE_TYPES, VENUE_TYPES,
} from '../engines/organization-model.js';

const nullableText = maxLength => ({ type: ['string', 'null'], maxLength });
const year = { type: ['integer', 'null'], minimum: 1800, maximum: 2200 };
const date = { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const flag = { type: 'boolean' };
const links = maximum => ({
  type: 'array', maxItems: maximum, items: object({ linkType: { enum: LINK_TYPES }, url: text(2048) }, ['linkType', 'url']),
});
const profileFields = {
  name: text(255),
  slug: nullableText(80),
  bio: nullableText(5000),
  pictureUrl: nullableText(2048),
  city: nullableText(255),
  region: nullableText(255),
  country: nullableText(255),
  latitude: { type: ['number', 'null'], minimum: -90, maximum: 90 },
  longitude: { type: ['number', 'null'], minimum: -180, maximum: 180 },
  contactEmail: nullableText(320),
  contactPhone: nullableText(50),
  workWithUs: nullableText(5000),
  venueType: { enum: [...VENUE_TYPES, null] },
  capacity: { type: ['integer', 'null'], minimum: 1, maximum: 1000000 },
  activeSince: year,
  activeUntil: year,
  parkingInfo: nullableText(2000),
  directions: nullableText(2000),
  formedYear: year,
  youtubeChannelId: { type: ['string', 'null'], pattern: '^UC[A-Za-z0-9_-]{22}$' },
  openTo: object({ tours: flag, live: flag, supportActs: flag, endorsements: flag }),
  genreIds: { type: 'array', maxItems: LIMITS.genres, items: uuid },
  links: links(LIMITS.links),
};
const permissions = { type: 'array', uniqueItems: true, maxItems: MEMBER_PERMISSIONS.length, items: { enum: MEMBER_PERMISSIONS } };
const reference = object({ organizationId: { type: 'string', minLength: 3, maxLength: 80, pattern: '^[A-Za-z0-9-]+$' } }, ['organizationId']);
const respond = object({ response: { enum: ['accept', 'decline'] } }, ['response']);
const release = { title: text(255), releaseType: { enum: RELEASE_TYPES }, releaseDate: date, links: links(LIMITS.releaseLinks) };
const limit = (max, timeWindow) => ({ rateLimit: { max, timeWindow } });

export async function organizationOrchestrator(fastify) {
  const route = (method, url, handler, { schema = {}, guard = identityGuard, config } = {}) => fastify.route({
    method, url, preHandler: guard, schema, handler, ...(config ? { config } : {}),
  });
  const id = params('organizationId');

  route('GET', '/organizations', conductor.search, {
    guard: optionalIdentityGuard,
    schema: { querystring: object({
      ...paging, kind: { enum: ['', ...ORGANIZATION_KINDS] }, q: { type: 'string', maxLength: 200 },
      genreId: { anyOf: [uuid, { const: '' }] }, location: { type: 'string', maxLength: 255 },
      sort: { enum: ['newest', 'name', 'followers'] },
    }) },
  });
  route('POST', '/organizations', conductor.create, {
    config: limit(20, '1 hour'),
    schema: { body: object({ kind: { enum: ORGANIZATION_KINDS }, managed: flag, title: nullableText(100), ...profileFields }, ['kind', 'name']) },
  });
  route('GET', '/organizations/mine', conductor.mine);
  route('GET', '/organizations/invitations', conductor.invitations);
  route('GET', '/organizations/updates', conductor.followingUpdates, { schema: { querystring: object(paging) } });
  route('GET', '/organizations/:organizationId', conductor.getOne, { guard: optionalIdentityGuard, schema: { params: reference } });
  route('PATCH', '/organizations/:organizationId', conductor.update, {
    config: limit(120, '1 hour'), schema: { params: id, body: { ...object(profileFields), minProperties: 1 } },
  });
  route('DELETE', '/organizations/:organizationId', conductor.remove, { schema: { params: id } });
  route(['POST', 'DELETE'], '/organizations/:organizationId/follow', conductor.follow, { schema: { params: id } });

  route('GET', '/organizations/:organizationId/members', conductor.members, { schema: { params: id } });
  route('POST', '/organizations/:organizationId/members', conductor.invite, {
    config: limit(60, '1 hour'),
    schema: { params: id, body: object({ userId: uuid, role: { enum: ['member', 'admin'] }, title: nullableText(100), permissions }, ['userId']) },
  });
  route('PATCH', '/organizations/:organizationId/members/:userId', conductor.updateMember, {
    schema: {
      params: params('organizationId', 'userId'),
      body: { ...object({ title: nullableText(100), role: { enum: ['member', 'admin'] }, permissions, joinedOn: date, leftOn: date }), minProperties: 1 },
    },
  });
  route('DELETE', '/organizations/:organizationId/members/:userId', conductor.removeMember, { schema: { params: params('organizationId', 'userId') } });
  route('PATCH', '/organizations/:organizationId/invitation', conductor.respondToInvitation, { schema: { params: id, body: respond } });
  route('POST', '/organizations/:organizationId/leadership', conductor.transferLeadership, {
    schema: { params: id, body: object({ userId: uuid }, ['userId']) },
  });

  route('POST', '/organizations/:organizationId/photos', conductor.addPhoto, {
    config: limit(60, '1 hour'),
    schema: { params: id, body: object({ url: text(2048), category: { enum: PHOTO_CATEGORIES }, caption: nullableText(200) }, ['url', 'category']) },
  });
  route('DELETE', '/organizations/:organizationId/photos/:photoId', conductor.removePhoto, { schema: { params: params('organizationId', 'photoId') } });

  route('GET', '/organizations/:organizationId/posts', conductor.posts, {
    guard: optionalIdentityGuard, schema: { params: reference, querystring: object(paging) },
  });
  route('POST', '/organizations/:organizationId/posts', conductor.createPost, {
    config: limit(30, '1 hour'),
    schema: { params: id, body: object({ title: nullableText(255), body: nullableText(4000), url: nullableText(2048) }) },
  });
  route('DELETE', '/organizations/:organizationId/posts/:postId', conductor.removePost, { schema: { params: params('organizationId', 'postId') } });

  route('POST', '/organizations/:organizationId/releases', conductor.createRelease, {
    config: limit(30, '1 hour'), schema: { params: id, body: object(release, ['title', 'releaseType']) },
  });
  route('PATCH', '/organizations/:organizationId/releases/:releaseId', conductor.updateRelease, {
    schema: { params: params('organizationId', 'releaseId'), body: { ...object(release), minProperties: 1 } },
  });
  route('DELETE', '/organizations/:organizationId/releases/:releaseId', conductor.removeRelease, { schema: { params: params('organizationId', 'releaseId') } });

  route('GET', '/organizations/:organizationId/relations', conductor.relations, { schema: { params: id } });
  route('POST', '/organizations/:organizationId/relations', conductor.requestRelation, {
    config: limit(30, '1 hour'), schema: { params: id, body: object({ bandId: uuid }, ['bandId']) },
  });
  route('PATCH', '/organizations/:organizationId/relations/:relationId', conductor.respondToRelation, {
    schema: { params: params('organizationId', 'relationId'), body: respond },
  });
  route('DELETE', '/organizations/:organizationId/relations/:relationId', conductor.endRelation, { schema: { params: params('organizationId', 'relationId') } });

  route('PUT', '/organizations/:organizationId/similar', conductor.setSimilar, {
    schema: { params: id, body: object({ bandIds: { type: 'array', maxItems: LIMITS.similar, items: uuid } }, ['bandIds']) },
  });
  route('GET', '/organizations/:organizationId/suggestions', conductor.suggestions, { guard: optionalIdentityGuard, schema: { params: id } });
  route('GET', '/organizations/:organizationId/announcements', conductor.announcements, {
    guard: optionalIdentityGuard, schema: { params: id, querystring: object(paging) },
  });
  route('POST', '/organizations/:organizationId/claims', conductor.requestClaim, {
    config: limit(10, '1 day'), schema: { params: id, body: object({ message: text(2000, 10) }, ['message']) },
  });

  route('GET', '/admin/organization-claims', conductor.claims, {
    guard: adminGuard, schema: { querystring: object({ ...paging, status: { enum: ['', 'pending', 'approved', 'rejected'] } }) },
  });
  route('PATCH', '/admin/organization-claims/:claimId', conductor.decideClaim, {
    guard: adminGuard,
    schema: { params: params('claimId'), body: object({ decision: { enum: ['approve', 'reject'] }, note: nullableText(2000) }, ['decision']) },
  });
  route('PUT', '/admin/organizations/:organizationId/verification', conductor.setVerified, {
    guard: adminGuard, schema: { params: id, body: object({ verified: flag }, ['verified']) },
  });

  route('GET', '/users/:userId/follows', conductor.userFollows, { guard: optionalIdentityGuard, schema: { params: params('userId') } });
  route('GET', '/users/:userId/organizations', conductor.userOrganizations, { guard: optionalIdentityGuard, schema: { params: params('userId') } });
  route('GET', '/follows/visibility', conductor.followVisibility);
  route('PUT', '/follows/visibility', conductor.setFollowVisibility, { schema: { body: object({ visible: flag }, ['visible']) } });
}
