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
`instrumentId`, `genreId`, and `sort` (`newest`, `oldest`, `name`, `city`).
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
`isSaved`. Detail retrieval itself does not record analytics.

Announcement search accepts profile search's keyword/location/catalog filters,
`isRemote` / `isCoverBand` (`true` or `false`), and `sort`
(`newest`, `oldest`, `title`, `city`, `popular`). `popular` sorts by likes.
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

Send `{ "body": "<1-4000 nonblank characters>", "clientId": "<new uuid>" }`.
Keep the same client ID for a retry of the same text/conversation: the existing
message is returned and no duplicate notification is created. Reusing the ID
with different content returns 409 `MESSAGE_CONFLICT`. Message results expose
`id`, `senderId`, `body`, `isDeleted`, `createdAt`; lists also include
`conversation` with `recipientId`, `recipientName`, and `blockedByMe`.
Conversation summaries include `lastMessage`, `unreadCount`, `archived`,
and `updatedAt`, never email addresses.

PATCH accepts any of `{ "read": true, "archived": true, "blocked": true }`;
archive/block also accept false. Reading marks corresponding message
notifications read. Removing a message does not remove its timestamp or
conversation. These are access-controlled server messages, not E2E encryption.

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
`title`, `link`, `readAt`, and `createdAt`. Preferences are `messages`,
`announcements`, `engagements` (default true), `profileViews`, `push`, and
`analytics` (default false). Announcement alerts are for followed musicians.
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

## Live events

GET `/realm/events` with a Bearer access token returns an SSE
`text/event-stream`, not a JSON envelope. Use streaming `fetch` so tokens stay
out of URLs. Frames are `data: {"type":"messages.changed","id":"<uuid>",...}`
separated by blank lines, with heartbeat comments every 15 seconds. The
initial `connected` event tells clients to reload current data.

Types include `profiles.changed`, `announcements.changed`, `comments.changed`,
`messages.changed`, `conversations.changed`, `saved.changed`,
`notifications.changed`, and `preferences.changed`. Public content
invalidations are shared; private types target only the affected user.
Payloads never contain message bodies or credentials. Read current state
from the corresponding authenticated APIs; events are not a durable log.
Streams close at token expiry, on listener failure, slow-client backpressure,
or server shutdown. Reconnect with backoff and refresh on 401. Limits are
three streams per user within each API process, and 1,000 total per process
(429 on exhaustion).

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
