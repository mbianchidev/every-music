# Every.music

Every.music is a self-hosted application for musicians looking for band members and collaborators. Publish open calls, browse opportunities, and build a musician profile using a React web client backed by a Fastify API and PostgreSQL.

## Implemented features

- **Accounts:** email/password registration, email verification, password reset, sign-out, and automatic session refresh.
- **Profiles:** edit your artist name, first and last name, city, and biography.
- **Announcements:** browse the feed, publish an open call with a city and remote-collaboration option, and delete your own announcements.
- **Bookmarks:** save announcements and revisit or remove them from the saved list.
- **API capabilities:** filtered profile and announcement searches, instrument and genre catalogs, musical projects, announcement updates and reactions, and optional Google ID-token sign-in. Some of these capabilities are API-only; see [current limitations](#current-limitations).

## Stack and platforms

| Component | Implementation |
|---|---|
| API | Fastify 5 on Node.js 22 |
| Database | PostgreSQL 16 with SQL migrations |
| Web client | React 19 and Vite 8 |
| Native shell | Tauri 2, sharing the web client |
| Local deployment | Docker Compose, with nginx serving the web client and proxying the API |

The web app runs in a browser. The Tauri shell targets Linux, macOS, and Windows; Android and iOS require additional platform setup. Native clients still need a running API and database, not just the application bundle.

## Quick start with Docker Compose

You need Git with GitHub SSH access for the clone command, a running Docker engine with Compose v2, and working authenticated SMTP credentials for account verification and password resets. Host installations of Node.js, PostgreSQL, and Rust are not needed for this setup. Commands below use a POSIX shell.

```bash
git clone git@github.com:mbianchidev/every-music.git
cd every-music
cp .env.example .env
```

Edit `.env` before starting:

- Replace `POSTGRES_PASSWORD` with a strong password.
- Set `CIPHER_PRIMARY_KEY` and `CIPHER_REFRESH_KEY` to **different random values of at least 32 characters**.
- Configure `MAIL_GATEWAY`, `MAIL_PORT`, `MAIL_IDENTITY`, `MAIL_CREDENTIAL`, and `MAIL_SENDER_ALIAS` for your SMTP service. The example credentials do not send mail.
- Keep `http://localhost` first in `PORTAL_ORIGINS` for this setup. Verification and password-reset links use the first configured origin.

Do not commit `.env`. Build and start the stack:

```bash
docker compose build --no-cache
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:8080/health/ready
curl --fail http://localhost/healthz
```

All three services should become healthy. The API readiness response includes `"status":"ready"`; the web probe returns `ok`.

| Service | Default local address |
|---|---|
| Web app | <http://localhost> |
| API base URL | `http://localhost:8080/realm` |
| API readiness | <http://127.0.0.1:8080/health/ready> |
| PostgreSQL | `127.0.0.1:5432` |

Compose initializes a new database volume with the schema and instrument/genre catalogs. The API container applies migrations before accepting traffic. The volume persists across restarts; there are no seeded demo accounts or announcements.

### First use

1. Open <http://localhost> and create an account. Passwords need at least eight characters, uppercase, lowercase, and a number.
2. Follow the verification link in your email, then sign in.
3. Open your profile and fill in your artist name, first and last name, city, and biography.
4. Publish an announcement, browse the feed, and save opportunities. Use the navigation to manage your own announcements and bookmarks.

**Email troubleshooting:** readiness checks PostgreSQL, not SMTP. Registration remains saved if email delivery fails, but unverified accounts cannot sign in. Fix `.env`, apply the configuration with `docker compose up -d realm-nexus`, then attempt sign-in to access **Resend verification email**. Inspect failures with `docker compose logs realm-nexus`.

## Local development

Use Node.js 22 (at least 22.12.0), npm, and PostgreSQL 16. Create an empty database first, using a role permitted to create tables and the `uuid-ossp` extension.

From the repository root:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`: set `REALM_CONNECTION` to your database URL, replace the signing-key and SMTP placeholders, and keep `http://localhost:3000` first in `PORTAL_ORIGINS`. This file configures the locally run API; the root `.env` configures Compose.

```bash
cd backend
npm ci
npm run bootstrap
npm run migrate
npm run watch
```

Use `bootstrap` only for a new database: it creates tables and seeds the instrument/genre catalogs. For an existing database, use `npm run migrate` instead. The API listens on port 8080 by default.

In a second terminal, from the repository root:

```bash
cd frontend
npm ci
npm run dev
```

Open <http://localhost:3000>. Vite proxies `/realm` and `/pulse` to `http://localhost:8080`; use port 8080 directly for `/health/live` and `/health/ready`.

### Configuration reference

| Setting | Purpose |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Compose database credentials and database name |
| `REALM_CONNECTION` | PostgreSQL connection URL for local API development and bootstrap |
| `CIPHER_PRIMARY_KEY`, `CIPHER_REFRESH_KEY` | Distinct signing keys, each at least 32 characters |
| `MAIL_GATEWAY`, `MAIL_PORT`, `MAIL_IDENTITY`, `MAIL_CREDENTIAL`, `MAIL_SENDER_ALIAS` | Authenticated SMTP delivery; port 587 by default |
| `PORTAL_ORIGINS` | Comma-separated client-origin allowlist; first entry is the base URL for email links |
| `VITE_API_BASE_URL` | Frontend API base URL, including `/realm`; defaults to `/realm` and is embedded at build time |
| `GOOGLE_IDENTITY_KEY`, `GOOGLE_IDENTITY_LOCK` | Optional Google client ID and secret for the API's Google sign-in endpoint |
| `WEB_PORT`, `API_PORT`, `POSTGRES_PORT` | Compose host ports, defaulting to 80, 8080, and 5432 |

For a web client using a separate API origin:

```bash
cd frontend
VITE_API_BASE_URL=http://localhost:8080/realm npm run dev
```

Allow the client origin in the API's `PORTAL_ORIGINS`. Compose ports bind to loopback by default; internet-facing deployments need a TLS reverse proxy, backups, and log collection. See [deployment and operations](docs/deployment.md) for the full configuration.

## Desktop and mobile

Native development requires Rust stable and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). After installing frontend dependencies and starting the API:

