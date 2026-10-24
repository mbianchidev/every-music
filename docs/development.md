# Development

[Documentation index](README.md) | [Architecture](architecture.md) | [Configuration](configuration.md) | [Contributing](../CONTRIBUTING.md)

## Prerequisites

- Node.js 22.12+ and npm (CI uses Node 22)
- PostgreSQL 16
- Rust stable and platform SDKs for Tauri changes
- A Docker engine with Compose v2 for container validation

Use only synthetic data and an isolated development database.
Do not use a production connection string for bootstrap, migrations, or smoke
tests. Keep actual `.env` files untracked.

## Backend

From the repository root, copy `backend/.env.example` to `backend/.env`.
Create an empty PostgreSQL database and set `REALM_CONNECTION` to its URL.
The role must be able to create tables and the `uuid-ossp` extension.
Generate a different value for each signing key:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Set working SMTP values and put `http://localhost:3000` first in
`PORTAL_ORIGINS` for normal browser development. Incomplete SMTP is allowed
outside production, but accounts cannot sign in until their email is verified.
Remove optional Google placeholder values unless testing that API integration.
See [configuration](configuration.md) for all names, defaults, and scopes.

Initialize and run, from the repository root:

```bash
cd backend
npm ci
npm run bootstrap
npm run migrate
npm run watch
```

`bootstrap` is for a new development database only: it creates tables and seeds
catalogs, not users. `migrate` is safe to run repeatedly and is the path for
existing databases. The API uses port 8080 by default.

## Frontend

```bash
cd frontend
npm ci
npm run dev
```

Run frontend commands in a second terminal, starting at the repository root.
Open <http://localhost:3000>. Vite proxies `/realm` and `/pulse` to port 8080;
query `/health/live` and `/health/ready` on the API directly.

Set a different API origin when needed:

```bash
VITE_API_BASE_URL=http://localhost:8080/realm npm run dev
```

## Verification

After installing dependencies, run from the repository root:

```bash
(cd backend && npm run verify)
(cd frontend && npm run check)
node --test scripts/test/release.test.mjs
(cd backend && npm audit --omit=dev --audit-level=high)
(cd frontend && npm audit --omit=dev --audit-level=high)
```

Backend verification includes syntax checks and the Node test runner. Frontend
checks run tests and the Vite production build. Tests cover native-fetch receiver
binding, typed API failures, session persistence, network preservation, and
single-flight refresh. Release tests cover safe API URLs and fresh/nonempty
installers. There is no separate formatter/linter configured.

For native changes, also run `cargo check --locked` from
`frontend/src-tauri`. Linux needs the optimized
[GLib regression](mobile.md#linux-glib-backport). Packaging uses the
[release entrypoint](releases.md), which verifies installers and checksums.

For UI changes, use a browser with the actual client and isolated API/database.
Check sign-in, profile editing, posting/deletion, saving/removing, reload,
expired-session behavior, and offline recovery. Use synthetic accounts and
follow the [manual accessibility checklist](../ACCESSIBILITY.md).
Mocked API screenshots must be labelled; they do not prove the live stack works.

## CI execution

Backend, frontend, PostgreSQL integration, container, and Tauri checks start
independently: each job checks out and prepares its own inputs, with no build
artifacts passed between them. This removes unnecessary prerequisite waits
without skipping checks or changing their names, commands, or triggers. It can
use more runner time on a failing revision because integration, container, and
Tauri checks no longer wait for the unit checks to pass. Desktop packaging still
waits for both frontend and Tauri checks and retains all three release platforms.

CodeQL still scans Actions, JavaScript/TypeScript, and Rust on every configured
event. A newer run for the same pull request cancels its obsolete scan; push and
scheduled runs have separate concurrency groups per run and are not canceled by
PR updates. The analysis matrix stops remaining languages if one fails, leaving
the workflow failed rather than reporting partial analysis as success. The
desktop packaging matrix still collects results for every platform on failure.

## Integration smoke test

With the local API running against the same isolated database:

```bash
cd backend
npm run smoke
```

`REALM_CONNECTION` is used for setup/cleanup, and `SMOKE_BASE_URL` defaults to
`http://127.0.0.1:8080`. The test registers a synthetic `example.test` account,
marks that test email verified directly in the database, exercises session
rotation/announcements/bookmarks/logout, and deletes its own user in `finally`.
It does not send a real verification email or validate SMTP delivery.

## Debugging

Use the browser Network and Console panels to inspect request paths, status
codes, and typed API errors. Do not paste tokens or personal data into issues.
The API uses readable development logs and structured JSON in production.
Start with readiness, database/migration logs, SMTP configuration, and the first
`PORTAL_ORIGINS` entry; see [troubleshooting](usage.md#troubleshooting).
See [architecture](architecture.md) for where each request/state transition lives.

## Database changes

1. Update `backend/database/schema.sql` for new installations.
2. Add an ordered, idempotent migration under `backend/database/migrations/`.
3. Run the migration against both a fresh database and a database created from the previous schema.
4. Add integration coverage when behavior spans SQL and HTTP.

Migration `001_hash_auth_tokens.sql` invalidates existing refresh sessions and outstanding email/reset links because legacy plaintext token records cannot be safely converted.

## Coding conventions

- Keep HTTP envelopes consistent: `{ "success": true, "data": ... }` or `{ "success": false, "error": ... }`.
- Use repository executors supplied by `realmConnector.transaction`; calling the global pool from inside a transaction is not atomic.
- Treat `undefined` relation fields as “leave unchanged” and empty arrays as “clear all”.
- Surface recoverable UI errors and provide retry actions. Do not turn request failures into empty states.
- Prefer native HTML semantics before ARIA.

## Documentation and releases

Keep [usage](usage.md), [configuration](configuration.md), and [API contracts](api.md)
aligned with changes. Follow [releases](releases.md) for packaging and
[AGENTS.md](../AGENTS.md) for repository-specific agent constraints.
