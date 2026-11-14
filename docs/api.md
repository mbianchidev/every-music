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

Profile detail accepts either a profile ID or the legacy user-ID identifier.
It returns identity/location/bio/image/contacts, instruments, genres, projects,
and `isFollowing` for an authenticated viewer. Inactive/deleted users are not
searchable. Project objects retain the existing SQL-style field names.

Search accepts `searchTerm` (up to 200 characters), `city` (up to 255),
`instrumentId`, `genreId`, `createdWithin` (`week` or `month`), and `sort`
(`newest`, `oldest`, `name`, `city`). `createdWithin` filters `created_at`
over the rolling past 7 or 30 days; omitted/empty means any time. Other values
return 400. Search summaries include selected `instruments` and `genres`
using the same identifiers/names as profile detail.
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
(`newest`, `oldest`, `title`, `city`, `popular`). The shared `createdWithin`
filter uses the announcement's creation date. `popular` sorts by likes.
Optional `pictureUrl` uses a managed media URL or a legacy HTTP/S URL.
`isPublished: false` saves a private draft.

For relation fields on update:

- omitted field: preserve current values
- empty array: clear all values
- populated array: replace the set

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
`other`), `details` (5-2,000 characters), and `consent: true`. Optional `messageId`
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

## Analytics

POST `/realm/analytics/events` with `{ "kind": "profile_view" |
"announcement_view", "resourceId": "<visible resource uuid>" }`.
The authenticated actor and resource owner must both have `analytics: true`;
self-views are not counted. 200 returns `{ "recorded": true | false }`.
Successful likes, new bookmarks, and received messages also contribute
consented aggregates. The API does not accept arbitrary metric kinds/owners.

GET `/realm/analytics` returns only the caller's `daily` aggregate rows
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
`keys.changed`, `reports.changed`, `admin.changed`, and `account.changed`. Public content
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
