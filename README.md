# Every.music

Every.music helps musicians find collaborators, publish open calls, and build a searchable musical profile.

The repository contains a production-oriented full stack:

- **API:** Fastify 5 on Node.js 22
- **Database:** PostgreSQL 16 with tracked SQL migrations
- **Web:** React 19 and Vite 8
- **Desktop/mobile:** Tauri 2
- **Operations:** Docker Compose, health probes, smoke tests, dependency audits, CodeQL, and multi-platform checks

## Quick start

Requirements: Docker with Compose.

```bash
cp .env.example .env

# Replace every placeholder secret and configure working SMTP credentials.
docker compose up --build
```

The default bindings are intentionally local:

- Web: <http://127.0.0.1>
- API readiness: <http://127.0.0.1:8080/health/ready>
- PostgreSQL: `127.0.0.1:5432`

Build without cache when validating release containers:

```bash
docker compose build --no-cache
docker compose up -d
docker compose ps
```

## Local development

```bash
cd backend
npm ci
cp .env.example .env
npm run bootstrap
npm run migrate
npm run watch
```

```bash
cd frontend
npm ci
npm run dev
```

The Vite development server proxies `/realm` and health requests to `http://localhost:8080`.

## Quality gates

```bash
cd backend && npm run verify
cd frontend && npm run check
cd frontend/src-tauri && cargo check --locked
```

Production dependency audits:

```bash
cd backend && npm audit --omit=dev --audit-level=high
cd frontend && npm audit --omit=dev --audit-level=high
```

## Runtime behavior

- Access tokens are short-lived and refresh sessions are revocable.
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
- [Product vision](docs/main.md)

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
