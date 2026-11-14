# Architecture

[Documentation index](README.md) | [API reference](api.md) | [Development](development.md)

## Components and request flow

Every.music is one Fastify API and one shared React client, not a collection of
independently deployed business microservices.

```text
Browser -> Vite (development) or nginx (Compose) -> Fastify /realm -> PostgreSQL
Tauri WebView ---------------------------------> absolute API URL -> PostgreSQL
Fastify -> SMTP (verification/reset mail)
Fastify -> SMTP (opt-in notification email outbox, idle without SMTP)
Fastify -> Google identity verification (optional web sign-in)
Fastify -> Web Push services (optional, generic notification payloads)
Fastify -> SMS provider, Twilio adapter (optional two-step codes)
Fastify -> FCM / APNs (optional native mobile push, generic payloads)
Fastify -> S3-compatible object storage (optional media bytes, private bucket)
PostgreSQL NOTIFY -> each API process -> authenticated fetch/SSE clients
```

Compose names the services `spectrum-web`, `realm-nexus`, and `realm-store`,
plus the optional SeaweedFS `object-store` in the `object-storage` profile.
The API container runs tracked migrations before accepting traffic; an advisory
lock makes replicas that start together apply each migration once. A fresh
PostgreSQL volume is initialized with the schema and instrument/genre catalogs.
The volume `everymusic-realm-volume` is persistent and is not removed by a
normal `docker compose down`.

## Backend boundaries

- `src/nexus.js`: validate configuration, connect dependencies, listen, and shut down.
- `src/app.js`: Fastify construction, errors, CORS, rate limits, security headers,
  health probes, and route registration.
- `src/orchestrators/`: route wiring and authentication guards.
- `src/conductors/`: input validation, authorization decisions, workflows, and
  HTTP response transformations.
- `src/repositories/`: PostgreSQL queries and transaction execution.
- `src/engines/`: token signing/hashing, SMTP, Google identity integration,
  media storage drivers (`media-storage.js`), media access registries
  (`media-references.js`), and push providers (`push-dispatcher.js`, `native-push.js`).
- `src/validators/`: shared input and pagination validation.

Database work that must be atomic uses `realmConnector.transaction` and its
supplied executor throughout. Calling the global pool inside the callback
escapes that transaction. Account/profile creation and multi-table announcement
updates follow this rule.

For relation updates, omitted fields preserve existing values and empty arrays
clear them. Keep fresh-install `database/schema.sql` and ordered migrations in
sync. A migration is recorded in `schema_migrations` only after its transaction
commits.

## Client state and navigation

`frontend/src/main.jsx` maps hash routes to screens and guards authenticated
screens before mounting them. Unauthorized screens do not start private
resource requests while the sign-in redirect preserves the intended deep link.
One shared shell owns desktop/sidebar and mobile/bottom navigation, theme,
connection status, installation, and the live-update connection.
Screens use shared components and `lib/conduit.js` for API requests.
`lib/nucleus.js` stores the current persona and tokens in `sessionStorage`,
not permanent local storage. `localStorage` holds only preferences and
device records: theme, language, verified messaging fingerprints, the tour
completion fallback, and the dismissed update notice. The Cookie policy page
lists every key; the app sets no cookies of its own.

The default fetch transport is bound to the browser global receiver. Tests can
inject a custom transport. Requests time out after 12 seconds and produce typed
`ApiError` objects. An authenticated 401 triggers one shared refresh across
concurrent requests; the original request is retried once. Confirmed refresh
authentication failures clear the session, while network failures preserve it.
Screens display recoverable errors rather than treating failed requests as
empty data.

Resource hooks key both retained data and requests by account and path, abort
outdated reads, and reload invalidated data without replacing form drafts.
Changing accounts clears old private data immediately, even while the next
account's request is pending. Session changes also invalidate in-flight authenticated
results and refresh responses, preventing one account's late response from
overwriting the next account. Route changes move focus to main content at the
React commit, not a delayed frame that could interrupt a newly focused input;
background refreshes do not steal focus.

