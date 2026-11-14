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
| `REALM_POOL_MAX` | `10` (1-100) | Maximum pooled connections per API process; live updates use one additional dedicated connection |
| `CIPHER_PRIMARY_KEY` | Required, at least 32 characters | Access-token signing key |
| `CIPHER_REFRESH_KEY` | Required, at least 32 characters and different from primary | Refresh-token signing key |
| `TOKEN_ISSUER` | `every.music` | Expected token issuer |
| `TOKEN_AUDIENCE` | `every.music.clients` | Expected token audience |
| `TOKEN_LIFESPAN_MINUTES` | `30` (5-1440) | Access-token lifetime |
| `REFRESH_LIFESPAN_DAYS` | `30` (1-90) | Refresh-session lifetime |
| `REFRESH_ROTATION_GRACE_SECONDS` | `30` (5-120) | Retry window for a lost rotation response |
| `GOOGLE_IDENTITY_KEY` | Unset | Optional Google OAuth client ID |
| `GOOGLE_IDENTITY_LOCK` | Unset | Legacy setting, no longer required or used by the Google ID-token flow |
| `VAPID_PUBLIC_KEY` | Unset | Optional Web Push public key, exposed to the signed-in client |
| `VAPID_PRIVATE_KEY` | Unset | Matching Web Push private key, server-only |
| `VAPID_SUBJECT` | Unset | HTTPS or `mailto:` operator contact; required with the VAPID keys |
| `MAIL_GATEWAY` | Required in production | Authenticated SMTP hostname |
| `MAIL_PORT` | `587` (1-65535) | SMTP port; transport uses STARTTLS, not implicit TLS on 465 |
| `MAIL_IDENTITY` | Required in production | SMTP username |
| `MAIL_CREDENTIAL` | Required in production | SMTP password/app password |
| `MAIL_SENDER_ALIAS` | Required in production | Sender, such as `Every.music <noreply@example.test>` |
| `PORTAL_ORIGINS` | `http://localhost:3000` | Comma-separated exact CORS origins; first is used for email links |
| `RATE_WINDOW_MS` | `900000` (at least 1000) | Rate-limit window in milliseconds |
| `RATE_THRESHOLD` | `150` (at least 1) | Requests allowed per client/window |
| `UPLOAD_BYTE_LIMIT` | `5242880` (at least 1024) | Maximum JSON body size, including base64 image uploads; images themselves are capped at 2 MiB |
| `ATTACHMENT_BYTE_LIMIT` | `10485760` (1024-52428800) | Maximum raw body of an encrypted attachment upload (`POST /realm/media/blobs`) |
| `MEDIA_STORAGE` | `postgres` | Where new uploads are written: `postgres` or `s3`; see [media storage](#media-storage) |
| `S3_ENDPOINT` | AWS regional endpoint | Origin of an S3-compatible service, such as `https://<account>.r2.cloudflarestorage.com` or `http://object-store:8333` |
| `S3_REGION` | `us-east-1` | Signing region; Cloudflare R2 uses `auto` |
| `S3_BUCKET` | Required with `s3` | Private bucket for media objects |
| `S3_ACCESS_KEY_ID` | Required with `s3` | Access key with get, put, delete, and head permissions on the bucket |
| `S3_SECRET_ACCESS_KEY` | Required with `s3` | Matching secret, server-only |
| `S3_FORCE_PATH_STYLE` | `false` | `true` for `endpoint/bucket/key` URLs (MinIO, SeaweedFS); `false` for `bucket.endpoint/key` |
| `FCM_PROJECT_ID` | Unset | Optional Firebase project for Android push; see [native mobile push](#native-mobile-push) |
| `FCM_CLIENT_EMAIL` | Unset | Firebase service-account email |
| `FCM_PRIVATE_KEY` | Unset | Service-account RSA private key (PEM; `\n` escapes accepted) |
| `APNS_KEY_ID` | Unset | Optional Apple Push Notification service key ID for iOS push |
| `APNS_TEAM_ID` | Unset | Apple developer team ID |
| `APNS_PRIVATE_KEY` | Unset | APNs authentication key (`.p8` PEM; `\n` escapes accepted) |
| `APNS_TOPIC` | Unset | iOS bundle identifier, normally `music.every.app` |
| `APNS_ENVIRONMENT` | `production` | `production`, or `sandbox` for development-signed apps |

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

### Google web sign-in

Create a **Web application** OAuth client in Google Cloud, configure its consent
screen/test users, and register the exact web app origins (for example
`http://localhost:3000` for development and your production HTTPS origin).
Set `GOOGLE_IDENTITY_KEY` to its client ID and restart the API. No `VITE_*`
setting, redirect callback, or client secret is needed for this GIS ID-token
flow. The client discovers the public ID from `/realm/auth/google/config`.

The official Google button appears on sign-in and registration when configured.
Each attempt has a five-minute, single-use nonce, verified against Google's
signed credential on the server. Existing email accounts are not automatically
linked by matching email. Google credentials are not persisted by the client.
Google does not permit this flow in embedded native WebViews. A Google user
can add password sign-in through verified password recovery on that account's
email, without losing Google login, and use the password in native clients.

The supplied nginx policy permits only the Google GIS script, frame, style,
and connection paths in addition to the application's existing sources.
Keep equivalent CSP rules if replacing nginx.

### Browser push and live updates

Generate a VAPID pair once, from `backend/`:

```bash
node --input-type=module -e "import { generateVAPIDKeys } from 'web-push'; console.log(generateVAPIDKeys())"
```

Keep the private key in runtime secrets. Set both keys and `VAPID_SUBJECT`
together; startup rejects partial or mismatched configuration. The public key
is not a secret. Preserve the pair across deployments. After rotation, users
should enable push again in Settings.

Push needs a production web build, HTTPS (or localhost during development),
service-worker/Push API support, and explicit browser permission. iOS requires
a supported Home Screen installation. Native WebViews do not use web push.
The user can enable up to five browsers or disable all devices in Settings.
Only Chrome/FCM, Mozilla, Apple, and Windows browser push endpoints are accepted;
arbitrary webhook URLs and non-HTTPS services are rejected.

Push payloads contain a generic event title and a protected app link, never
message text. Delivery is best-effort, with up to three attempts; expired
subscriptions are removed. Check API logs for delivery errors. Google and push
provider behavior needs live credentials/platform permission testing.

Live changes use authenticated `fetch` event streams, not access tokens in
URLs. PostgreSQL LISTEN/NOTIFY fans out small invalidation events across API
processes, with one listener per process. Each process allows at most three
streams per user and 1,000 total. Heartbeats run every 15 seconds; streams end at access
token expiration and reconnect through normal session refresh. A reconnect
reloads current state, so notification loss does not lose stored messages.
The client also reconnects if no stream bytes arrive for 45 seconds.
Disable proxy buffering/compression for event streams and allow idle timeouts
longer than 15 seconds. The supplied nginx config already disables buffering.
Review `RATE_THRESHOLD` for shared proxies and busy deployments.

### Media storage

`MEDIA_STORAGE=postgres` keeps today's behavior: optimized images and encrypted
attachment blobs are stored in PostgreSQL. `MEDIA_STORAGE=s3` writes new uploads
to any S3-compatible service (AWS S3, Cloudflare R2, MinIO, SeaweedFS, and
similar) using Signature V4 requests. Startup rejects an incomplete or invalid
S3 configuration.

Media is always served through `/realm/media/:id` with the same owner,
public-reference, and authorized-reference checks; buckets must stay private and
no public bucket URLs are issued. Existing PostgreSQL rows remain readable after
switching to `s3`. Rows already stored as objects stay readable after switching
back to `postgres` only while the S3 settings remain configured. Readiness reports
`storage` and returns 503 when the bucket is unreachable while `s3` is selected.

Unreferenced uploads are deleted after a day. Deleting a media row (cleanup,
account deletion, or manual SQL) queues its object, and a background worker
removes it with retries. Grant the access key only `s3:GetObject`,
`s3:PutObject`, `s3:DeleteObject`, and `s3:ListBucket` (used by the readiness
`HEAD` request) on that bucket. Enable the provider's encryption at rest and
versioning or backups according to your retention policy.

### Native mobile push

Android push uses Firebase Cloud Messaging HTTP v1 and iOS push uses Apple Push
Notification service with token authentication. Each provider is disabled until
all of its settings are present; partial or malformed settings stop startup.

- Android: create a Firebase project, then a service account with the Firebase
  Cloud Messaging API Admin role. Copy `project_id`, `client_email`, and
  `private_key` from its JSON key into the three `FCM_*` settings.
- iOS: create an APNs authentication key in the Apple Developer portal and set
  its key ID, your team ID, the `.p8` contents, and the app bundle identifier.
  Use `APNS_ENVIRONMENT=sandbox` for development-signed builds.

Devices register through `POST /realm/push/devices`. Payloads contain the same
generic title and app link as Web Push, never message text. Unregistered tokens
are removed automatically and failed deliveries are retried up to three times.
The Tauri mobile shell does not register device tokens yet; see
[mobile push](mobile.md#native-push-notifications).

## Plans and limits

Freemium limits use the product plan names. Set `FREE_<NAME>` or
`PREMIUM_<NAME>` to override a default. Numeric limits accept a positive
integer or `unlimited`; switches accept `true`/`false`. The partner plan uses
premium limits and can always manage business pages.

| Name | Free default | Premium default | Controls |
|---|---|---|---|
| `MAX_ANNOUNCEMENT_LIMIT` | `5` | `unlimited` | Active (published, unexpired) announcements |
| `MAX_FILTERS_SAVED` | `1` | `20` | Saved announcement searches with alerts |
| `SEE_ADS_STATS` | `false` | `true` | Announcement statistics |
| `MAX_PROJECTS_SHOWN` | `3` | `unlimited` | Projects shown on a public profile |
| `MAX_CONTENT_SHOWN` | `3` | `unlimited` | Content links shown on a public profile |
| `MAX_SAVABLE_ADS` | `10` | `unlimited` | Saved announcements |
| `EXPIRATION_DATE_DAY_LIMIT` | `30` | `unlimited` | Maximum announcement lifetime in days |
| `SEE_PROFILE_VISITS` | `false` | `true` | Seeing consenting visitors of your profile |

`PARTNER_PLAN_REQUIRED` (default `false`) restricts venue, organizer, booking
agency, and label pages to the partner plan.

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
| `OBJECT_STORE_BIND_ADDRESS` / `OBJECT_STORE_PORT` | `127.0.0.1` / `8333`, only with the `object-storage` profile |
| `COMPOSE_PROFILES` | Unset; `object-storage` starts the bundled SeaweedFS S3 gateway |

Compose also forwards signing, token issuer/audience/lifetime/grace, Google, VAPID,
SMTP, pool, rate-limit, body-size, media storage, and native push settings listed
above. In Compose, `S3_ENDPOINT` defaults to the bundled `http://object-store:8333`,
`S3_BUCKET` to `everymusic-media`, and `S3_FORCE_PATH_STYLE` to `true`. Its default
`PORTAL_ORIGINS` is
`http://localhost,http://localhost:3000,http://tauri.localhost,tauri://localhost`.
`MAIL_PORT` defaults to 587; sender/host/username/password are required.

After changing host ports, update the client origin and email-link origin too.
For example, `WEB_PORT=8088` needs `http://localhost:8088` first in
`PORTAL_ORIGINS`. Recreate changed containers with `docker compose up -d`.

To use the bundled object store, add these to the root `.env` and run
`docker compose up -d` (see [deployment](deployment.md#optional-object-storage-in-compose)):

```text
COMPOSE_PROFILES=object-storage
MEDIA_STORAGE=s3
S3_ACCESS_KEY_ID=<random access key>
S3_SECRET_ACCESS_KEY=<different random secret>
```

Do not expose PostgreSQL publicly or expose the trusted-proxy API directly to
untrusted traffic. Use a TLS reverse proxy and private service networking for
internet-facing deployments.

## Client, verification, and release settings

| Variable | Scope and behavior |
|---|---|
| `VITE_API_BASE_URL` | Public build-time API URL including `/realm`; defaults to `/realm` |
| `SMOKE_BASE_URL` | Backend smoke-test API origin; defaults to `http://127.0.0.1:8080` |
| `SMOKE_READINESS_URL` | Optional absolute API readiness URL when the smoke base points at a web proxy exposing only `/realm/`; defaults to the base origin's `/health/ready` |
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
