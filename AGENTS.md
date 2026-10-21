# Working on Every.music

Read [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md), and the
[developer documentation](docs/development.md) before editing.

## Repository map

- `backend/src/`: Fastify routes, conductors, engines, validators, and repositories.
- `backend/database/`: PostgreSQL schema, catalogs, and ordered SQL migrations.
- `frontend/src/`: React screens, shared components, API transport, and session state.
- `frontend/src-tauri/`: Tauri shell, native configuration, and Cargo workspace.
- `scripts/release.mjs`: native desktop packaging and artifact verification.
- `docs/`: [user and developer documentation](docs/README.md).

## Setup and verification

Use Node.js 22.12+ (CI uses Node 22), PostgreSQL 16, and npm lockfiles.
Native checks also need Rust stable and the platform SDKs.

From the repository root, after dependencies are installed:

```bash
(cd backend && npm run verify)
(cd frontend && npm run check)
node --test scripts/test/release.test.mjs
(cd backend && npm audit --omit=dev --audit-level=high)
(cd frontend && npm audit --omit=dev --audit-level=high)
```

Native changes:

```bash
(cd frontend/src-tauri && cargo check --locked)
```

On Linux, with GLib development libraries and `pkg-config`:

```bash
(cd frontend/src-tauri && cargo test --locked --release -p glib-variant-iter-regression --lib)
```

Use the [development guide](docs/development.md) for install/run/smoke commands
and the [release guide](docs/releases.md) for packaging. Do not publish releases,
tags, or images just to validate a change.

## Invariants

- Keep HTTP responses in the existing `success`/`data` or `success`/`error` envelopes.
- Bind browser-native functions to their global receiver; preserve injectable
  transports for tests. Cover request errors, session refresh, and network failures.
- Keep errors visible in logs and the UI. Do not replace failed requests with
  success-shaped empty results.
- Use the executor from `realmConnector.transaction` for every operation in a
  transaction. Do not call the global pool from inside that transaction.
- Omitted relation fields mean "leave unchanged"; empty arrays mean "clear".
- Database changes update both `schema.sql` and an ordered, idempotent migration.
- `bootstrap` creates tables and is only for a new disposable/development database.
- Use synthetic data only. Run destructive test setup and smoke tests against an
  isolated database, never a shared or production database.
- Never commit `.env`, database dumps, tokens, signing keys, or personal data.
- Reuse components and existing styles. Follow [accessibility guidance](ACCESSIBILITY.md).
- Do not hand-edit build outputs or generated mobile files unless changing that
  platform integration. Keep native dependency lockfiles current.
- Preserve the [GLib backport and its regression](docs/mobile.md#linux-glib-backport)
  until a compatible patched upstream dependency replaces it.
- Update the relevant docs when behavior, configuration, or release steps change.