`components/ShellGate.jsx` wraps every routed screen. It checks
`/realm/app/version` against the build version injected from
`frontend/package.json` (blocking screen below the minimum, dismissible notice
below the latest), shows the terms acceptance prompt for signed-in accounts
whose accepted version differs from `TERMS_VERSION`, and mounts the welcome tour
(`components/ProductTour.jsx`), a native modal dialog that spotlights sidebar or
mobile navigation targets. Help and legal routes stay reachable through both
gates. `components/BackButton.jsx` uses the Navigation API to go back only to
an earlier in-app entry, otherwise to a parent route. A footer with help and
legal links follows every screen.

The UI includes discovery/filter/sort/page controls, profile/catalog/project
editors, full detail and announcement editing/comment/reaction actions,
messaging, notification preferences, and opt-in reach analytics.
Admin routes use the live database role and recheck it under a row lock within
moderation transactions. Operator-only role provisioning, report-only access,
audited decisions, and separate platform consent are detailed in
[messaging security and administration](messaging-security.md).
See [usage](usage.md) for user workflows.

The production web build emits a manifest and versioned service worker. It
precaches only the app shell and known build assets, never `/realm` or other
API responses. A separate account-bound `sessionStorage` entry keeps only the
last exact feed query for 24 hours. Offline feed reads are labelled; private
APIs fail visibly, mutations are not queued, and failed forms keep their input.
Signing out clears the cached feed and browser push subscription. Native shells
skip service-worker registration.

## Authentication and external services

Email accounts require verification before sign-in. Verification links expire
after 24 hours and reset links after one hour. SMTP failure does not roll back
registration, so users can resend verification after delivery is restored.

Access tokens default to 30 minutes and refresh sessions to 30 days. Stored
refresh, verification, and reset tokens are hashed, while signing keys remain
runtime secrets. Refresh tokens rotate on use, with a deterministic grace window
for retrying a lost response. Later reuse revokes account sessions; password reset
also revokes refresh sessions.

`PORTAL_ORIGINS` controls CORS; its first entry also supplies the base for
verification and reset links. The optional web Google button uses the official
Identity Services SDK and a five-minute, single-use, hashed nonce. An unused
challenge can be reused in page memory for at most four minutes across sign-in
and registration navigation; a sign-in attempt or explicit retry clears it.
The API
verifies Google's signature/audience/expiry/email and signed nonce before
creating the application session. Google credentials are not persisted.
Matching email alone never links a password account. Google users may use
verified password recovery to add password sign-in without losing Google login,
including for native clients where embedded Google sign-in is disabled.

## Account trust

Two-step verification sits between the first factor and session issuance:
password and Google sign-in call `two-factor-delivery.js` before creating
tokens, and only `/auth/two-factor/verify` issues the session, inside the same
transaction that consumes the hashed challenge. Re-authentication for
sensitive changes commits failed attempts before returning the error so
attempt limits hold. `users.sessions_revoked_at` lets the identity guard reject
access tokens issued before "sign out of all devices"; refresh tokens are
revoked in the same transaction. TOTP secrets and SMS numbers are sealed by
`secret-box.js`; SMS goes through the provider interface in `sms-gateway.js`.
Per-account throttles use `account_rate_events`, so they hold across processes.

Account deletion deletes the `users` row and relies on cascades for owned
records, after removing the account from other projects' collaborator lists
and before recomputing reaction counters. The export runs in one repeatable-read
transaction. Contact discovery stores an email hash only for opted-in accounts
and never stores submitted hashes. Verification requests are keyed by
`subject_type`/`subject_id`; their images use the private `verification` media
purpose, are served to administrators only through an audited route, survive
the unreferenced-media cleanup while referenced, and are purged by the hourly
maintenance after the retention period. See `docs/api.md` for contracts.

## Community persistence and delivery

