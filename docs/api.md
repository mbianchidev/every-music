# API reference

[Documentation index](README.md) | [Configuration](configuration.md) | [Architecture](architecture.md)

Local base URL: `http://localhost:8080`.

Authenticated requests use:

```http
Authorization: Bearer <access-token>
```

Success:

```json
{
  "success": true,
  "data": {}
}
```

Failure:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": []
  }
}
```

## Health

| Method | Path | Description |
|---|---|---|
| GET | `/health/live` | Process liveness |
| GET | `/health/ready` | PostgreSQL readiness, plus object storage when `MEDIA_STORAGE=s3` |
| GET | `/pulse` | Readiness compatibility alias |
| GET | `/nexus-info` | Version and environment |

Readiness returns `{ "status": "ready", "dependencies": { "database": "connected" } }`.
With `MEDIA_STORAGE=s3` it adds `"storage": "connected"`; an unreachable bucket
returns 503 with `"status": "not_ready"` and `"storage": "unavailable"`.

## Authentication

| Method | Path | Description |
|---|---|---|
| POST | `/realm/auth/register` | Create an email account |
| POST | `/realm/auth/login` | Create a session |
| POST | `/realm/auth/login/google` | Create a Google session |
| GET | `/realm/auth/google/config` | Discover the optional public Google client ID |
| POST | `/realm/auth/google/challenge` | Create a five-minute, single-use Google nonce (201) |
| GET | `/realm/auth/verify-email?token=...` | Verify an email address |
| POST | `/realm/auth/resend-verification` | Request a new verification email |
| POST | `/realm/auth/refresh-token` | Refresh the access token |
| POST | `/realm/auth/password-reset/initiate` | Request a reset link |
| POST | `/realm/auth/password-reset/complete` | Set a new password |
| POST | `/realm/auth/logout` | Revoke a refresh session |

Registration requires a password with at least eight characters, uppercase, lowercase, and a number. Email accounts must be verified before login.
The body must also include `acceptedTermsVersion` equal to the current
`termsVersion` from `GET /realm/legal`. Omitting it returns 400
`TERMS_NOT_ACCEPTED`; a different version returns 409 `TERMS_VERSION_CHANGED`.
The accepted version and time are stored with the new account.
An optional `inviteCode` records a referral for the new account (see
[referrals](#monetization-billing-points-and-sponsored-content)); unknown codes
never block registration, and the response's `inviteRecorded` says whether it
was recorded.

Refresh:

```json
{
  "refreshToken": "<refresh-token>"
}
```

Logout accepts the same body. Password reset revokes all active refresh sessions.
When the account has two-step verification on, login and Google login return a
challenge instead of tokens; see [two-step sign-in](#two-step-sign-in).

For Google sign-in, request a challenge with `{}` and pass its `nonce` to
Google Identity Services. POST `{ "idToken": "<Google credential>",
"challengeId": "<challenge id>" }` to `/realm/auth/login/google`. The server
verifies issuer/audience/expiry/email and consumes the matching signed nonce.
Success returns the normal `accessToken`, `refreshToken`, and `user`, plus
`isNewUser`. Reuse/expiry returns 401 `INVALID_GOOGLE_CHALLENGE`; an existing
email/password account returns 409 `EMAIL_EXISTS`. No automatic email linking
occurs. Google-not-configured returns 503.

Google accounts can add password sign-in through verified password recovery;
both credentials then address the same account. Resetting the password revokes
refresh sessions without removing the Google identity.

## Profiles

| Method | Path | Authentication |
|---|---|---|
| GET | `/realm/profiles/me` | Required |
| PUT | `/realm/profiles/me` | Required |
| GET | `/realm/profiles/search` | Public |
| GET | `/realm/profiles/:profileId` | Public |
| POST | `/realm/profiles/me/projects` | Required |
| PUT | `/realm/profiles/me/projects/:projectId` | Required, project owner |
| DELETE | `/realm/profiles/me/projects/:projectId` | Required |
| POST / DELETE | `/realm/profiles/:profileId/follow` | Required |
| POST / DELETE | `/realm/profiles/:profileId/block` | Required |

Profile detail accepts either a profile ID or the legacy user-ID identifier.
It returns identity/location/bio/image/contacts, instruments, genres, projects,
and `isFollowing` for an authenticated viewer. Inactive/deleted users are not
searchable. Project objects retain the existing SQL-style field names.
Detail also returns `age`, `place` (`{ id, name, region, regionCode, country,
countryCode, latitude, longitude, label }` or `null` for a legacy free-text
city), `openToProjects`, `followersCount`, `followingCount`, `isBlocked` (the
viewer blocked this musician) and content `links` (`{ id, linkType, url }`).
`contacts` is `null` unless the viewer may see it: never for anonymous viewers
or between blocked accounts, otherwise per the owner's `contactVisibility`
(`members`: any signed-in member, `following`: musicians the owner follows,
`hidden`: nobody). Other viewers see at most `maxProjectsShown` projects and
`maxContentShown` links from the **owner's** plan. The owner always receives
everything plus `contactVisibility`, `openToProjectsManual`,
`hasActiveAnnouncement` and `publicDisplay` (`maxProjectsShown`,
`maxContentShown`, `hiddenProjects`, `hiddenLinks`). A musician who blocked
the viewer returns 404. A signed-in visit by someone else is recorded only
when that visitor opted in to [profile visits](#discovery-saved-searches-blocks-and-visits).

Search accepts `searchTerm` (up to 200 characters), `city` (up to 255),
`instrumentId`, `genreId`, `createdWithin` (`week` or `month`), and `sort`
(`newest`, `oldest`, `name`, `city`). `createdWithin` filters `created_at`
over the rolling past 7 or 30 days; omitted/empty means any time. Other values
return 400. Search summaries include selected `instruments` and `genres`
using the same identifiers/names as profile detail.

Location filters, shared by profile and announcement search:

- `placeId`: a GeoNames place from the [catalog](#catalog), or
  `latitude` + `longitude` (decimal degrees) for a "near me" search. Raw
  coordinates are used for that request only and are never stored.
- `radiusKm` (1-1000): only results within that distance of the center. It
  requires a center. Results without coordinates are excluded.
- `country` (ISO 3166 alpha-2) and `region` (GeoNames admin1 code, requires
  `country`): match the result's linked place. Legacy free-text cities have no
  place and do not match these filters.
- `sort=distance`: nearest first; requires a center. Summaries then include
  `distanceKm` (rounded to 0.1 km), otherwise `null`.

Distance uses an indexed latitude/longitude bounding box followed by an exact
haversine check, so no PostGIS extension is needed. Profile search also
accepts `openToProjects=true|false`. Summaries include `place` and
`openToProjects`. Signed-in viewers never see musicians or announcements from
accounts that either blocked them or that they blocked.
Profile editing takes camel-case fields plus:

```json
{
  "instruments": [
    {
      "instrumentId": "11111111-1111-4111-8111-111111111111",
      "skillLevel": "advanced",
      "yearsExperience": 4
    }
  ],
  "genreIds": ["22222222-2222-4222-8222-222222222222"]
}
```

Use actual catalog IDs, not these illustrative IDs. Skill levels are
`beginner`, `intermediate`, `advanced`, `professional`; years are 0-120.

Profile editing also accepts `age` (13-120 or `null`), `placeId` (a catalog
place, or `null` to clear it and keep the free-text `city` sent alongside),
`openToProjects` (boolean), `contactVisibility` (`members`, `following`,
`hidden`), `phone`, `whatsapp` (phone numbers), `telegramId` (`@name`, 5-32
characters), `signal` (phone number or username), `websiteUrl`, and `links`:
up to 20 `{ "linkType": "spotify" | "youtube" | "soundcloud" | "bandcamp" |
"instagram" | "website" | "other", "url": "<http(s) URL>" }` in display order.
A place sets `city`, `state`, `country`, `latitude` and `longitude` from the
GeoNames record; sending `city`, `state`, `country` or coordinates without
`placeId` detaches the place. Empty contact strings clear the contact. `openToProjects` on
detail and search is true when the manual flag is set **or** the musician has
an active (published, unexpired) announcement.
Omitted relation fields preserve values; `[]` clears them.
Instrument/genre arrays are capped at 100 entries to bound transactional work;
announcement links are capped at 20.

Project create/update accepts `name` (required on create, 1-255 characters),
`role` (up to 255), `yearsActive` (100), `description` (5000),
`spotifyLink`, `youtubeLink`, `bandcampLink`, `soundcloudLink`, `websiteLink`
(HTTP/S URLs up to 2048), and `collaborators`. Collaborators are at most 20
distinct `{ "userId": "<existing active user>", "role": "<1-100 characters>" }`
objects. Omit collaborators to leave them unchanged; send `[]` to clear.
Create returns 201; update/delete return 200. Foreign projects return 404.

Profiles also return `accountKind` (`artist` or `music_lover`), which
`PUT /realm/profiles/me` accepts. `telegramId` is limited to 100 characters.

## Announcements

| Method | Path | Authentication |
|---|---|---|
| POST | `/realm/announcements/` | Required |
| GET | `/realm/announcements/search` | Optional |
| GET | `/realm/announcements/me` | Required |
| GET | `/realm/announcements/saved` | Required |
| GET | `/realm/announcements/:announcementId` | Optional |
| PUT | `/realm/announcements/:announcementId` | Required |
| DELETE | `/realm/announcements/:announcementId` | Required |
| POST | `/realm/announcements/:announcementId/react` | Required |
| POST | `/realm/announcements/:announcementId/save` | Required |
| DELETE | `/realm/announcements/:announcementId/save` | Required |

Announcement titles are 5–255 characters and descriptions are 20–5000 characters.
Only owners can retrieve drafts or expired calls. Other viewers see 404;
save/reaction/comment routes apply the same visibility rule. Creator email is
not exposed; detail uses `creatorName`, `userId`, and a musician contact route.
Authenticated details expose `isSaved` and `myReaction`; search exposes
`isSaved`. Search, own, and saved summaries also include `creatorName`,
`creatorPictureUrl`, `instruments`, and `genres`; these are actual profile/catalog
data, not inferred tags. Detail retrieval itself does not record analytics.

Announcement search accepts profile search's keyword/location/catalog filters,
`isRemote` / `isCoverBand` (`true` or `false`), and `sort`
(`newest`, `oldest`, `title`, `city`, `popular`, `expiring`, `distance`). The shared `createdWithin`
filter uses the announcement's creation date. `popular` ranks by likes minus
dislikes, then likes;
`expiring` puts the soonest expiration first.
Optional `pictureUrl` uses a managed media URL or a legacy HTTP/S URL.
`isPublished: false` saves a private draft. Create and update also accept
`placeId` (as for profiles) and `expiresAt` (`YYYY-MM-DD`, meaning the end of
that UTC day, or an ISO 8601 timestamp). With a limited
`announcementExpiryDays`, a create without `expiresAt` defaults to the end of
that many days from now, publishing a draft without one gets the same
default, `null` returns 403 `EXPIRY_REQUIRED`, and a later date returns 403
`EXPIRY_BEYOND_PLAN` (one extra day is allowed for time zones). Unlimited plans
may omit or clear it. Past dates return 400 `EXPIRY_IN_PAST`.

Publishing (create, draft to published, or a new future expiry on an expired
call) is refused with 403 `PLAN_LIMIT_REACHED` when the owner already has
`maxActiveAnnouncements` published, unexpired calls. Saving a call beyond
`maxSavedAnnouncements` visible saved calls returns the same code; saving an
already saved call is idempotent. Messages name the limit so clients can show
them directly.

Like and dislike counts are private to the owner. Every response for other
viewers, including search, saved and detail, has `stats: null`; they only see
their own `myReaction`. The owner receives `stats.likes` and `stats.dislikes`
and, when their plan has `announcementStats`, `stats.views` and `stats.saves`;
detail adds `statsLocked`. The `popular` sort still uses reactions. Detail and
summaries include `place`, `expiresAt` and (for distance searches)
`distanceKm`. A call whose owner blocked the viewer returns 404 for detail,
save, reaction and comment routes.

Search pages for announcements and profiles start with up to
`PROMOTED_RESULTS_PER_PAGE` paid placements, each marked with
`promotion: { "kind": "pinned" | "boosted" }`, and include a `sponsored` array
of `{ position, card }` objects; show each card before the result at
`position`. See [monetization](#monetization-billing-points-and-sponsored-content).

For relation fields on update:

- omitted field: preserve current values
- empty array: clear all values
- populated array: replace the set

## Discovery, saved searches, blocks and visits

| Method | Path | Contract |
|---|---|---|
| GET | `/realm/quotas` | `{ plan, activeAnnouncements, savedAnnouncements, savedSearches, announcementExpiryDays, announcementStats, profileVisits, maxProjectsShown, maxContentShown }`; each usage is `{ used, limit, remaining }` with `null` for unlimited |
| GET | `/realm/saved-searches` | `{ searches: [{ id, name, filters, notify, createdAt }] }` |
| POST | `/realm/saved-searches` | `{ "name": "1-100 characters", "filters": {...}, "notify": true }`, 201; 30 per hour |
| PATCH | `/realm/saved-searches/:searchId` | Any of `name`, `filters`, `notify` |
| DELETE | `/realm/saved-searches/:searchId` | Own searches only; 404 otherwise |
| POST / DELETE | `/realm/profiles/:profileId/block` | Block or unblock by user or profile ID; idempotent; 60 per hour |
| GET | `/realm/blocks` | Paginated `{ blocked: [{ userId, artistName, profilePictureUrl }] }` |
| GET / PUT | `/realm/profile-visits/sharing` | `{ "share": boolean }`, the caller's consent to being shown as a visitor |
| GET | `/realm/profile-visits` | Paginated `{ visits: [{ userId, artistName, profilePictureUrl, lastVisitedAt, days }] }`; requires `profileVisits` |

All require authentication. Saved search `filters` accept the announcement
search fields as JSON values: `searchTerm`, `city`, `instrumentId`, `genreId`,
`isRemote`, `isCoverBand` (booleans), `placeId`, `latitude` + `longitude`,
`radiusKm`, `country`, `region`. At least one is required (400 `EMPTY_SEARCH`).
Coordinates are never stored: they are replaced by the nearest city, and a
place is stored with its `placeLabel`, `latitude` and `longitude`. Creating
beyond `maxSavedSearches` returns 403 `PLAN_LIMIT_REACHED`.

When an announcement becomes published (on create or a draft-to-published
update), matching saved searches with `notify: true` are evaluated in the
same database transaction. Each matching member receives one
`saved_search_match` notification per announcement (`params: { announcementId,
title }`), even after unpublishing and republishing. Authors and members with
a block in either direction are never notified. Distance filters match the
announcement's coordinates, so remote calls without a place do not match them.

Following someone creates one `new_follower` notification per follower
(`params: { followerId, name }`); unfollowing and following again does not
notify twice. Following is refused with 404 when either account blocked the
other. Blocking removes follows in both directions and recorded visits between
the two accounts; existing conversation block rules are unchanged and
conversation blocks appear in `/realm/blocks`.

Visits are recorded by profile detail for signed-in visitors who set
`share: true`, once per owner, visitor and UTC day, never for self-views or
between blocked accounts. Withdrawing consent deletes the visitor's records.
Owners without `profileVisits` receive 403 `PLAN_LIMIT_REACHED`. Hourly
maintenance deletes visits older than 30 days.

Create and update accept an optional `organizationId` to publish on behalf of
a managed page where the author has `post_announcements` (403 otherwise);
`null` on update detaches it, omission leaves it unchanged. Details and
summaries return `organization` (`{ id, name, kind, verified }`) or `null`.
The author keeps ownership; page followers are notified when it is published.

## Organizations

Bands, venues, organizers, booking agencies, and labels. See the
[organization model](organizations.md) for roles, permissions, and limits.
`:organizationId` is the page UUID; `GET /realm/organizations/:organizationId`
and its `/posts` also accept the page slug. Reads are public (optional
authentication adds viewer fields); writes require authentication.

| Method | Path | Contract |
|---|---|---|
| GET | `/realm/organizations` | Search: `kind`, `q` (name/bio, 200), `genreId`, `location` (city/region/country, 255), `sort` (`newest`, `name`, `followers`), paging; returns `organizations` |
| POST | `/realm/organizations` | Create (see fields below), 201; rate-limited to 20/hour |
| GET | `/realm/organizations/mine` | `organizations` (with `role`, `permissions`), pending `invitations`, `relationRequests` for bands you manage |
| GET | `/realm/organizations/invitations` | Your pending invitations |
| GET | `/realm/organizations/updates` | Paginated `posts` from pages you follow |
| GET | `/realm/organizations/:organizationId` | Detail with members, history, links, photos, releases, relations, similar bands, and `viewer` |
| PATCH | `/realm/organizations/:organizationId` | Partial update, `manage_profile` |
| DELETE | `/realm/organizations/:organizationId` | Soft delete, leader (or community venue creator) |
| POST / DELETE | `/realm/organizations/:organizationId/follow` | Follow or unfollow |
| GET | `/realm/organizations/:organizationId/members` | For active members: every member period and invitation, with permissions |
| POST | `/realm/organizations/:organizationId/members` | Invite `{ userId, role?, title?, permissions? }`, `manage_members`, 201 |
| PATCH | `/realm/organizations/:organizationId/members/:userId` | `{ memberId?, title?, role?, permissions?, joinedOn?, leftOn? }`; `memberId` selects a former period, otherwise the current one changes |
| DELETE | `/realm/organizations/:organizationId/members/:userId` | Remove, cancel an invitation, or leave (your own user ID) |
| PATCH | `/realm/organizations/:organizationId/invitation` | Invitee `{ "response": "accept" \| "decline" }` |
| POST | `/realm/organizations/:organizationId/leadership` | Leader transfers to `{ userId }` of an active member |
| POST / DELETE | `/realm/organizations/:organizationId/photos[/:photoId]` | `{ url, category: inside \| outside \| gallery, caption? }`, `manage_profile` |
| GET / POST / DELETE | `/realm/organizations/:organizationId/posts[/:postId]` | Paginated updates; posting `{ title?, body?, url? }` and removing manual updates need `post_announcements` (release and imported video posts are not removable) |
| POST / PATCH / DELETE | `/realm/organizations/:organizationId/releases[/:releaseId]` | Bands: `{ title, releaseType: single \| ep \| lp \| album, releaseDate?, links? }`, `manage_profile` |
| GET / POST | `/realm/organizations/:organizationId/relations` | Managers list pending and accepted relations; agencies/labels request `{ bandId }` |
| PATCH / DELETE | `/realm/organizations/:organizationId/relations/:relationId` | Band answers `{ response }`; either side ends it |
| PUT | `/realm/organizations/:organizationId/similar` | Bands: `{ bandIds }` (up to 10) replaces manual picks |
| GET | `/realm/organizations/:organizationId/suggestions` | Up to six suggested bands with `score` and `reasons` |
| GET | `/realm/organizations/:organizationId/announcements` | Open announcements published for the page |
| POST | `/realm/organizations/:organizationId/claims` | Claim a community venue `{ message }` (10-2,000 characters), 201 |
| GET | `/realm/users/:userId/organizations` | Pages a user is an active member of |
| GET | `/realm/users/:userId/follows` | `{ visible, artists, organizations }`; hidden lists return `visible: false` and empty arrays to others |
| GET / PUT | `/realm/follows/visibility` | Your `{ visible }` follow-list setting |
| GET | `/realm/admin/organization-claims` | Admin queue, `status` `pending` \| `approved` \| `rejected` or empty |
| PATCH | `/realm/admin/organization-claims/:claimId` | Admin `{ decision: approve \| reject, note? }`, audited |
| PUT | `/realm/admin/organizations/:organizationId/verification` | Admin `{ verified }`, audited |

Create and update accept `name` (1-255), `slug` (3-80 lowercase letters,
digits, hyphens; unique, 409 `SLUG_TAKEN`), `bio` and `workWithUs` (5,000),
`pictureUrl` (an `organization` image you uploaded), `city`, `region`,
`country`, `latitude`/`longitude` (together), `contactEmail`, `contactPhone`,
`activeSince`/`activeUntil` years, `genreIds` (up to 10), and `links` (up to 12
`{ linkType, url }` with `spotify`, `youtube`, `soundcloud`, `bandcamp`,
`instagram`, `website`, or `other`). Venues add `venueType`, `capacity`,
`parkingInfo`, and `directions`; bands add `formedYear`, `youtubeChannelId`
(`UC` plus 22 characters), and `openTo` (`tours`, `live`, `supportActs`,
`endorsements` booleans, merged on update). Fields for another kind return 400.
Create also accepts `kind`, `title` (your member title), and for venues
`managed: false` to add a community-maintained page.

Business kinds return 403 `PLAN_LIMIT_REACHED` without the `businessPages`
limit. Missing permissions return 403 `ORGANIZATION_PERMISSION_REQUIRED` or
`LEADER_REQUIRED`; missing pages 404 `ORGANIZATION_NOT_FOUND`. Duplicate
invitations, relations, and pending claims return 409. Invitations,
membership changes, relation requests/answers, claim outcomes, and updates
create notifications with kinds `organization_invitation`,
`organization_membership`, `organization_relation`, `organization_claim`, and
`organization_update` (params include `organizationId` and `organizationName`).
Detail `viewer` contains `role` (`leader`, `admin`, `member`, `maintainer`, or
`null`), effective `permissions`, `invited`, and your latest `claim`.

## Pagination

Profile/announcement/organization search, own/saved announcements, organization
posts and updates, conversations, messages, comments, and notifications accept positive integer `page` and `pageSize`.
Defaults are 1 and 20; `pageSize` cannot exceed 100. Fractional, malformed, and
unsafe offsets return 400. Each response returns its named list plus:

```json
{
  "success": true,
  "data": {
    "announcements": [],
    "pagination": { "page": 1, "pageSize": 20, "hasMore": false }
  }
}
```

Lists use deterministic ID tie-breakers. Pages are live, not a frozen snapshot;
new/deleted items can move between pages. There is no unbounded list or costly
total-row count. Keyword/city searches use PostgreSQL trigram indexes.

## Images

POST `/realm/media` with authentication:

```json
{
  "purpose": "announcement",
  "mimeType": "image/png",
  "data": "<canonical base64 bytes, without a data-URL prefix>"
}
```

`purpose` is `profile` or `announcement`. Real JPEG/PNG content, a 2 MiB input
limit, one frame, and at most 16 megapixels are enforced. The server strips
metadata, applies orientation, resizes within 1280x1280, and encodes WebP.
201 returns `{ "id": "<uuid>", "url": "/realm/media/<uuid>" }`.
Use that relative URL in `profilePictureUrl` or `pictureUrl`. Managed media
must belong to the editing user and match the purpose. Invalid input returns
400 `INVALID_IMAGE` / `INVALID_MEDIA`; an oversized request body can return 413.

GET `/realm/media/:mediaId` returns the stored bytes (`image/webp` for images),
not a JSON envelope, with `Content-Length`. A media item is public only while
attached to an active profile or visible announcement; public responses use
`Cache-Control: public, max-age=3600`. The uploader can fetch private/unattached
items with Bearer authentication; unauthorized or missing items return 404.
Features can also grant one signed-in viewer access (see attachments below);
owner and granted responses use `Cache-Control: private, no-store`.
Unreferenced uploads are cleaned up after a day. Bytes are stored in PostgreSQL
or, with `MEDIA_STORAGE=s3`, in a private S3-compatible bucket; either way they
are only served through this endpoint. A storage outage returns 503
`MEDIA_STORAGE_UNAVAILABLE`.

### Encrypted attachments

POST `/realm/media/blobs` with authentication, `Content-Type:
application/octet-stream`, and the client-encrypted bytes as the raw body.
The server stores the bytes as opaque data with purpose `attachment`; it does not
decrypt, inspect, or transform them. 201 returns:

```json
{ "id": "<uuid>", "url": "/realm/media/<uuid>", "byteSize": 1024, "mimeType": "application/octet-stream" }
```

Bodies larger than `ATTACHMENT_BYTE_LIMIT` (10 MiB by default) return 413,
empty or non-binary bodies return 400 `INVALID_BLOB`, and more than 100
attachments per account per day return 429 `ATTACHMENT_LIMIT_REACHED`. The
route is also rate limited per client. Authentication is checked before the
body is read.

GET the returned `url` with Bearer authentication. Attachments are never public:
only the uploader, or a viewer granted by a feature's authorized media
reference (for example, members of a conversation that references the
attachment), receives the bytes, with `Content-Disposition: attachment` and
`Cache-Control: private, no-store`. Everyone else receives 404. Unreferenced
attachments are deleted after a day like other uploads.

## Announcement applications

| Method | Path | Contract |
|---|---|---|
| POST | `/realm/announcements/:announcementId/applications` | Apply to a visible call; 201 with the applicant view |
| GET | `/realm/announcements/:announcementId/applications/me` | `{ "application": <applicant view> }`, or `null` without an active reply |
| GET | `/realm/applications/me` | Caller's replies, newest first, paginated as `applications` |
| DELETE | `/realm/applications/:applicationId` | Applicant withdraws; 200 `{ "id": "<uuid>", "status": "withdrawn" }` |
| GET | `/realm/applications/received` | Owner dashboard: paginated `applications`, `counts`, and `announcement` |
| GET | `/realm/applications/announcements` | Owner's calls with per-status counts, paginated as `announcements` |
| PATCH | `/realm/applications/:applicationId` | Owner `{ "status": "...", "ownerNote": "..." }` (either or both); 200 |

All routes require authentication. Apply with:

```json
{
  "message": "<1-4000 characters>",
  "instrumentIds": ["<instrument listed on the announcement>"],
  "links": [{ "linkType": "youtube", "url": "https://example.test/demo" }]
}
```

`instrumentIds` (at most 20) must be instruments of that announcement, or the
request returns 400 `INVALID_INSTRUMENTS`. `links` are at most 5 HTTP/S URLs
with the announcement `linkType` values. The message is stored as plaintext
and shown to the announcement owner; it is not end-to-end encrypted. Use
[conversations](#comments-and-messages) for private follow-up.

Only published, unexpired announcements of active owners accept replies
(otherwise 404). Owners get 403 `OWN_ANNOUNCEMENT`; a block in either direction
returns 403 `APPLICATION_UNAVAILABLE`. One active reply per user and call is
allowed (409 `ALREADY_APPLIED`); a withdrawn reply can be replaced. Each account
can send 20 replies per rolling day (429 `APPLICATION_LIMIT`, withdrawn replies
included), and the route allows 20 requests per client per hour.

The applicant view has `id`, `status`, `message`, `instruments`
(`instrumentId`, `name`), `links`, `createdAt`, `updatedAt`, `withdrawnAt`,
and `announcement` (`id`, `title`, `isOpen`, `ownerId`, `ownerName`). Its
`status` is `new`, `shortlisted`, `accepted`, `declined`, `withdrawn`, or
`closed` once the call stops accepting replies. Owner notes are never included.
Withdrawing clears the message, instruments, and links and hides the reply from
the owner.

`received` accepts `announcementId`, `status` (`new`, `shortlisted`,
`accepted`, `declined`), `instrumentId` (a selected instrument), `sort`
(`newest` or `oldest`), and pagination. `counts` has `total`, `new`,
`shortlisted`, `accepted`, and `declined` for the announcement/instrument
scope, ignoring the status filter. `announcement` is `null` unless filtered; a
foreign or unknown call returns 404. Owner views add `ownerNote`,
`statusChangedAt`, `canMessage` (false when either user blocked the other),
`announcement.retentionEndsAt`, and `applicant` (`userId`, `profileId`,
`artistName`, `pictureUrl`, `city`, and profile `instruments` with
`skillLevel` and `yearsExperience`). Suspended and deleted applicants are hidden.
Start an encrypted conversation with `POST /realm/conversations` and the
applicant's `userId`.

PATCH `ownerNote` takes 0-2000 characters; blank clears it. Status changes to
`shortlisted`, `accepted`, or `declined` notify the applicant once per status
(`application_status` with `applicationId`, `announcementId`, `title`, and
`status`). New replies notify the owner (`application_received` with
`applicationId`, `announcementId`, `title`, and `applicantName`). Changes emit
`applications.changed` live events to the owner and applicant.

A call is closed when it is deleted, unpublished, expired, or its owner is
inactive. Its applications stay readable to the owner for
`APPLICATION_RETENTION_DAYS` (default 90) after closure; only private notes can
change and status updates return 409 `ANNOUNCEMENT_CLOSED`. An hourly job
records closure, clears it when a call reopens, and deletes applications whose
retention ended, withdrawn replies older than the retention period, and replies
from deleted accounts. See [configuration](configuration.md#api-settings).

## Comments and messages

| Method | Path | Contract |
|---|---|---|
| GET | `/realm/announcements/:announcementId/comments` | Visible announcement, newest comments first, paginated |
| POST | `/realm/announcements/:announcementId/comments` | Authenticated `{ "body": "<1-2000 characters>" }`, 201 |
| DELETE | `/realm/announcements/:announcementId/comments/:commentId` | Comment or announcement owner, 200 |
| POST | `/realm/conversations` | `{ "recipientUserId": "<uuid>" }`, 201 `{ "id": "<conversation>" }` |
| GET | `/realm/conversations` | Own conversations, paginated; `archived=true` selects archived |
| GET | `/realm/conversations/:conversationId/messages` | Participants only; newest first, paginated |
| POST | `/realm/conversations/:conversationId/messages` | Participants only; create message, 201 |
| PATCH | `/realm/conversations/:conversationId` | Participant read/archive/block state, 200 |
| DELETE | `/realm/conversations/:conversationId/messages/:messageId` | Sender only; replace text with a tombstone, 200 |

Conversations, messages, and preferences always require authentication.
Starting the same pair returns the existing conversation. Self-messaging
returns 400. Unknown/foreign conversations return 404, without disclosing
membership. Either participant blocking the other prevents new conversations
and sends with 403 `MESSAGING_UNAVAILABLE`. Archive/read state is per member.
New messages restore archived conversations.

New sends require `{ "ciphertext": "<general JSON JWE as a string>",
"clientId": "<new uuid>", "senderKeyId": "<uuid>", "recipientKeyId": "<uuid>" }`.
The fixed JOSE profile and signed context are described in
[messaging security](messaging-security.md). Envelopes are at most 65,536
characters and must name exactly the two current participant keys. Plaintext
`body` sends return 426 `MESSAGING_UPGRADE_REQUIRED`; there is no downgrade.

Keep the exact envelope/client ID for retries. The existing message is returned
without duplicate notifications/metrics. Reusing the ID with different
content/key context returns 409 `MESSAGE_CONFLICT`. Changed or missing current
keys return 409 `MESSAGING_KEYS_CHANGED`.

Read with `format=encrypted-v1` plus pagination. An old reader encountering
encrypted content receives 426 rather than blank message text. Responses include
public `keys`, `conversation` with the current `recipientKey`,
`recipientAvailable`, and each message's `id`, `clientId`, `senderId`,
`encryptionVersion`, `ciphertext`, `senderKeyId`, `recipientKeyId`, `isDeleted`,
`removedByModeration`, and `createdAt`. Only preserved version-0 legacy messages
have a `body`. Private-key backups are never included in conversation responses.
Previews are generic Encrypted message / Legacy message / Message removed, not
decrypted snippets.

PATCH accepts any of `{ "read": true, "archived": true, "blocked": true }`;
archive/block also accept false. Reading marks corresponding message
notifications read. Removing a message does not remove its timestamp or
conversation. Suspended accounts cannot receive new messages; other participants
can still read the history they possess keys for.

## Messaging keys, reports and administration

| Method | Path | Contract |
|---|---|---|
| GET | `/realm/account` | Own database-derived `userId` and `role` |
| GET | `/realm/encryption/me` | Paginated own public records and encrypted private-key backups |
| GET | `/realm/encryption/me/:keyId` | Own selected backup only; foreign keys return 404 |
| POST | `/realm/encryption/me` | Publish an identity proof, two public P-256 JWKs and encrypted backup; 201 |
| GET | `/realm/encryption/users/:userId` | Authenticated lookup; `{ "key": null }` means no published key |
| POST | `/realm/reports` | Authenticated report with explicit disclosure consent; 201 |
| GET | `/realm/reports/me` | Paginated own report status/details |
| GET | `/realm/admin/analytics` | Admin-only operational totals and separately consented platform aggregates |
| GET | `/realm/admin/reports` | Admin-only paginated metadata queue; optional `status` |
| GET | `/realm/admin/reports/:reportId` | Admin-only disclosed details/evidence; access is audited |
| PATCH | `/realm/admin/reports/:reportId` | Admin-only decision; transaction rechecks the live role |
| GET | `/realm/admin/audit` | Admin-only paginated action metadata, not message content |

Key publication fields are `signingKey`, `encryptionKey`, `identityProof`, and
`encryptedPrivateKey`. JWKs contain only `kty`, `crv`, `x`, `y`; private `d`
material is forbidden. Identity proofs bind the authenticated account and
encryption-key thumbprint. Backups must use the documented PBES2/A256GCM profile.
The server computes the signing fingerprint. One key is current; resets must
explicitly name `replaceKeyId`. Old records remain for history. Resets are
bounded to five per account per day; key lists are paginated.

Reports accept `reportedUserId`, `category` (`spam`, `harassment`, `threats`,
`inappropriate_language`, `fake_profile`, `other`), `details` (5-2,000 characters), and `consent: true`. Optional `messageId`
must identify a received message in the reporter's conversation. Encrypted
evidence requires its original `signedEvidence` (max 32,768 characters),
verified against that message's exact sender/conversation/client/key context.
Legacy evidence is copied from the selected participant-authorized record and
marked unverified. Self-reports, forged/unrelated evidence, and duplicate open
reports are rejected; reports are limited to ten per account per day.

Decisions accept `action` (`review`, `dismiss`, `remove_message`, `suspend_user`)
and `note` (5-2,000 characters). Only the attached message can be removed.
Self/administrator suspension is forbidden. Concurrent/already-reviewed
decisions return 409. No admin endpoint grants blanket conversation access.
Roles are provisioned by the [operator CLI](messaging-security.md#administrator-provisioning),
not registration fields or client claims.

## Notifications and preferences

| Method | Path | Contract |
|---|---|---|
| GET | `/realm/notifications` | Paginated notifications plus `unreadCount` |
| PATCH | `/realm/notifications` | `{ "read": true }`, mark all own notifications read |
| PATCH | `/realm/notifications/:notificationId` | Same body, only the user's notification |
| GET | `/realm/preferences` | Current booleans plus optional `pushPublicKey` |
| PUT | `/realm/preferences` | Partial boolean updates |
| POST | `/realm/push/subscriptions` | `{ "endpoint": "<https URL>", "keys": { "p256dh": "...", "auth": "..." } }`, 201 |
| DELETE | `/realm/push/subscriptions` | `{ "endpoint": "<current browser URL>" }`, 200 |

All require authentication. Notification objects contain `id`, `kind`,
`title`, `link`, `params`, `readAt`, and `createdAt`. `title` is an English
fallback; clients localize from `kind` and the `params` object. Kinds and their
in-app/push/email defaults are defined in
`backend/src/engines/notification-catalog.js`; kinds without an in-app channel
are never listed. Preferences are `messages`,
`announcements`, `engagements` (default true), `profileViews`, `push`, and
`analytics`, and `platformAnalytics` (default false), plus the optional
interface `locale` (`en`, `nl`, or `it`; `null` until chosen). Platform consent requires
personal analytics; disabling personal analytics also disables platform
aggregates. Announcement alerts are for followed musicians.
Profile-view alerts are anonymous and limited to one per UTC day when both
users consent to analytics and the owner enables that category.

Push subscription keys are validated and arbitrary destinations rejected with
400 `INVALID_PUSH_SUBSCRIPTION`. Up to five browsers per account are supported;
additional devices return `PUSH_DEVICE_LIMIT`. Push-not-configured is 503.
Registering a subscription enables push; disabling `push` in preferences
removes all account subscriptions. DELETE removes only the calling user's
matching browser endpoint. Old, already-read, and push-disabled-at-creation
notifications are not delivered later on opt-in. Notifications expire after
90 days; a worker cleans them up hourly.

## Notification channels

| Method | Path | Contract |
|---|---|---|
| GET | `/realm/preferences/notifications` | Every catalog kind with per-channel availability, default, and current choice |
| PUT | `/realm/preferences/notifications` | `{ "kinds": { "<kind>": { "inApp"?: bool \| null, "push"?: bool \| null, "email"?: bool \| null } } }` |

Both require authentication; PUT allows 60 requests per minute. The response
of both is:

```json
{
  "categories": { "messages": true, "announcements": true, "engagements": true, "profileViews": false },
  "push": false,
  "pushConfigured": true,
  "email": { "address": "musician@example.test", "verified": true, "configured": true },
  "plan": "free",
  "kinds": [{
    "kind": "message", "category": "messages", "categoryEnabled": true,
    "planFeature": null, "planAllowed": true,
    "channels": {
      "inApp": { "availability": "on", "default": true, "enabled": true },
      "push": { "availability": "on", "default": true, "enabled": true },
      "email": { "availability": "optional", "default": false, "enabled": false }
    }
  }]
}
```

`kinds` follows `backend/src/engines/notification-catalog.js`. `availability`
is `on` (enabled by default), `optional` (disabled until chosen), or `off`
(never delivered on that channel). `enabled` is the user's choice, or the
default when no choice is stored. The optional in-app channel of a kind with a
category (profile views) defaults on because its category switch is the opt-in.
PUT is partial: omitted kinds and channels stay unchanged, booleans store a
choice, and `null` restores the default. Enabling an `off` channel returns 400
`CHANNEL_UNAVAILABLE`; unknown kinds or channels return 400 `VALIDATION_ERROR`.
Choices apply to notifications created afterwards.

A notification is delivered on a channel only when all of these hold:

- The account is active and not deleted.
- The legacy category boolean (`messages`, `announcements`, `engagements`,
  `profileViews` in `/realm/preferences`) is on. These stay master switches for
  their kinds on every channel; kinds without a `category` have no switch.
- The channel is available for the kind and enabled for the user.
- Push also needs the browser push switch (`push`) and a subscribed browser.
- Email also needs a verified address. It goes to the account address.

Rows that would reach no channel are not created. Email is an outbox on the
notification row: workers lease due rows with `SKIP LOCKED`, try up to three
times, and never include message text, titles, or names. Emails are localized
from `locale` (default English), link to the notification and to
`#settings?section=notifications` on the first `PORTAL_ORIGINS` entry, and are
sent only to verified, active accounts. Without SMTP the worker stays idle.
An email is skipped when its in-app notification was already read, or when an
email for the same kind and link (such as one conversation) was sent in the
previous 15 minutes.

