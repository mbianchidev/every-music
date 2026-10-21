# Configuration reference

[Documentation index](README.md) | [Usage](usage.md) | [Operations](deployment.md)

## Where configuration is read

- Root `.env`: Compose interpolation. Only values explicitly mapped in
  `docker-compose.yml` reach containers.
- `backend/.env`: dotenv configuration when commands run from `backend/`.
  An already-exported process environment takes precedence.
- `frontend/.env.local` or the build process environment: Vite client settings.
  `VITE_*` values are public and embedded in JavaScript; never put secrets there.
- GitHub repository variables/workflow inputs: packaging configuration, not API
  runtime configuration.

Copy the corresponding `.env.example`, replace placeholders, and keep actual
files untracked. Generate two different signing values, running this command
once for each key:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

## API settings

These are read by `backend/config/realm.js`. The API validates environment,
required database configuration, distinct signing keys, and numeric ranges on
startup. Mail settings are mandatory in production.

| Variable | Default / requirement | Purpose |
|---|---|---|
| `REALM_ENV` | `NODE_ENV`, then `development` | `development`, `test`, or `production` |
| `NODE_ENV` | Unset | Fallback runtime environment |
| `APP_VERSION` | `1.0.0` | Version returned by `/nexus-info` |
| `NEXUS_HOST` | `0.0.0.0` | API listen address; use `127.0.0.1` for local-only development |
| `NEXUS_PORT` | `8080` (1-65535) | API listen port |
| `TRUST_PROXY` | `false` | Accept `true`/`false` or `1`/`0`; enable only behind a trusted proxy |
| `REALM_CONNECTION` | Required unless discrete settings below are supplied | PostgreSQL URL; also required by bootstrap and smoke scripts |
| `REALM_HOST` | Required for discrete configuration | PostgreSQL host |
| `REALM_PORT` | `5432` (1-65535) | PostgreSQL port |
| `REALM_NAME` | Required for discrete configuration | Database name |
| `REALM_USER` | Required for discrete configuration | Database user |
| `REALM_PASSWORD` | Required for discrete configuration | Database password |
| `REALM_POOL_MIN` | `2` (0-100) | Minimum pool setting, not greater than maximum |
| `REALM_POOL_MAX` | `10` (1-100) | Maximum database connections per API process |
| `CIPHER_PRIMARY_KEY` | Required, at least 32 characters | Access-token signing key |
| `CIPHER_REFRESH_KEY` | Required, at least 32 characters and different from primary | Refresh-token signing key |
| `TOKEN_ISSUER` | `every.music` | Expected token issuer |
| `TOKEN_AUDIENCE` | `every.music.clients` | Expected token audience |
| `TOKEN_LIFESPAN_MINUTES` | `30` (5-1440) | Access-token lifetime |
| `REFRESH_LIFESPAN_DAYS` | `30` (1-90) | Refresh-session lifetime |
| `REFRESH_ROTATION_GRACE_SECONDS` | `30` (5-120) | Retry window for a lost rotation response |
| `GOOGLE_IDENTITY_KEY` | Unset | Optional Google OAuth client ID |
| `GOOGLE_IDENTITY_LOCK` | Unset | Optional Google client secret; both Google settings are needed |
| `MAIL_GATEWAY` | Required in production | Authenticated SMTP hostname |
| `MAIL_PORT` | `587` (1-65535) | SMTP port; transport uses STARTTLS, not implicit TLS on 465 |
| `MAIL_IDENTITY` | Required in production | SMTP username |
| `MAIL_CREDENTIAL` | Required in production | SMTP password/app password |
| `MAIL_SENDER_ALIAS` | Required in production | Sender, such as `Every.music <noreply@example.test>` |
| `PORTAL_ORIGINS` | `http://localhost:3000` | Comma-separated exact CORS origins; first is used for email links |
| `RATE_WINDOW_MS` | `900000` (at least 1000) | Rate-limit window in milliseconds |
| `RATE_THRESHOLD` | `150` (at least 1) | Requests allowed per client/window |
| `UPLOAD_BYTE_LIMIT` | `5242880` (at least 1024) | Maximum request body size, not a media-upload feature |

If `REALM_CONNECTION` is provided, it takes precedence over discrete database
values. Percent-encode credentials in a manually constructed URL. With discrete
settings, the runtime safely encodes credentials; bootstrap and smoke scripts
still use `REALM_CONNECTION`.

Compatibility aliases remain supported: `PORTAL_ORIGIN`, `TOKEN_LIFESPAN_HOURS`,
and `REFRESH_LIFESPAN_HOURS`. Prefer the current plural/minute/day settings.
The current settings take precedence over their legacy equivalents.

Key rotation invalidates tokens signed with the old key. Do not change signing
keys as a troubleshooting shortcut without planning session invalidation.
Email verification/reset links use the first origin; a working CORS allowlist
alone does not ensure links point to the correct web client.

## Compose settings

Compose sets the API to production, listens internally on `0.0.0.0:8080`,
connects to `realm-store:5432`, and enables trust-proxy for nginx. Database,
API, and web host bindings are local by default.

| Variable | Default / requirement |
|---|---|
| `POSTGRES_USER` | `everymusician` |
| `POSTGRES_PASSWORD` | Required |
| `POSTGRES_DB` | `everymusic_realm` |
| `POSTGRES_BIND_ADDRESS` / `POSTGRES_PORT` | `127.0.0.1` / `5432` |
| `API_BIND_ADDRESS` / `API_PORT` | `127.0.0.1` / `8080` |
| `WEB_BIND_ADDRESS` / `WEB_PORT` | `127.0.0.1` / `80` |

Compose also forwards signing, token issuer/audience/lifetime/grace, Google,
SMTP, pool, rate-limit, and body-size settings listed above. Its default
`PORTAL_ORIGINS` is
`http://localhost,http://localhost:3000,http://tauri.localhost,tauri://localhost`.
`MAIL_PORT` defaults to 587; sender/host/username/password are required.

After changing host ports, update the client origin and email-link origin too.
For example, `WEB_PORT=8088` needs `http://localhost:8088` first in
`PORTAL_ORIGINS`. Recreate changed containers with `docker compose up -d`.

Do not expose PostgreSQL publicly or expose the trusted-proxy API directly to
untrusted traffic. Use a TLS reverse proxy and private service networking for
internet-facing deployments.

## Client, verification, and release settings

| Variable | Scope and behavior |
|---|---|
| `VITE_API_BASE_URL` | Public build-time API URL including `/realm`; defaults to `/realm` |
| `SMOKE_BASE_URL` | Backend smoke-test API origin; defaults to `http://127.0.0.1:8080` |
| `DESKTOP_API_BASE_URL` | GitHub repository variable used by native packaging |
| `api_base_url` | Manual CI input overriding `DESKTOP_API_BASE_URL` for that run |
| `CARGO_TARGET_DIR` | The release wrapper sets it to `frontend/src-tauri/target` for predictable output |
| `CARGO_BUILD_TARGET` | Must be unset for the native-host release wrapper |

Vite serves `/realm` and `/pulse` through `http://localhost:8080` in development;
nginx proxies `/realm/` in Compose. Packaged clients have neither proxy and need
an absolute URL. Use HTTPS for deployed clients; the release wrapper only accepts
plain HTTP for loopback development. Align API CORS and the Tauri CSP with the
embedded URL. Changing a `VITE_*` value after building requires rebuilding.

When running the smoke test, use an isolated synthetic database and matching
API: it creates accounts and announcements and deletes its own test user.
See [development](development.md#integration-smoke-test) and
[release delivery](releases.md) for exact commands and output paths.