Migration `003_community.sql` is additive and idempotent. It adds media,
conversations/membership, messages, block lists, comments, preferences,
notifications, push subscriptions, Google challenges, daily analytics, and
structured project collaborator data. Trigram indexes support keyword/city
search and indexed relation lookups; ID tie-breakers stabilize live pages.
New installs and prior schemas converge through the same migrations.

Messages belong to a canonical pair of users. Every read/write verifies
membership; either party's block prevents sends. A per-sender client UUID makes
retries idempotent. Per-member read/archive state is independent, and deleting
text leaves a visible tombstone. New messages contain only a signed/encrypted
JOSE envelope plus routing metadata. Client Web Crypto keys/recovery secrets
never arrive unencrypted; encrypted key backups support other devices.
Legacy version-0 history stays labelled and server-readable, not silently
reclassified as E2EE. Reported excerpts are deliberately disclosed and
sender-verified; admin status never bypasses conversation membership.

Migration `004_admin_and_encryption.sql` adds live account roles, messaging
identities, versioned ciphertext fields, reports/audit metadata and separate
platform aggregates. It preserves plaintext legacy history, clears old deleted
tombstones and defaults all accounts to member/platform consent off. There is
no safe downgrade to plaintext once encrypted messages exist: keep the key
tables/backups and use a reviewed forward fix rather than dropping columns.

Managed image uploads are decoded by Sharp, constrained by bytes/pixels/frame
count, stripped of metadata, and encoded as bounded WebP. Encrypted attachment
blobs are stored as opaque bytes. Each `media` row records its purpose, MIME
type, and size, and holds either the bytes (`MEDIA_STORAGE=postgres`) or the key
of an object in a private S3-compatible bucket (`MEDIA_STORAGE=s3`). Every read
goes through `/realm/media/:id`: owners always pass, other viewers need a
`publicMediaReferences` match (never for attachments) or an
`authorizedMediaReferences` match for that viewer. Owner/purpose checks apply when
media is attached to content. Published images can be cached by browsers;
removing a reference does not recall copies already downloaded.

A database trigger queues the object key whenever an object-stored row is
deleted, including account-deletion cascades. The background worker removes
queued objects with leased, retried jobs, so PostgreSQL stays the source of truth
and no transaction waits on object storage.

Small PostgreSQL notifications are emitted through the transaction executor,
so clients only see committed changes. Each API process holds one dedicated
LISTEN connection and fans out public or user-targeted SSE invalidations.
Events contain identifiers/types, never message text or tokens. Backpressure,
per-process connection caps, expiration and shutdown close streams cleanly.
Reconnect reloads authoritative HTTP state; there is no event-history promise.

Notification records and user preferences are persisted with their triggering
mutations. Workers atomically lease pending push rows using `SKIP LOCKED` and
retry up to three times. Each job is delivered to the user's browsers (Web Push)
and registered mobile devices (FCM for Android, APNs for iOS). Browser
endpoints/keys are validated and restricted to supported push providers. Payloads are generic; gone subscriptions are
deleted. Notifications created while push is off are not replayed on opt-in.
Hourly maintenance removes expired challenges, unreferenced media after a day
(media matching `retainedMediaReferences` or `publicMediaReferences` is kept),
notifications after 90 days, and aggregates outside the 30-day reporting window.
A separate help job (`engines/help-jobs.js`) deletes answered/closed support
requests 365 days after their last update. On listen it records `APP_VERSION`
in `app_releases` under a transaction advisory lock and fans out a single
`app_update_major` or `app_update_minor` notification per active account when
the major or minor number increases.

Migration `010_help_onboarding.sql` adds `support_requests`,
`terms_acceptances` (one row per accepted version), `user_onboarding` (tour
status), `app_releases`, and `app_ratings` (unique per account and version, with
`rewarded_at` for a later rewards worker). Support requests, acceptances,
onboarding, and ratings are removed with their account row.