```bash
cd frontend
VITE_API_BASE_URL=http://localhost:8080/realm npm run desktop
```

Packaged clients have no Vite or nginx proxy. Set `VITE_API_BASE_URL` to an absolute API URL ending in `/realm` when building, use HTTPS for deployed clients, and align backend CORS and Tauri CSP with that URL.

Android requires Android Studio, the SDK/NDK, and Java 17+; iOS requires macOS, Xcode, and CocoaPods. Both need Tauri project initialization and platform signing setup for distribution. See [desktop and mobile builds](docs/mobile.md) for commands and requirements. CI checks the Tauri application and can build desktop bundles; it does not build Android or iOS bundles.

## Current limitations

- The current UI has no Google sign-in, profile-search screen, search filters or pagination controls, announcement-editing or reaction controls, or editors for instruments, genres, and musical projects. These capabilities are exposed through the API.
- In-app chat, push notifications, payments/subscriptions, and a media-upload workflow are not implemented. [Product vision](docs/main.md) contains proposed features and historical design ideas, not a list of shipped functionality.
- Native shells do not bundle the backend or provide an offline mode. A reachable API is required.

## Quality gates

After installing dependencies, run from the repository root:

```bash
(cd backend && npm run verify)
(cd frontend && npm run check)
```

For native development with the platform prerequisites installed:

```bash
(cd frontend/src-tauri && cargo check --locked)
```

On Linux with GLib development libraries and `pkg-config`, also run:

```bash
(cd frontend/src-tauri && cargo test --locked --release -p glib-variant-iter-regression --lib)
```

See the [Linux GLib backport](docs/mobile.md#linux-glib-backport) for the dependency patch and its provenance. The [development guide](docs/development.md) covers the API smoke test, which needs a running API and database.

Production dependency audits:

```bash
(cd backend && npm audit --omit=dev --audit-level=high)
(cd frontend && npm audit --omit=dev --audit-level=high)
```

## Runtime behavior

- Access tokens default to 30 minutes; revocable refresh sessions default to 30 days.
- Authentication, reset, and verification tokens are hashed before database storage.
- Account/profile creation and multi-table announcement updates are transactional.
- `/health/live` checks the process; `/health/ready` checks PostgreSQL.
- The web client retries one expired authenticated request after a single shared refresh.
- Network failures preserve local session state; confirmed authentication failures clear it.
- Web and API responses include baseline security headers.
- The UI includes labelled forms, visible keyboard focus, route focus management, live status messages, and reduced-motion support.

## Documentation

- [Development](docs/development.md)
- [Deployment and operations](docs/deployment.md)
- [API reference](docs/api.md)
- [Desktop and mobile builds](docs/mobile.md)
- [Security policy](SECURITY.md)
- [Product vision and historical roadmap](docs/main.md)

## Contributing

Issues and focused pull requests are welcome. Read the [development guide](docs/development.md) for coding conventions and database migration requirements, and run the relevant quality gates before submitting changes.

Report suspected vulnerabilities privately using the [security policy](SECURITY.md), not a public issue.

## Repository layout

```text
backend/                 Fastify API, database schema, and migrations
frontend/                React client and Tauri shell
docs/                    Maintained project documentation
.github/workflows/       CI and security scanning
docker-compose.yml       Canonical full-stack deployment
```

## License

Apache License 2.0. See [LICENSE](LICENSE).