Scheduled kinds are idempotent through event keys and safe with several API
processes. `announcement_stats` and `profile_stats` are weekly digests of the
previous 7 days (`params`: `views`, plus `likes` and `saves` for announcements,
and the ISO `week`) for users with analytics consent, a chosen channel, and a
plan with the matching statistics switch. `come_back` (`params.days`) reminds
inactive users at most once per inactivity period, and `invite_friends`
(`params.days`) is one in-app nudge per account linking to `#invite`. See
[configuration](configuration.md#notification-email-and-scheduled-notifications)
for intervals and thresholds.

## Mobile push devices

| Method | Path | Contract |
|---|---|---|
| GET | `/realm/push/devices` | `{ "providers": { "android": bool, "ios": bool }, "devices": [{ id, platform, createdAt, updatedAt }] }` |
| POST | `/realm/push/devices` | `{ "platform": "android" \| "ios", "token": "<FCM or APNs token>" }`, 201 returns the device |
| DELETE | `/realm/push/devices` | Same body; removes the caller's matching device |
| DELETE | `/realm/push/devices/:deviceId` | Removes one of the caller's devices; 404 otherwise |

All require authentication. `providers` reports which native push services the
server has configured. Android tokens are Firebase Cloud Messaging registration
tokens; iOS tokens are hexadecimal APNs device tokens (stored lowercase).
Invalid tokens return 400 `INVALID_PUSH_DEVICE`; an unconfigured platform returns
503 `PUSH_NOT_CONFIGURED`. Each account can register 10 devices; more return
400 `PUSH_DEVICE_LIMIT`, and registration is rate limited per client.
Registering an existing token moves it to the caller,
refreshes `updatedAt`, and enables the `push` preference. Tokens are never
returned. Disabling `push` in preferences removes every device.

Native and browser push share one delivery worker and payload: a generic
`Every.music` title, the notification's English fallback title as body, the
notification ID, and its app link. Message text is never sent. Tokens that the
provider reports as unregistered are deleted; other failures are retried up to
three times.

## Plans and limits

| Method | Path | Contract |
|---|---|---|
| GET | `/realm/entitlements/me` | `{ plan, limits, entitlements }` for the caller |
| GET | `/realm/admin/users/:userId/entitlements` | Admin-only, same shape for another user |
| POST | `/realm/admin/users/:userId/entitlements` | Admin-only `{ "plan": "premium" \| "partner", "days": 1-3650 }`; omit `days` for no end date; 201 |
| DELETE | `/realm/admin/entitlements/:entitlementId` | Admin-only revocation |

`plan` is the highest active plan: `free`, `premium`, or `partner`. `limits`
contains `maxActiveAnnouncements`, `maxSavedSearches`, `maxProjectsShown`,
`maxContentShown`, `maxSavedAnnouncements`, and `announcementExpiryDays`
(integers, or `null` for unlimited), plus the feature switches
`announcementStats`, `profileVisits`, and `businessPages`. Operators configure
the values; see [configuration](configuration.md#plans-and-limits). Features
that exceed a limit return 403 `PLAN_LIMIT_REACHED`. Admin grants and revocations
are recorded in the audit log.

## Monetization: billing, points and sponsored content

See [monetization](monetization.md) for the model and Stripe setup.

| Method | Path | Contract |
|---|---|---|
| GET | `/realm/billing` | `{ enabled, currency, plans[], packs[], plan, entitlements, limits, perks: { free, premium, partner }, subscription, billingAccount }`; works without Stripe (`enabled: false`) |
| POST | `/realm/billing/checkout` | `{ "product": "premium" \| "partner" \| "points", "packId"? }`, 201 `{ url, sessionId }`; redirect the browser to `url`; at most 10 per hour |
| POST | `/realm/billing/portal` | 200 `{ url }` of the Stripe customer portal; 404 `BILLING_ACCOUNT_NOT_FOUND` before the first checkout |
| POST | `/realm/billing/webhook` | Stripe only: raw JSON body with a valid `Stripe-Signature`, 200 `{ received, duplicate }` |
| GET | `/realm/points` | `{ balance, rules: { earn, spend }, promotions[] }` |
| GET | `/realm/points/ledger` | Paginated `entries[]` of `{ id, delta, reason, balanceAfter, note, createdAt }`, newest first |
| POST | `/realm/points/spend` | `{ "kind", "days", "announcementId"?, "placeId"?, "radiusKm"? }`, 201 `{ kind, cost, balance, promotion \| entitlement }`; at most 30 per hour |
| GET | `/realm/referrals` | `{ code, link, counts: { pending, rewarded, capped }, recent[], rewards, claim: { open, used, status, days } }` |
| POST | `/realm/referrals/claim` | `{ "code" }`, 201 `{ status, overview }`; at most 10 per hour |
| GET | `/realm/rewards/videos` | Live rewarded videos `{ videos[], today: { completed, cap } }` |
| POST | `/realm/rewards/videos/:cardId/views` | 201 `{ token, minimumSeconds, expiresInMinutes }`; abandons the caller's previous open view |
| POST | `/realm/rewards/views/complete` | `{ "token" }`, 200 `{ points, balance, today }` |
| POST | `/realm/sponsored/:cardId/click` | Optional authentication; counts one anonymous click, returns `{ linkUrl }` |
| GET | `/realm/sponsored/:cardId/video` | Public uploaded video of a live card; supports `Range: bytes=` (206/416) |
| GET/PUT | `/realm/monetization/settings` | `{ hideSponsored, eligible }`; turning hiding on needs a paid plan (403 `PLAN_LIMIT_REACHED`) |
| GET | `/realm/admin/monetization` | Admin-only aggregates: payments and subscription counts, points earned/spent in 30 days by reason, points outstanding, active promotions, referrals, sponsored totals, recent offers and grants |
| GET/POST | `/realm/admin/sponsored-cards` | Admin-only paginated list with 30-day totals, or create (201) |
| PATCH/DELETE | `/realm/admin/sponsored-cards/:cardId` | Admin-only partial edit or deletion |
| POST | `/realm/admin/sponsored-cards/:cardId/video` | Admin-only `{ "data": "<base64>", "mimeType": "video/mp4" \| "video/webm" }` up to `SPONSORED_VIDEO_BYTE_LIMIT`, 201 |
| POST | `/realm/admin/offers` | Admin-only `{ "headline", "message", "audience": "all" \| "free" \| "paid", "link"?: "#route" }`, 201 `{ id, recipients }` |
| POST | `/realm/admin/points/grants` | Admin-only `{ "email", "points": 1-100000, "note" }`, 201 `{ userId, points, balance, entry }` |

Payment routes return 503 `PAYMENTS_DISABLED` unless `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` are set; Stripe API failures return 502
`PAYMENT_PROVIDER_ERROR`. Checkout returns 404 `PLAN_NOT_AVAILABLE` or
`PACK_NOT_FOUND` for unconfigured products and 409 `SUBSCRIPTION_EXISTS` while
a subscription is active (change plans in the portal). The webhook rejects
unsigned or altered bodies with 400 `INVALID_SIGNATURE`. Plans and points are
granted only from these events, never from the checkout return URL.

Spend kinds are `premium_days`, `profile_boost`, `announcement_boost`, and
`announcement_pin`. `days` must be one of the configured durations
(`rules.spend.premiumDurations` or `promotionDurations`); pins also need a
GeoNames `placeId` and `radiusKm` between `pinMinRadiusKm` and
`pinMaxRadiusKm`. Errors: 400 `INVALID_SPEND`, 404 `ANNOUNCEMENT_NOT_FOUND` for
someone else's call, 409 `ANNOUNCEMENT_NOT_LIVE` for drafts and expired calls,
409 `ANNOUNCEMENT_EXPIRES_FIRST` when the call expires before the promotion
would end, and 409 `INSUFFICIENT_POINTS`. Repeat boosts of one target and
Premium days queue after the current period. Ledger `reason` values are
`purchase`, `referral_inviter`, `referral_invitee`, `rewarded_video`,
`app_rating`, `event_grant`, and the four spend kinds.

Referral claims: 409 `REFERRAL_CLAIM_CLOSED` after `REFERRAL_CLAIM_DAYS`, 409
`REFERRAL_EXISTS` when already referred, 404 `REFERRAL_CODE_NOT_FOUND`, 400
`REFERRAL_SELF` or `REFERRAL_RECIPROCAL`. Rewards are credited once the invited
account's email is verified; inviters beyond `REFERRAL_MONTHLY_CAP` rewarded
invites this month get status `capped`.

Rewarded views: 404 `VIDEO_NOT_FOUND`, 429 `DAILY_VIDEO_CAP_REACHED`, 409
`WATCH_TIME_NOT_REACHED` (with the remaining seconds in the message) before
`minimumSeconds` have passed since the token was issued, and 409
`VIEW_NOT_ACTIVE` for used, abandoned, expired (after 60 minutes) or foreign
tokens.

Sponsored card fields: `sponsorName` (2-80), `title` (3-120), `body` (3-600),
`linkUrl` and `videoUrl` (`https://` only), `linkLabel`, `imageUrl` (an image
uploaded by the administrator with purpose `sponsored`) with a required
`imageAlt`, `videoSeconds` (5-600), `rewardPoints` (1-1000, default
`POINTS_REWARDED_VIDEO`), `placements` (`feed`, `musicians`), `genreIds` and
`instrumentIds` (up to 20 catalog UUIDs), `placeId` with `radiusKm`, `startsAt`,
`endsAt`, `priority` (0-100), `maxPerPage` (1-3), and `active`. Public card
objects in search results contain `id`, `sponsorName`, `title`, `body`,
`linkUrl`, `linkLabel`, `imageUrl`, `imageAlt`, `rewarded`, and `rewardPoints`.
Card changes, video uploads, offers and grants are audited as
`sponsored_card_created`, `sponsored_card_updated`, `sponsored_card_deleted`,
`sponsored_video_uploaded`, `offer_broadcast`, and `points_granted`.

Notifications: `points_earned` (`{ points, reason }`), `subscription_started`
and `subscription_ended` (`{ plan }`), `payment_failed` (`{ plan }`), and
`offers` (`{ headline, message }`). Live events: `points.changed` and
`entitlements.changed` (to the member) and `sponsored.changed`.

## Marketplace

| Method | Path | Contract |
|---|---|---|
| GET | `/realm/marketplace/catalog` | Public listing types, tabs with category/subcategory keys, conditions, price modes, rate units, statuses, sorts, currencies, `maxPhotos`, `maxTags`, `listingDays` |
| GET | `/realm/marketplace/listings` | Optional authentication; visible active/reserved listings, filtered, sorted and paginated |
| POST | `/realm/marketplace/listings` | Authenticated create, 201; at most 30 per hour |
| GET | `/realm/marketplace/listings/mine` | Own listings in every state, newest first, paginated |
| GET | `/realm/marketplace/listings/saved` | Own saved listings that are still visible, most recently saved first |
| GET | `/realm/marketplace/listings/:listingId` | Optional authentication; visible listing, or any own listing |
| PATCH | `/realm/marketplace/listings/:listingId` | Owner-only partial edit and `status` change |
| POST | `/realm/marketplace/listings/:listingId/renew` | Owner-only; expiry becomes now plus `listingDays` |
| DELETE | `/realm/marketplace/listings/:listingId` | Owner-only permanent deletion |
| POST/DELETE | `/realm/marketplace/listings/:listingId/save` | Save or unsave a visible listing |
| POST | `/realm/marketplace/listings/:listingId/reports` | Report someone else's visible listing, 201; at most 20 per hour |
| GET | `/realm/admin/marketplace/reports` | Admin-only listing report queue; optional `status` |
| DELETE | `/realm/admin/marketplace/listings/:listingId` | Admin-only moderation removal with `{ "note": "<5-2000 characters>" }` |

Listing fields:

| Field | Rules |
|---|---|
| `type` | `sell`, `wanted`, `lesson`, `service_offer`, `service_wanted`, or `endorsement` |
| `category`, `subcategory` | Keys from the catalog for the type's tab (`gear`, `lessons`, `services`, `endorsements`); `subcategory` is optional and must belong to the category |
| `title`, `description` | 3-120 and 10-5,000 characters after trimming |
| `condition` | `new`, `used`, or `refurbished`; required for `sell`, optional for `wanted`, otherwise `null` |
| `priceMode` | `fixed`, `negotiable`, `free`, or `contact` |
| `priceMinor`, `currency` | Integer minor units (for example cents) from 0 to 100,000,000,000 and an ISO 4217 code, both or neither; required for `fixed`, optional for `negotiable`, forbidden for `free` and `contact` |
| `rateUnit` | `hour`, `session`, `day`, or `project`; lessons and services only, required when they have an amount |
| `locationText`, `latitude`, `longitude` | Optional free text (160 characters) and an optional coordinate pair |
| `remote`, `shipping` | Booleans; shipping applies to gear only |
| `photos` | Up to 8 unique `/realm/media/<uuid>` URLs uploaded by the lister with purpose `listing`; the first is the cover |
| `instrumentIds`, `genreIds` | Up to 10 catalog UUIDs each |

Create requires `type`, `category`, `title`, `description`, and `priceMode`.
PATCH accepts the same fields plus `status` (`active`, `reserved`, `sold`,
`closed`). Omitted fields stay unchanged; `null` clears an optional field and
an empty array clears photos or tags. Cross-field rules are checked on the
merged listing and return 400 `INVALID_LISTING`, `INVALID_MEDIA`, or
`INVALID_TAG`. An account can have at most 50 open (active or reserved,
unexpired) listings; creating, reopening, or renewing beyond that returns 403
`LISTING_LIMIT_REACHED`. Renewing a sold or closed listing returns 409
`LISTING_CLOSED`; editing a moderated listing returns 409 `LISTING_REMOVED`.
Up to 500 listings can be saved (403 `SAVED_LISTING_LIMIT`).

Responses contain `id`, the fields above, `photos` (URLs), `instruments` and
`genres` (`{ id, name }`), `status`, `expiresAt`, `expired`, `createdAt`,
`updatedAt`, `seller` (`userId`, `artistName`, `pictureUrl`), `isSaved`,
`isOwner`, and `removedByModeration` (true only for the owner or an
administrator). Administrators also receive `removedAt` and `moderationNote`.
New listings expire after `MARKETPLACE_LISTING_DAYS` (default 60). Expired,
removed, and suspended-account listings, and their photos, are hidden from
everyone except the owner (and, for listings, administrators).

Search accepts `q` (title/description keywords, wildcards are literal), `tab`,
`type` (must belong to `tab`), `category`, `subcategory`, `condition`,
`currency`, `priceMin`/`priceMax` (minor units; a price range requires
`currency`), `location` (case-insensitive text), `remote=true`,
`shipping=true`, `instrumentId`, `genreId`, `sort` (`newest`, `price_asc`,
`price_desc`, `title`), `page`, and `pageSize`. Free listings sort as zero and
listings without an amount sort last. Results are `{ listings, pagination }`.

Reports take `{ category, details, consent: true }` with the same categories,
length limits, consent rule, and daily limit as user reports. They are stored
as user reports about the lister with a `listingId`, so they appear in
**Your reports**, the general admin queue and its audited detail view.
Duplicate open reports for the same listing return 409, and reporting your own
listing returns 400. The marketplace queue returns `id`, `category`, `status`,
`createdAt`, `listingId`, `listingTitle`, `listingRemoved`, `sellerId`, and
`sellerName`, without report details. Moderation removal hides the listing,
marks its open reports `actioned`, notifies reporters (`report_reviewed`) and
the lister (`listing_removed`), and writes a `listing_removed` audit entry.
Removing an already removed listing returns 409.

Every.music does not process marketplace payments, hold funds, or settle
disputes. Contact goes through the existing encrypted
`POST /realm/conversations` flow with `seller.userId`.

An hourly job sends one `listing_expiring` notification (in-app on, push and
email optional) when an open listing is within
`MARKETPLACE_EXPIRY_REMINDER_DAYS` (default 3) of expiry; renewal re-arms it.
Its `params` are `listingId`, `title`, and `expiresAt`. The job also deletes
listings that expired or were removed by moderation more than 365 days ago.
Changes publish `marketplace.changed` events, and saving publishes
`marketplace.saved.changed` to the saving user.

## Events (concerts and festivals)

Events live under `/realm/gigs` because `GET /realm/events` is the live-update
stream. Reads accept optional authentication (it adds viewer fields); writes
require it. Drafts are visible only to their editors.

| Method | Path | Contract |
|---|---|---|
| GET | `/realm/gigs` | Search published events (see filters below), paginated as `events` |
| POST | `/realm/gigs` | Create, 201; at most 20 per hour |
| GET | `/realm/gigs/mine` | `role` `organizing` (default: events you can edit, drafts included) or `attending` (going or interested), `when`, paging |
| GET | `/realm/gigs/organizations/:organizationId` | Published events a page organizes, performs in, or hosts as venue; `when` (`upcoming` default, `past`); each event adds `relations` (`organizer`, `performer`, `venue`) |
| GET | `/realm/gigs/profiles/:userId` | Events a person performs in or owns, plus events they go to and show on their profile; `relations` (`performer`, `attendee`); hidden between blocked accounts |
| GET | `/realm/gigs/:eventId` | Detail with `communications` (latest 50) and `viewer` |
| GET | `/realm/gigs/:eventId/calendar.ics` | `text/calendar` download (not a JSON envelope) |
| PATCH | `/realm/gigs/:eventId` | Partial edit by an editor; also `status` and optional `statusNote`; at most 120 per hour |
| DELETE | `/realm/gigs/:eventId` | Editors delete drafts, cancelled, or ended events (409 `EVENT_ACTIVE` otherwise) |
| PUT / DELETE | `/realm/gigs/:eventId/attendance` | `{ "status": "going" \| "interested", "showOnProfile"?: boolean }` or remove |
| PUT | `/realm/gigs/:eventId/reminders` | `{ "offsets": [minutes, ...] }` replaces your reminders; up to 5, each 5-20160 minutes before the start |
| DELETE | `/realm/gigs/:eventId/lineup/:entryId` | A listed artist, or a band member with `manage_calendar`, leaves the lineup |
| GET / POST | `/realm/gigs/:eventId/posts` | Attendee discussion, paginated as `posts`; posting `{ "body" }` (1-2,000 characters) |
| DELETE | `/realm/gigs/:eventId/posts/:postId` | Author, editors, or administrators |
| POST | `/realm/gigs/:eventId/posts/:postId/reports` | Report a discussion message, 201 |
| POST | `/realm/gigs/:eventId/reports` | Report the event, 201 |
| POST | `/realm/gigs/:eventId/communications` | Editors send `{ "kind", "body" }` (1-4,000 characters) to attendees, 201 |
| GET / POST | `/realm/organizations/:organizationId/verification-request` | Page leader: status, or request verification (see below) |
| DELETE | `/realm/organizations/:organizationId/verification-request/:requestId` | Page leader cancels a pending request |

Event fields:

| Field | Rules |
|---|---|
| `title`, `description` | 3-160 characters; description up to 10,000 |
| `type` | `concert` (default), `festival`, or `other` |
| `timezone` | IANA zone such as `Europe/Rome`; required |
| `startsAt`, `endsAt`, `doorsOpenAt` | Local wall-clock times `YYYY-MM-DDTHH:mm` in `timezone`; `startsAt` is required, the end must follow the start and doors must open before it |
| `venueId` | A venue page; its coordinates are used for maps and distance when the event has none |
| `placeId`, `address` | GeoNames city and free-text address (300 characters) |
| `latitude`, `longitude` | Optional exact position, both or neither |
| `capacity`, `ticketsSold` | Integers; tickets sold needs a capacity and cannot exceed it |
| `ticketLinks` | Up to 5 `{ label, url }`, `https://` only |
| `images` | Up to 6 `/realm/media/<uuid>` URLs uploaded with purpose `event` (or already on this event); the first is the cover |
| `genreIds` | Up to 10 catalog genres |
| `organizerIds` | Up to 5 pages; adding or removing one needs `manage_calendar` on that page. Without organizers, the creator owns the event |
| `lineup` | Up to 50 ordered `{ role, bandId?, artistId?, name?, setStartsAt?, setEndsAt? }` with exactly one of a band page, an artist profile, or a name; `role` is `headliner`, `opener`, `support`, or `other` |
| `visibility` | `draft` (default) or `published` |

Editors are the owning artist and active members of an organizer holding
`manage_calendar` (leaders and admins always do), checked with
`organizationRepository.requireMember`. Others receive 403
`EVENT_PERMISSION_REQUIRED`; missing events and other people's drafts return 404
`EVENT_NOT_FOUND`. Events without an owning artist whose organizer pages were
all deleted are hidden; editors can drop deleted organizer pages without
permission on them. Omitted fields stay unchanged and arrays replace the stored
list; stored times change only when a time or `timezone` is sent (wall-clock
values that occur twice resolve to the first occurrence, and skipped ones to
the time after the gap). Cross-field problems return 400 `INVALID_EVENT`; foreign or wrong-purpose
images 400 `INVALID_MEDIA`; unknown pages, people, or genres 400
`INVALID_VENUE`, `INVALID_LINEUP`, `INVALID_ORGANIZER`, or `INVALID_GENRE`;
removing the last organizer of a page-owned event 400 `ORGANIZER_REQUIRED`;
unpublishing an event people replied to 409 `EVENT_HAS_ATTENDEES`.

Responses contain `id`, the fields above in API shape, `status` (`scheduled`,
`postponed`, `cancelled`, or `completed` once a non-cancelled event has ended;
events without an end count as ended four hours after the start),
`scheduledStatus`, `startsAt`/`endsAt`/`doorsOpenAt` as UTC instants plus
`local` wall-clock values, `upcoming`, `venue`, `place`, `coordinates`
(explicit, venue, or city), `map` (OpenStreetMap map and directions links),
`ticketsSoldPercent` (rounded down; 100 means sold out), `soldOut`,
`organizers`, `owner`, `lineup` entries with `name`, `band` or `artist`, and
`local` set times, `attendance` (`going`, `interested`), `calendar`
(`googleUrl` template link and `icsPath`), and `viewer` (`canEdit`,
`attendance`, `showOnProfile`; detail adds `reminders`, `canDiscuss`,
`canModerate`).

Search accepts `q` (title, description, venue, and lineup names), `when`
(`upcoming` default, `past`, `all`), `from`/`to` (`YYYY-MM-DD`, compared with
the start date in the event's zone), `type`, `bandId`, `artistId`,
`organizerId`, `venueId`, `genreId`, `placeId` or `latitude`/`longitude` with
`radiusKm` (1-500, default 50, portable bounding box plus haversine),
`location` (city, region, country, address, or venue text), `sort` (`date`,
`band` for the first headliner, `organizer`, `location`), and paging. Upcoming
events sort by soonest start, past events by most recent.

Replies are closed for cancelled events (409 `EVENT_CANCELLED`). New reminder
times that already passed return 400 `REMINDER_IN_PAST`; reminders already
set (including ones that fired) can stay selected and never fire twice. A background job in
every API process leases due reminders with `SKIP LOCKED` every
`EVENT_REMINDER_INTERVAL_SECONDS` and creates one `event_reminder` per
reminder; moving the start re-arms reminders, and cancelled or past events
send none. The discussion is open to attendees (going or interested), editors,
and administrators (403 `EVENT_ATTENDANCE_REQUIRED` otherwise), hides people
blocked in either direction, and allows 20 posts per account every 10 minutes
(429 `ACCOUNT_RATE_LIMIT`) besides the route limit. Reports use the shared
report categories, consent, daily limit, and queue: the reported message (or
the event title) is copied as unverified evidence, event reports target the
owner, creator, or first organizer's leader. When an administrator removes a
reported message its open reports become `actioned` and the removal is audited
as `event_post_removed`; deletions by authors or organizers leave reports open
with the copied evidence.

Communication kinds are `door_open`, `cancellation`, `refund`,
`lineup_change`, `postponement`, and `general`. Changing a published event to
`cancelled` or `postponed` adds an automatic communication with the optional
`statusNote`. Every communication notifies everyone going or interested with
kind `event_communication` (`params`: `eventId`, `title`,
`communicationKind`). Publishing an event the first time notifies followers of
its organizers, lineup bands, venue, owner, and lineup artists
(`event_published`), and tells listed artists and band managers they are on
the lineup (`event_lineup`, also for later additions). All four event kinds
default to in-app, push, and email. Changes publish `gigs.changed`,
`gigs.posts.changed` (event ID only), and `gigs.mine.changed` to the affected
user.

The calendar file is RFC 5545 text with escaped values, folded lines, a stable
`UID`, a `SEQUENCE` that grows with each edit, `STATUS`
(`CONFIRMED`/`TENTATIVE`/`CANCELLED`), and the event's `TZID` with a matching
`VTIMEZONE` (UTC times when an event crosses a daylight saving change).

### Page verification requests

The page leader sends `{ "note": "<10-2,000 characters>", "documentMediaId"?: "<uuid>" }`
(an unused `verification` image of their own); GET returns `verified`,
`verifiedAt`, a daily `challengeCode` for the page, and the latest `request`
(`status`, `note`, `documentUrl`, `reviewNote`). Other members receive 403
`LEADER_REQUIRED`. Verified pages return 409 `ALREADY_VERIFIED`, a second
pending request 409 `VERIFICATION_PENDING`, and more than three requests a day
429 `ACCOUNT_RATE_LIMIT`; the route allows five per day. Requests appear in the
administrator verification queue with `subjectType: "organization"`,
`organizationName`, `organizationKind`, `organizationVerifiedAt`, and
`requestNote`. Approval sets `organizations.verified_at`; decisions are audited
as `organization_verification_approved`/`organization_verification_rejected`
and notify the requester (`verification_decided` with `subjectType`,
`organizationId`, and `organizationName`). Administrators who belong to the
page, or who requested it, receive 403 `SELF_REVIEW`.

## Help center, legal terms, onboarding, versions, and ratings

| Method | Path | Contract |
|---|---|---|
| GET | `/realm/legal` | Public operator details, `effectiveDate`, `termsVersion`, `configured`, and `template: true` |
| GET | `/realm/app/version` | Public `serverVersion`, `minimumClientVersion`, `latestClientVersion`, and `updateUrl` (`null` when unset) |
| GET | `/realm/legal/acceptance` | Authenticated `{ termsVersion, acceptedVersion, acceptedAt, required }` |
| POST | `/realm/legal/acceptance` | Authenticated `{ "termsVersion": "<current>" }`; returns the same state |
| GET | `/realm/onboarding` | Authenticated `{ tour: { status, updatedAt } }`; status is `pending`, `completed`, `skipped`, or `null` |
| PUT | `/realm/onboarding/tour` | Authenticated `{ "status": "completed" \| "skipped" }` |
| POST | `/realm/support` | Optional authentication; create a help request, 201 |
| GET | `/realm/support/me` | Authenticated, paginated `requests` sent from the account |
| GET | `/realm/admin/support` | Admin-only paginated `requests` plus per-status `counts`; optional `status` and `kind` |
| GET | `/realm/admin/support/:requestId` | Admin-only detail; access is audited |
| PATCH | `/realm/admin/support/:requestId` | Admin-only `{ "status": "...", "replyNote": "..." }`; audited |
| GET | `/realm/ratings/me` | Authenticated latest 20 own ratings |
| POST | `/realm/ratings` | Authenticated `{ "appVersion": "1.2.0", "stars": 1-5, "comment": "...", "platform": "web" }`, 201 |
| GET | `/realm/admin/ratings` | Admin-only totals, star distribution, per-version averages, and recent comments |

`required` is true when the account has not accepted the current
`TERMS_VERSION`. A stale `termsVersion` returns 409 `TERMS_VERSION_CHANGED`.
The first accepted version of an account (at registration or through the prompt)
also queues the welcome tour with status `pending`; later acceptances do not.

Help requests accept `kind` (`bug`, `contact`, `work`), `subject` (3-200
characters after trimming), `message` (10-5,000), optional `name` (120),
`email` (required without authentication), `steps` (bug reports only, 5,000),
`link` (work enquiries, an http(s) URL), and `website`, a honeypot that must stay
empty. Bug reports may add `diagnostics` (`appVersion`, `platform`, `locale`,
`userAgent`) only with `diagnosticsConsent: true`; otherwise 400
`DIAGNOSTICS_CONSENT_REQUIRED`. 201 returns `{ "received": true, "id": <uuid> }`
when signed in and `id: null` otherwise; a filled honeypot gets the same response
without storing anything. Requests are limited to six per hour per client
address (429 `RATE_LIMIT_EXCEEDED`) and ten per account per day
(429 `SUPPORT_LIMIT`). A present but invalid Bearer token returns 401 instead of
an anonymous submission.

Support statuses are `open`, `in_progress`, `answered`, and `closed`. `answered`
requires a reply note (5-5,000 characters), either new or already stored. A new
reply sets `answeredAt`, records `support_replied`, and, for requests sent while
signed in, creates a `support_reply` notification linking to
`#help?view=requests`. Status changes record `support_status_changed`; detail
reads record `support_request_viewed`. Unknown requests return 404
`SUPPORT_REQUEST_NOT_FOUND`.

A rating's `appVersion` must be `MAJOR.MINOR.PATCH`, not older than
`CLIENT_MIN_VERSION`, and not newer than the newer of `CLIENT_LATEST_VERSION` and
`APP_VERSION` (400 `INVALID_APP_VERSION`). Each account can rate a version once
(409 `RATING_EXISTS`); ratings are limited to ten per hour. Ratings carry
`rewarded_at`/`reward_reference` for a later rewards feature: server code can
lock unrewarded rows with `ratingRepository.unrewarded(executor)` and mark them
with `ratingRepository.markRewarded(executor, id, reference)` inside the same
transaction that grants the reward. The monetization job grants
`POINTS_APP_RATING` points for the first rating of each account and marks later
ratings processed without points.

## Analytics

POST `/realm/analytics/events` with `{ "kind": "profile_view" |
"announcement_view", "resourceId": "<visible resource uuid>" }`.
The authenticated actor and resource owner must both have `analytics: true`;
self-views are not counted. 200 returns `{ "recorded": true | false }`.
Successful likes, new bookmarks, and received messages also contribute
consented aggregates. The API does not accept arbitrary metric kinds/owners.

GET `/realm/analytics` requires the caller's plan to include
`announcementStats` (otherwise 403 `PLAN_LIMIT_REACHED`; consent rules are
unchanged). It returns only the caller's `daily` aggregate rows
(`day`, `kind`, `count`) and `content` reach for their latest 100 announcements
(`id`, `title`, `views`, `likes`, `saves`). The reporting window is the last
30 database calendar days. There are no viewer IDs, IPs, message bodies,
third-party trackers, or unique-visitor claims. Message counts are not linked
to individual conversation IDs. Opting out deletes the caller's daily report
totals; public announcement counters and functional messages/reactions/bookmarks
remain. Hourly maintenance removes older daily aggregates. Operational HTTP logs are
separate and may contain client IPs.

The admin report reads a separate `platform_analytics_daily` collection.
Both actor and owner must explicitly opt in to personal **and** platform
analytics at collection time. Historical personal totals are not repurposed.
Opting out clears platform totals for the owner's content and stops new
contributions; earlier anonymous contributions to somebody else's aggregates
cannot be selectively attributed/removed. Admin outputs contain operational
account/report totals, global daily counts and opted-in public-call reach, not
visitor identities or private conversation details.

## Live events

GET `/realm/events` with a Bearer access token returns an SSE
`text/event-stream`, not a JSON envelope. Use streaming `fetch` so tokens stay
out of URLs. Frames are `data: {"type":"messages.changed","id":"<uuid>",...}`
separated by blank lines, with heartbeat comments every 15 seconds. The
initial `connected` event tells clients to reload current data.

Types include `profiles.changed`, `announcements.changed`, `comments.changed`, `organizations.changed`, `gigs.changed`, `gigs.posts.changed`, `gigs.mine.changed`,
`messages.changed`, `conversations.changed`, `saved.changed`,
`notifications.changed`, `preferences.changed`, `analytics.changed`,
`keys.changed`, `reports.changed`, `admin.changed`, `blocks.changed`,
`saved-searches.changed`, and `account.changed`. Public content

`keys.changed`, `reports.changed`, `admin.changed`, `support.changed`, and `account.changed`. Public content
invalidations are shared; private types target only the affected user.
Payloads never contain message bodies or credentials. Read current state
from the corresponding authenticated APIs; events are not a durable log.
Streams close at token expiry, on listener failure, slow-client backpressure,
or server shutdown. Reconnect with backoff and refresh on 401. Limits are
three streams per user within each API process, and 1,000 total per process
(429 on exhaustion). Key/report/admin invalidations target affected accounts.
Account/role changes close current streams so reconnect checks live permission.

For example:

```bash
curl --no-buffer http://localhost:8080/realm/events \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

## Errors and limits

Existing JSON success/error envelopes remain in use except for image bytes
and successful SSE streams. Invalid JSON/schema fields or search values are
400 `VALIDATION_ERROR`; missing authentication is 401; forbidden sends are
403; missing/foreign resources are 404; message conflicts are 409. Oversized
bodies are 413; rate limits and connection limits are 429. Optional providers
can return 503 when disabled or 502 when unavailable. The configured global
request rate and stricter existing auth-route limits still apply.

## Catalog

| Method | Path | Description |
|---|---|---|
| GET | `/realm/catalog/instruments` | Instruments grouped by category |
| GET | `/realm/catalog/genres` | Genres and parent genres |

## Account security, privacy, and verification

All routes below require authentication except the two sign-in step routes.

### Two-step sign-in

| Method | Path | Contract |
|---|---|---|
| POST | `/realm/auth/two-factor/verify` | `{ "challengeToken", "code" }`; returns the normal session envelope plus `isNewUser: false` |
| POST | `/realm/auth/two-factor/resend` | `{ "challengeToken" }`; email/SMS only, at most three sends per challenge |

With two-step verification on, `POST /realm/auth/login` and `/realm/auth/login/google`
return 200 with `{ "twoFactorRequired": true, "challengeToken", "method":
"totp" | "email" | "sms", "destinationHint", "codeSent", "expiresAt" }` and no
access or refresh token. Google responses also keep `isNewUser`. `codeSent` is
`null` for authenticator apps and `false` when email/SMS delivery failed (send
again or use a recovery code). Challenges are hashed, expire after 10 minutes,
and accept five attempts. `code` is a 6-digit code or a recovery code such as
`ABCDE-FGHJK` (case, spaces, and hyphens are ignored). A used TOTP step cannot
be replayed. Wrong codes return 401 `INVALID_TWO_FACTOR_CODE`; an expired,
used, or exhausted challenge returns 401 `INVALID_TWO_FACTOR_CHALLENGE`.
Ten failures within 15 minutes lock the account's second step with 429
`TWO_FACTOR_LOCKED`. Routes are also limited per IP.

### Security settings

| Method | Path | Contract |
|---|---|---|
| GET | `/realm/account/security` | `email`, `hasPassword`, `googleLinked`, `twoFactor` status, `availableMethods` |
| POST | `/realm/account/reauthentication-code` | Accounts without a password: email a 6-digit confirmation code |
| POST | `/realm/account/two-factor/setup` | `{ "method", "phoneNumber"?, ...re-authentication }` |
| POST | `/realm/account/two-factor/enable` | `{ "code" }`; returns `{ "method", "recoveryCodes" }` once |
| POST | `/realm/account/two-factor/code` | Email/SMS methods: send a code for confirming changes |
| POST | `/realm/account/two-factor/recovery-codes` | Re-authentication; returns ten new codes and invalidates the old ones |
| POST | `/realm/account/two-factor/disable` | Re-authentication; removes the method, phone number, and recovery codes |
| POST | `/realm/account/sessions/revoke` | Sign out of all devices |
| GET | `/realm/account/export` | JSON export of the caller's data |
| DELETE | `/realm/account` | `{ ...re-authentication, "confirm": true }`; permanent deletion |

Re-authentication fields are `password` (required for accounts with a
password), `emailCode` (required instead for accounts without one, from
`/account/reauthentication-code`), and `code` (a two-step or recovery code,
required when two-step verification is on). Failures return 400
`PASSWORD_REQUIRED` / `EMAIL_CODE_REQUIRED` / `TWO_FACTOR_CODE_REQUIRED`, or
403 `REAUTHENTICATION_FAILED` / `INVALID_TWO_FACTOR_CODE`. Five failures in 15
minutes return 429 `REAUTHENTICATION_LOCKED`. Emailed confirmation codes expire
after 10 minutes, allow five attempts, and need SMTP (503 `MAIL_NOT_CONFIGURED`
otherwise); password accounts receive 400 `PASSWORD_REAUTHENTICATION`. Setup also requires
re-authentication and returns 409 `TWO_FACTOR_ENABLED` while a method is on.

`availableMethods` always contains `totp`; `email` appears when SMTP is
configured and `sms` when an SMS provider is configured. Unavailable methods
return 503 `TWO_FACTOR_METHOD_UNAVAILABLE`. TOTP setup returns `secret` (base32)
and an `otpauthUri` (SHA-1, 6 digits, 30 seconds) for a client-rendered QR
code. Email/SMS setup sends a code and returns `destinationHint`; delivery
failures return 502 `CODE_DELIVERY_FAILED`. `phoneNumber` must be E.164
(`+` and country code; spaces, dots, dashes, and brackets are removed) and is
only accepted for SMS. Wrong enrollment codes return 400; five wrong codes end
the setup. `twoFactor` contains `enabled`, `method`, `enabledAt`, `phoneHint`,
`recoveryCodesRemaining`, and `keyChanged` (the sealed secret can no longer be
read; see [configuration](configuration.md#two-step-verification-and-sms)).

Revoking sessions revokes every refresh token, rejects access tokens issued up
to that second, removes push subscriptions, and closes live streams.

The export is limited to three per account per hour (429 `ACCOUNT_RATE_LIMIT`).
It contains `account`, `preferences`, `security`, `profile` (with instruments,
genres, projects), own `announcements`, `comments`, `reactions`,
`savedAnnouncements`, `following`, `followerCount`, `blockedUserIds`,
`conversations` (counterpart and message counts), `sentMessages` (metadata, and
text only for legacy unencrypted messages you sent), public `messagingKeys`,
`notifications`, `reportsFiled`, `media` (addresses), `analytics`,
`entitlements`, `pushSubscriptions` (service origin only), and
`verificationRequests`, plus the feature sections of the export registry, such
as `eventsCreated`, `eventLineupEntries`, `eventAttendance`, `eventReminders`,
`eventPostsWritten`, `eventCommunicationsWritten`, and
`organizationVerificationRequests`. It never contains password or token hashes, recovery
code hashes, encrypted message ciphertext, encrypted key backups, received
message contents, other people's email addresses, or reports filed about you.

Deletion returns `{ "deleted": true, "confirmationEmailSent": boolean }` and
removes the account row; rows owned by it cascade. Collaborator entries naming
the account are removed from other people's projects and reaction counters on
other people's announcements are recomputed. See the
[usage guide](usage.md#delete-your-account) for shared records.

### Privacy and finding people

| Method | Path | Contract |
|---|---|---|
| GET / PUT | `/realm/account/privacy` | `{ "discoverableByEmail": boolean }`, default false |
| POST | `/realm/contacts/match` | `{ "hashes": ["<64 hex characters>", ...] }`, 1-500 items |

Clients hash `email.normalize('NFC').trim().toLowerCase()` with SHA-256 and send
only the hex digests. Matches include only active, discoverable accounts other
than the caller, excluding accounts blocked in either direction. The response
is `{ "musicians": [...] }` using the profile search summary shape plus
`verifiedAt`, without email addresses. Submitted hashes are not stored. Matching
is limited to 20 requests per account per hour and 30 per IP per 15 minutes.

### Verification

| Method | Path | Contract |
|---|---|---|
| GET | `/realm/verification/me` | `verifiedAt`, today's `challengeCode`, latest `request`, `retentionDays` |
| POST | `/realm/verification/requests` | `{ "challengeCode", "selfieMediaId"?, "documentMediaId"? }`, 201 |
| DELETE | `/realm/verification/requests/:requestId` | Cancel your pending request and delete its images |
| GET | `/realm/admin/verification-requests` | Admin queue; `status` (`pending` default, `approved`, `rejected`, `cancelled`, empty for all) and pagination |
| GET | `/realm/admin/verification-requests/:requestId/media/:mediaId` | Admin-only `image/webp`, `Cache-Control: private, no-store`; every read is audited |
| PATCH | `/realm/admin/verification-requests/:requestId` | `{ "decision": "approve" \| "reject", "note": "<5-2,000 characters>" }` |
| DELETE | `/realm/admin/users/:userId/verification` | Admin-only removal of the blue tick |

Upload evidence first with `POST /realm/media` and `purpose: "verification"`.
Images must belong to the caller and not be attached to another request; at
least one is required. The challenge code (`EM-` plus six characters) changes
every UTC day; today's and yesterday's codes are accepted (400
`VERIFICATION_CODE_EXPIRED` otherwise). One pending request per subject (409
`VERIFICATION_PENDING`), three submissions per day, and verified profiles return
409 `ALREADY_VERIFIED`. Requests use `subject_type`/`subject_id`; `user`
requests come from these routes and `organization` requests from
[page verification requests](#page-verification-requests).

Verification images are never public: `GET /realm/media/:id` serves them only
to the uploader, and administrators use the audited route above. Decisions
recheck the live admin role, return 409 `VERIFICATION_RESOLVED` when already
decided and 403 `SELF_REVIEW` for an administrator's own request, set
`profiles.verified_at` on approval, audit `verification_approved` /
`verification_rejected`, and notify the member (the note is shared with them).
Images are deleted `VERIFICATION_MEDIA_RETENTION_DAYS` after a decision, or
immediately on cancellation. Profile detail/search responses include
`verifiedAt`; announcement responses include `creatorVerifiedAt`.

Notification kinds `security_alert` (`params.event`: `two_factor_enabled`,
`two_factor_disabled`, `recovery_code_used`, `recovery_codes_regenerated`,
`sessions_revoked`), `verification_requested` (administrators), and
`verification_decided` (`params.decision`) are added. Live event types
`security.changed`, `privacy.changed`, and `verification.changed` target the
affected account.

| GET | `/realm/catalog/places?q=&limit=&country=` | City autocomplete: `q` (folded, at least 2 letters) matches the start of a name or Latin-script exonym such as "Milano"; `limit` 1-20 (default 8); optional ISO `country`. Returns `{ places }`, exact names first, then by population |
| GET | `/realm/catalog/places/:placeId` | One place |
| GET | `/realm/catalog/places/nearest?latitude=&longitude=` | The nearest known city (a more populous one when nearly as close); 404 `PLACE_NOT_FOUND` when none is near |
| GET | `/realm/catalog/countries` | `{ countries: [{ code, name }] }` present in the dataset |
| GET | `/realm/catalog/regions?country=` | `{ regions: [{ code, name }] }` for one country |

Catalog routes are public. Place lookups allow 120 requests per minute per
client. Places come from the GeoNames `cities15000` export with admin1 regions
and country names, licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); see
[development](development.md#places-dataset) for regeneration.
