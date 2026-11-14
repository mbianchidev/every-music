# Architecture

[Documentation index](README.md) | [API reference](api.md) | [Development](development.md)

## Components and request flow

Every.music is one Fastify API and one shared React client, not a collection of
independently deployed business microservices.

```text
Browser -> Vite (development) or nginx (Compose) -> Fastify /realm -> PostgreSQL
Tauri WebView ---------------------------------> absolute API URL -> PostgreSQL
Fastify -> SMTP (verification/reset mail)
Fastify -> Google identity verification (optional web sign-in)
Fastify -> Web Push services (optional, generic notification payloads)
PostgreSQL NOTIFY -> each API process -> authenticated fetch/SSE clients
```

Compose names the services `spectrum-web`, `realm-nexus`, and `realm-store`.
The API container runs tracked migrations before accepting traffic. A fresh
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
- `src/engines/`: token signing/hashing, SMTP, and Google identity integration.
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
not permanent local storage. Theme preference alone uses `localStorage`.

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

The UI includes discovery/filter/sort/page controls, profile/catalog/project
editors, full detail and announcement editing/comment/reaction actions,
messaging, notification preferences, and opt-in reach analytics.
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
text leaves a visible tombstone. Data is access-controlled, not end-to-end
encrypted. Hosts must protect the database and backups.

Managed image uploads are decoded by Sharp, constrained by bytes/pixels/frame
count, stripped of metadata, and encoded as bounded WebP. Bytes live in
PostgreSQL, with owner/purpose checks when attached to a profile/announcement.
Private or unattached images require uploader authentication. Published images
can be cached by browsers; removing a reference does not recall copies already
downloaded.

Small PostgreSQL notifications are emitted through the transaction executor,
so clients only see committed changes. Each API process holds one dedicated
LISTEN connection and fans out public or user-targeted SSE invalidations.
Events contain identifiers/types, never message text or tokens. Backpressure,
per-process connection caps, expiration and shutdown close streams cleanly.
Reconnect reloads authoritative HTTP state; there is no event-history promise.

Notification records and user preferences are persisted with their triggering
mutations. Workers atomically lease pending push rows using `SKIP LOCKED` and
retry up to three times. Browser endpoints/keys are validated and restricted
to supported push providers. Payloads are generic; gone subscriptions are
deleted. Notifications created while push is off are not replayed on opt-in.
Hourly maintenance removes expired challenges, unreferenced media after a day,
notifications after 90 days, and aggregates outside the 30-day reporting window.

Analytics requires both actor and content owner opt-in and excludes self-views.
Only daily resource/kind counts are retained, not actor identity or message
content. Message counts are not linked to conversations. Preference row locks
serialize consent changes with collection; opt-out clears the owner's daily
report totals, not public announcement counters or functional interactions.
Operational request logs remain separate from analytics.

## Operational boundaries and extension points

`/health/live` reports process liveness; `/health/ready` checks PostgreSQL and
returns 503 when unavailable. `/pulse` is the readiness compatibility alias.
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
