# Deployment and operations

[Documentation index](README.md) | [Complete configuration](configuration.md) | [Usage and troubleshooting](usage.md)

## Required configuration

Copy `.env.example` to the deployment secret store. Do not commit `.env`.

Required production values:

- `POSTGRES_PASSWORD`
- `CIPHER_PRIMARY_KEY`
- `CIPHER_REFRESH_KEY`
- `MAIL_GATEWAY`
- `MAIL_IDENTITY`
- `MAIL_CREDENTIAL`
- `MAIL_SENDER_ALIAS`

The signing keys must be different and at least 32 characters. Rotating either key invalidates the corresponding active tokens.

Set `PORTAL_ORIGINS` to a comma-separated allowlist. Include Tauri origins only when packaged clients are supported:

```text
https://every.music,http://tauri.localhost,tauri://localhost
```

## Containers

```bash
docker compose build --no-cache
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:8080/health/ready
curl --fail http://127.0.0.1/healthz
```

The API container runs database migrations before accepting traffic. The web and API ports bind to loopback by default; place them behind a TLS reverse proxy for internet access.

## Upgrading

1. Create a PostgreSQL backup in secure storage outside the checkout and test its
   restore into an isolated database. Confirm which application revision and
   schema the backup belongs to.
2. Review the intended revision's migrations and configuration changes.
   Obtain that reviewed revision without overwriting local secrets or data.
3. Run `docker compose build --no-cache`, then `docker compose up -d`.
   The API applies outstanding migrations before listening.
4. Check `docker compose ps`, readiness, and API logs. Exercise user workflows
   with synthetic accounts in staging, including SMTP verification/reset delivery.
5. Retain the backup and previous application artifacts until the upgrade is
   accepted. Application rollback does not reverse a schema migration; use a
   planned restore or compatible forward fix rather than assuming it is safe.

Outside Compose, run `npm run migrate` from `backend/` as a release step before
starting the API. Never run `bootstrap` against an existing database.
See [data lifecycle](usage.md#upgrades-stopping-and-uninstalling) for shutdown
and volume behavior, and [native release delivery](releases.md) for client builds.

## Health model

- `GET /health/live`: process is running.
- `GET /health/ready`: PostgreSQL is reachable.
- `GET /pulse`: compatibility alias for readiness.

Use readiness for load balancer admission. Use liveness only for process restart decisions.

## Database

- Back up PostgreSQL before every schema migration.
- Test restore procedures, not only backup creation.
- Keep the database private; the Compose port binds to `127.0.0.1` by default.
- Monitor connection saturation against `REALM_POOL_MAX`.
- Run `npm run migrate` as a dedicated release step outside Compose when the platform separates migrations from application startup.

## Email

Registration remains committed if SMTP delivery fails. Users can request another verification email through the sign-in screen. Monitor SMTP failures because unverified accounts cannot sign in.

## Tokens and sessions

- Access tokens default to 30 minutes.
- Refresh sessions default to 30 days and are revocable.
- Refresh tokens rotate on use. A 30-second deterministic grace window lets a client recover the same replacement after a lost response; later reuse revokes all sessions for the account.
- Password reset revokes all refresh sessions for the account.
- Stored refresh, verification, and reset tokens are SHA-256 hashes in PostgreSQL.

## Observability

Fastify emits structured JSON logs in production. Collect stdout/stderr and alert on:

- readiness failures
- SMTP initialization or send failures
- repeated `RATE_LIMIT_EXCEEDED`
- authentication lookup failures
- migration failures
- uncaught exceptions or unhandled rejections

## Release checklist

1. `npm ci`, tests, builds, and production dependency audits are green.
2. `cargo check --locked` is green.
3. Database backup and rollback plan are confirmed.
4. Required environment variables and origin allowlists are reviewed.
5. `docker compose build --no-cache` succeeds.
6. Deployment readiness passes, and the backend smoke test passes in an isolated staging database.
7. TLS, DNS, SMTP, PostgreSQL backups, and log collection are configured by the hosting platform.
8. Native packaging has a reviewed HTTPS API URL ending in `/realm`, supplied through `DESKTOP_API_BASE_URL` or the manual workflow input; follow [release verification](releases.md).
