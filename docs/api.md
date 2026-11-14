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
| GET | `/health/ready` | PostgreSQL readiness |
| GET | `/pulse` | Readiness compatibility alias |
| GET | `/nexus-info` | Version and environment |

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

Refresh:

```json
{
  "refreshToken": "<refresh-token>"
}
```

Logout accepts the same body. Password reset revokes all active refresh sessions.

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
filter uses the announcement's creation date. `popular` sorts by likes;
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
detail adds `statsLocked`. The `popular` sort still ranks by likes. Detail and
summaries include `place`, `expiresAt` and (for distance searches)
`distanceKm`. A call whose owner blocked the viewer returns 404 for detail,
save, reaction and comment routes.

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

## Pagination

Profile/announcement search, own/saved announcements, conversations, messages,
comments, and notifications accept positive integer `page` and `pageSize`.
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

GET `/realm/media/:mediaId` returns `image/webp`, not a JSON envelope. A media
item is public only while attached to an active profile or visible announcement.
The uploader can fetch private/unattached items with Bearer authentication;
unauthorized or missing items return 404. Unreferenced uploads are cleaned up
after a day. Uploaded bytes are stored in PostgreSQL and included in backups.

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

Types include `profiles.changed`, `announcements.changed`, `comments.changed`,
`messages.changed`, `conversations.changed`, `saved.changed`,
`notifications.changed`, `preferences.changed`, `analytics.changed`,
`keys.changed`, `reports.changed`, `admin.changed`, `blocks.changed`,
`saved-searches.changed`, and `account.changed`. Public content
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
