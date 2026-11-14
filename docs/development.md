# Development

[Documentation index](README.md) | [Architecture](architecture.md) | [Configuration](configuration.md) | [Contributing](../CONTRIBUTING.md)

## Prerequisites

- Node.js 26.12.1 and npm recommended (22.12+ minimum)
- PostgreSQL 16
- Rust stable and platform SDKs for Tauri changes
- A Docker engine with Compose v2 for container validation

CI and both Docker builds pin Node.js 26.12.1, the current stable release.
The package manifests retain Node.js 22.12.0 as the minimum rather than requiring
the newer runtime. React and React DOM are already on the latest stable 19.3.1
release. This repository does not use Next.js, Go, or Python. Android's separate
Java/Gradle compatibility limits are documented in [mobile setup](mobile.md#android).

Use only synthetic data and an isolated development database.
Do not use a production connection string for bootstrap, migrations, or smoke
tests. Keep actual `.env` files untracked.

## Backend

From the repository root, copy `backend/.env.example` to `backend/.env`.
Create an empty PostgreSQL database and set `REALM_CONNECTION` to its URL.
The role must be able to create tables and the `uuid-ossp` and `pg_trgm` extensions.
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

### Community API, migration, and browser tests

Use a dedicated PostgreSQL instance/database containing **only synthetic
fixtures**. Do not point these commands at a shared deployment. Export
`REALM_ENV=test`, `REALM_CONNECTION`, and two distinct test signing keys before
running them. Bootstrap/migrate the empty test database using the commands
above. Dependencies must be installed in both packages.

```bash
(cd backend && GOOGLE_IDENTITY_KEY=synthetic.apps.googleusercontent.com npm run test:integration)
(cd backend && MIGRATION_BASE_REF=origin/master npm run test:migrations)
(cd frontend && npx --no-install playwright install chromium)
(cd frontend && npm run test:e2e)
```

`test:integration` exercises real Fastify authentication, PostgreSQL
transactions, relation edits, case-normalized identifiers, visibility,
concurrent reactions, media decoding/ownership, conversation retries/blocking,
notification preferences, analytics consent, live HTTP streams, and push job
retry/cleanup. Google credential verification and outbound push transport are
narrow synthetic provider stubs; no real account, SMTP delivery, or push
provider is contacted.

`test:migrations` needs a role with `CREATEDB` on that isolated instance and a
local Git ref for the previous schema. It creates two uniquely named temporary
databases, runs the actual migration runner against fresh/prior schemas,
replays migrations 003/004, compares columns/indexes/constraints, checks legacy
projects/messages/tombstones, member-role and consent defaults, then drops only
the databases it created.
CI fetches both merge parents and uses `HEAD^1` as the base.

`test:e2e` starts its own API on 55474 and a production Vite preview on 4179;
those ports must be free. It seeds/cleans synthetic accounts, uses the actual
API/database, and checks two-user messaging, publishing/editing images,
project editing/removal and roles, catalog selection/removal, date filters/pages,
bookmarks/comments/reactions, notifications, analytics,
offline shell/feed, failed-edit recovery, account-bound cache cleanup,
system/light/dark preferences, keyboard focus, 320px reflow, modal navigation
wraparound/Escape/resize, and axe checks. Google signup, existing-account deep
links, and pending-request account isolation use the real app/API/database with
only the external Google SDK and credential verification replaced by synthetic
provider fixtures. Install/share browser adapters are also controlled so tests
do not install software or change the host clipboard.
Messaging journeys generate real client keys, send actual signed/encrypted
envelopes, lock/reject wrong recovery keys, unlock after reload, reset identities
and reverify older history in a fresh browser context while retaining drafts,
read state and focus.
The Google account journey also restores a genuine earlier first-party session
in a second isolated context, submits selected signed report evidence, grants
the other actor admin using the real operator CLI, and verifies report removal,
suspension, audit entries and aggregate analytics. It does not weaken auth limits.
Do not treat its browser checks as a native screen-reader certification.
On Linux, use `playwright install --with-deps chromium` when system browser
libraries are missing. Failure traces/screenshots are in ignored
`frontend/test-results/`. Browser tests use an elevated global request budget
to isolate fixtures from the shared-IP rate limit; authentication limits remain.
Do not run `npm run check` / `npm run compile` in the same frontend checkout
while browser tests run: both builds replace `dist`, and the browser build
embeds its isolated API origin. Backend checks can run independently.
The Google browser server is a loopback-only integration entrypoint requiring
`REALM_ENV=test`, an explicit database URL, and the synthetic client ID. It is
not the production server and must never be exposed as one.

Live Google consent/sign-in and browser push subscription/delivery still require
configured provider credentials, HTTPS/browser permission, and target-platform
checks. They cannot be established by synthetic provider stubs. The PWA is
emitted by production builds, not the development server.

### Dependency install policy

The backend overrides the deprecated transitive `node-domexception` package with
`@profoundlogic/node-domexception@1.0.2`, a dependency-free export of the native
`DOMException` provided by supported Node.js versions. This keeps the Google
authentication HTTP stack unchanged. Transport tests check constructor identity
and file-backed blob errors. Remove the override when upstream no longer needs
the deprecated shim, then rerun locked installs and backend verification.

For npm 11, the frontend's `allowScripts` approves only the reviewed
`fsevents@2.3.3` macOS optional dependency. The approval is version-pinned, not a
blanket permission for dependency scripts. After upgrading it, review the new
package and run `(cd frontend && npm install-scripts approve fsevents)` on macOS
with an npm version supporting this command, then commit the updated approval.
Older npm versions ignore this field and retain their existing install behavior.

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

The PostgreSQL job additionally verifies fresh/upgrade migration convergence,
community API contracts, and the production browser journeys. It installs
Chromium and uploads failure evidence. These checks do not publish installers,
federated records, or provider notifications.
The container job also runs the packaged image optimizer on Alpine and checks
the nginx configuration, not only Dockerfile builds.

## Integration smoke test

With the local API running against the same isolated database:

```bash
cd backend
npm run smoke
```

`REALM_CONNECTION` is used for setup/cleanup, and `SMOKE_BASE_URL` defaults to
`http://127.0.0.1:8080`. The test registers a synthetic `example.test` account,
marks that test email verified directly in the database, exercises session
rotation, image optimization, announcements/bookmarks, an authenticated live
stream, and logout, then deletes its own user in `finally`.
It does not send a real verification email or validate SMTP delivery.

To exercise the nginx path, set `SMOKE_BASE_URL` to the web origin and
`SMOKE_READINESS_URL` to the isolated API's absolute `/health/ready` URL;
nginx deliberately exposes `/healthz`, not the API's root health routes.

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

Migration `003_community.sql` adds the community tables and project collaborator
column, plus `pg_trgm` and search indexes. Index creation runs inside the existing
transactional migration model, not `CONCURRENTLY`; plan an appropriate migration
window for large installations. It is additive, preserves existing records and
sessions, and defaults analytics/push off. Application rollback can leave these
extra tables/columns in place; do not drop messages or media as an automatic
rollback. Use a reviewed forward fix or deliberately restore a verified backup.

Migration `004_admin_and_encryption.sql` adds roles, key backups, ciphertext
fields, reports/audit records and separately consented platform aggregates.
Legacy plaintext is retained and labelled; deleted tombstones are cleared.
New plaintext message sends are rejected. Keep key rows and encrypted backups:
after encrypted writes, dropping these fields is not a safe rollback.
See the [messaging security guide](messaging-security.md) for recovery, trust,
retention, provisioning and cryptographic limitations.

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