Per-kind channel choices live in `notification_channel_preferences`; a missing
row or `NULL` column means the catalog default. `notificationRepository` decides
in-app, push, and email delivery in one insert, so every feature that creates
notifications honors them. Email uses an outbox on the notification row, drained
by `NotificationEmailWorker` with `SKIP LOCKED` leases and up to three attempts
through the shared SMTP transport. `NotificationScheduler` creates weekly
statistics digests, come-back reminders and invite nudges; a lease row in
`notification_job_runs` keeps each job to one API process per interval, and
event keys make reruns idempotent. Both start and stop with the other
background jobs (`NotificationJobs`).

Announcement applications (migration `011_announcement_applications.sql`)
live in `application-orchestrator.js`, `application-repository.js`, and the
`application-rules.js` engine. Replies are plaintext by design and visible to
the owner only. Their own hourly `ApplicationMaintenance` job records when a
call closes, clears that mark when it reopens, and deletes applications after
the configured retention period.

Analytics requires both actor and content owner opt-in and excludes self-views.
Only daily resource/kind counts are retained, not actor identity or message
content. Message counts are not linked to conversations. Preference row locks
serialize consent changes with collection; opt-out clears the owner's daily
report totals, not public announcement counters or functional interactions.
Operational request logs remain separate from analytics.
Platform totals use a separate collection requiring both parties' additional
platform consent; existing personal totals are never retroactively exposed.
Reported content expires 90 days after review, audit metadata after 365 days.

## Marketplace persistence and jobs

Migration `013_marketplace.sql` adds marketplace listings, ordered listing
photos (references to managed `listing` media), instrument/genre tags, saved
listings, and an optional `listing_id` on user reports. The category catalog
is defined in `backend/src/engines/marketplace-catalog.js` and served to
clients, which localize its keys. Prices are integer minor units plus an ISO
4217 code; locations are plain text and coordinate columns. Listing reports
reuse the user report queue, while moderation removal is a soft delete that
keeps the row for the owner and administrators. Each API process runs an hourly
job that leases expiring listings with `SKIP LOCKED`, creates one
`listing_expiring` notification per expiry date, and purges listings expired
or removed more than a year ago. Media maintenance keeps attached listing
photos. Payments are not processed; contact uses encrypted messaging.

## Places, discovery and plan limits

Migration `008_profiles_ads_discovery.sql` adds a `places` table loaded from a
committed GeoNames seed by the migration runner (`scripts/places-dataset.js`).
Profiles and announcements reference a place and copy its city, region,
country and coordinates, so legacy free-text cities keep working. Distance
search is portable SQL: a bounding box on the indexed latitude/longitude
columns (split at the antimeridian) followed by a haversine check
(`engines/geo.js`). Browser coordinates for "near me" are request-only.

Freemium caps are enforced in the writing transaction under the user's row
lock (`repositories/quota-repository.js`) with limits from
`entitlementRepository`. Saved searches are matched inside the transaction
that publishes an announcement, so notifications commit atomically with the
publication; JSON filters are evaluated in SQL and fan out through
`notificationRepository.createMany` with per-announcement keys. Blocks
(`blocked_users`) are excluded in both directions from search, saved-search
matching, follows and contact visibility. Profile visits are written only
with the visitor's consent and expire after 30 days.

## Operational boundaries and extension points

`/health/live` reports process liveness; `/health/ready` checks PostgreSQL (and
the media bucket when `MEDIA_STORAGE=s3`) and returns 503 when unavailable. `/pulse` is the readiness compatibility alias.
Readiness does not validate SMTP or complete user workflows.

Production logs go to stdout/stderr as structured JSON. See
[operations](deployment.md) for monitoring, backups, and upgrades.
To add a feature, extend the relevant route/conductor/repository and tests,
then wire the client screen/navigation if it is intended to be user-accessible.
Update the [API reference](api.md), [configuration](configuration.md), and
[usage guide](usage.md) when their contracts change.

Tauri packages the shared web build; it does not package PostgreSQL or Fastify.
Native API URLs are public build-time configuration. See
[native requirements](mobile.md) and [release verification](releases.md).
