# Architecture

[Documentation index](README.md) | [API reference](api.md) | [Development](development.md)

## Components and request flow

Every.music is one Fastify API and one shared React client, not a collection of
independently deployed business microservices.

```text
Browser -> Vite (development) or nginx (Compose) -> Fastify /realm -> PostgreSQL
Tauri WebView ---------------------------------> absolute API URL -> PostgreSQL
Fastify -> SMTP (verification/reset mail)
Fastify -> Google identity verification (optional API endpoint)
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
screens. Screens use shared components and `lib/conduit.js` for API requests.
`lib/nucleus.js` stores the current persona and tokens in `sessionStorage`,
not a persistent offline cache.

The default fetch transport is bound to the browser global receiver. Tests can
inject a custom transport. Requests time out after 12 seconds and produce typed
`ApiError` objects. An authenticated 401 triggers one shared refresh across
concurrent requests; the original request is retried once. Confirmed refresh
authentication failures clear the session, while network failures preserve it.
Screens display recoverable errors rather than treating failed requests as
empty data.

The UI covers email accounts, basic profile editing, feed/publishing/deletion,
and saved calls. More detailed profile/search/catalog/reaction/project operations
exist in the API without corresponding screens. See [current limitations](../README.md#current-limitations).

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
verification and reset links. The optional Google endpoint verifies an ID token,
but no Google sign-in button is implemented in the client.

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
