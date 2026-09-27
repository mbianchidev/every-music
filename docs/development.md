# Development

## Prerequisites

- Node.js 22
- PostgreSQL 16
- Rust stable for Tauri
- Docker with Compose for container validation

## Backend

Create `backend/.env` from `backend/.env.example`. Generate different signing keys:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Initialize and run:

```bash
cd backend
npm ci
npm run bootstrap
npm run migrate
npm run watch
```

`bootstrap` is for a new development database. `migrate` is safe to run repeatedly and is the deployment path for existing databases.

Useful commands:

```bash
npm test
npm run verify
npm run smoke
```

The smoke test expects a running API and uses `REALM_CONNECTION` for setup and cleanup.

## Frontend

```bash
cd frontend
npm ci
npm run dev
```

Set `VITE_API_BASE_URL` when the API is not available through the same origin:

```bash
VITE_API_BASE_URL=http://localhost:8080/realm npm run dev
```

Tests exercise session persistence, typed API failures, network preservation, and single-flight token refresh:

```bash
npm test
npm run check
```

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
