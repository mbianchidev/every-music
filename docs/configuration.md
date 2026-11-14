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
| `APP_VERSION` | `1.0.0` | Version returned by `/nexus-info` and `/realm/app/version`; see [app versions](#help-center-legal-pages-and-app-versions) |
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
| `APPLICATION_RETENTION_DAYS` | `90` (1-3650) | Days that [announcement applications](api.md#announcement-applications) stay readable to the owner after the call closes, and that withdrawn replies are kept, before hourly cleanup deletes them |
| `TWO_FACTOR_ENCRYPTION_KEY` | Unset; at least 32 characters when set | Optional dedicated key sealing TOTP secrets and SMS numbers; derived from `CIPHER_PRIMARY_KEY` when unset |
| `VERIFICATION_MEDIA_RETENTION_DAYS` | `7` (1-90) | Days verification photos are kept after a decision |
| `TWILIO_ACCOUNT_SID` | Unset | Twilio account for SMS codes; SMS is hidden unless SID, token, and a sender are set |
| `TWILIO_AUTH_TOKEN` | Unset | Twilio auth token, server-only |
| `TWILIO_FROM_NUMBER` | Unset | E.164 sender number, or use the messaging service below |
| `TWILIO_MESSAGING_SERVICE_SID` | Unset | Twilio messaging service used instead of a sender number |
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
| `YOUTUBE_FEED_INTERVAL_MINUTES` | `60` (0-10080) | How often each band's public YouTube channel feed is checked for new videos; `0` disables the import and its outbound requests to `www.youtube.com` |
| `EVENT_REMINDER_INTERVAL_SECONDS` | `60` (0-3600) | How often each API process looks for due event reminders (`event_reminder` notifications) and, hourly, removes reminders of ended or cancelled events; `0` disables reminder delivery |

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

### Two-step verification and SMS

Authenticator apps (TOTP) always work. Email codes appear when SMTP is
configured; SMS appears only when `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and
`TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID` are all set. Startup
rejects partial Twilio settings. SMS goes through a small provider interface
(`backend/src/engines/sms-gateway.js`, `send(to, body)`) so another provider can
replace the bundled Twilio adapter. Phone numbers are collected only when a
member enrolls SMS and are deleted when they turn it off or abandon setup.

TOTP secrets and SMS numbers are sealed with AES-256-GCM. The key comes from
`TWO_FACTOR_ENCRYPTION_KEY` when set, otherwise it is derived with HKDF from
`CIPHER_PRIMARY_KEY`, so no new secret is required to start using two-step
verification. Email/SMS codes and confirmation codes are stored as keyed
hashes; recovery codes and challenge tokens as SHA-256 hashes. Set a dedicated
key in production so the access-token signing key can rotate independently.

Rotation impact: changing the key in use (the dedicated key, or
`CIPHER_PRIMARY_KEY` when no dedicated key is set) makes every stored TOTP
secret and SMS number unreadable and invalidates outstanding email/SMS codes.
Affected members see a warning in Security settings, sign in with a recovery
code, turn two-step verification off, and enroll again. Email-code enrollments
keep working. Switching from the derived key to a dedicated key has the same
effect. A member who lost both their second factor and recovery codes must be
reset by an operator after verifying their identity out of band, for example
with `DELETE FROM user_two_factor WHERE user_id = '<id>'` and
`DELETE FROM two_factor_recovery_codes WHERE user_id = '<id>'`.

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

### Notification email and scheduled notifications

Email notifications reuse the SMTP settings above. Without a working SMTP
transport at startup the email worker stays idle and logs that once; choices
are still saved, and queued emails older than one day are never sent later.
Emails are localized (English, Dutch, Italian) from the user's language
preference, link to the first `PORTAL_ORIGINS` entry, and contain only generic
text and counts, never message text or other private content. Each email gets
up to three attempts, 5, 10, and 20 minutes apart. Emails already read in the
app, and repeats for the same conversation or item within 15 minutes, are skipped.

Every API process runs these jobs; a database lease lets only one process run
each job per interval, and event keys keep reruns from creating duplicates.

| Variable | Default (range) | Purpose |
|---|---|---|
| `NOTIFICATION_JOB_INTERVAL_MINUTES` | `60` (1-1440) | How often each scheduled job runs across all API processes |
| `STATS_DIGEST_WEEKDAY` | `1` (1-7, Monday-Sunday) | First ISO weekday on which the weekly statistics digests are created |
| `STATS_DIGEST_MIN_EVENTS` | `1` (1-100000) | Minimum activity in the previous 7 days before a digest is sent |
| `COME_BACK_AFTER_DAYS` | `30` (1-90) | Days since the last sign-in before a come-back reminder; also the gap between reminders. At most the 90-day notification retention, which keeps reminders unique |
| `COME_BACK_MAX_REMINDERS` | `3` (0-24) | Reminders per inactivity streak; `0` disables them |
| `INVITE_NUDGE_AFTER_DAYS` | `7` (1-365) | Days after signup for the single in-app invite-friends nudge (sent within the following 30 days) |

Weekly digests require personal analytics consent, a chosen push or email
channel for that digest, and a plan whose `SEE_ADS_STATS` (announcement
statistics) or `SEE_PROFILE_VISITS` (profile statistics) switch is on.

### Help center, legal pages, and app versions

These settings are optional. Unset operator details appear as clearly marked
placeholders in the legal templates, which the operator must review before
relying on them. Values are public: they are returned by `GET /realm/legal`
and `GET /realm/app/version`.

| Variable | Default / format | Purpose |
|---|---|---|
| `OPERATOR_NAME` | Unset; one line, up to 200 characters | Data controller and operator named in the legal pages |
| `OPERATOR_CONTACT_EMAIL` | Unset; email address | Privacy and legal contact shown in the legal pages |
| `OPERATOR_JURISDICTION` | Unset; up to 120 characters | Governing law and supervisory authority context |
| `LEGAL_EFFECTIVE_DATE` | Unset; `YYYY-MM-DD` | Effective date shown on the policies |
| `TERMS_VERSION` | `1`; 1-32 letters, digits, `.`, `-`, `_` | Current Terms of Use version; registration must accept it, and changing it asks existing accounts once after sign-in |
| `SUPPORT_EMAIL` | Unset; email address | Optional mailbox that receives a copy of each help request through the SMTP settings above |
| `CLIENT_MIN_VERSION` | Unset; `MAJOR.MINOR.PATCH` | Clients older than this show a blocking update screen |
| `CLIENT_LATEST_VERSION` | Unset; `MAJOR.MINOR.PATCH`, not older than the minimum | Clients older than this show a dismissible update notice |
| `CLIENT_UPDATE_URL` | Unset; `http(s)` URL | Download page shown in desktop and Android update instructions |

Help requests are always stored for the admin inbox. With `SUPPORT_EMAIL` and
working SMTP, each request is also forwarded, with the requester's email as
`Reply-To`; forwarding failures are logged and the request stays in the inbox.
Answered and closed requests are deleted 365 days after their last update.

The web client's version is the `version` in `frontend/package.json`, embedded at
build time. On startup, the API records `APP_VERSION` in `app_releases`. When
its major or minor number increases over the highest recorded version, every
active account receives one `app_update_major` or `app_update_minor`
notification; a transaction-level advisory lock and unique keys keep this to
exactly once across API processes. Patch releases, rollbacks, repeated starts,
and non-`MAJOR.MINOR.PATCH` values notify nobody. Ratings are accepted for
released versions between `CLIENT_MIN_VERSION` and the newer of
`CLIENT_LATEST_VERSION` and `APP_VERSION`.

### Media storage

`MEDIA_STORAGE=postgres` keeps today's behavior: optimized images and encrypted
attachment blobs are stored in PostgreSQL. `MEDIA_STORAGE=s3` writes new uploads
to any S3-compatible service (AWS S3, Cloudflare R2, MinIO, SeaweedFS, and
similar) using Signature V4 requests. Startup rejects an incomplete or invalid
S3 configuration.

To move media that is still in PostgreSQL into the bucket after switching, run
`npm run media:move-to-object-storage` from `backend/` (or
`node scripts/move-media-to-object-storage.js` in the API image) with the same
settings. It uploads each item, then clears its bytes from PostgreSQL, and can
be stopped and rerun safely. Back up the database first.

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
agency, and label pages to the partner plan. Bands and community-maintained
venues stay free; see the [organization model](organizations.md).

## Marketplace

| Variable | Default / range | Purpose |
|---|---|---|
| `MARKETPLACE_LISTING_DAYS` | `60` (1-365) | Lifetime of a new or renewed marketplace listing |
| `MARKETPLACE_EXPIRY_REMINDER_DAYS` | `3` (1-30) | Send the `listing_expiring` notification when an open listing is this close to expiry; must be lower than `MARKETPLACE_LISTING_DAYS` |

The API checks expiring listings hourly. Compose forwards both settings.
Marketplace payments are never processed by Every.music, so there are no
payment-provider settings for listings.

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
SMTP, pool, rate-limit, body-size, application-retention, two-step key,
verification retention, Twilio, media storage, native push, and YouTube feed
settings listed above, plus `APP_VERSION`, the
[scheduled notification settings](#notification-email-and-scheduled-notifications),
and the help center, legal, and client version settings. In Compose,
`S3_ENDPOINT` defaults to the bundled `http://object-store:8333`, `S3_BUCKET` to
`everymusic-media`, and `S3_FORCE_PATH_STYLE` to `true`. Its default
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

The nginx web server sends `Permissions-Policy: geolocation=(self)` so the
optional **Use my location** search can ask the browser for a position, and
the Tauri shell sets the same header. The API keeps `geolocation=()`. If you
serve the web client from another server, allow geolocation for its own
origin in that server's Permissions-Policy, or the feature reports that
location is unavailable and users can still choose a city. Native WebViews may
additionally need platform location permissions (for example a usage
description on Apple platforms); without them the same fallback applies. The
location opt-in itself is stored only in the browser (`localStorage`).

When running the smoke test, use an isolated synthetic database and matching
API: it creates accounts and announcements and deletes its own test user.
See [development](development.md#integration-smoke-test) and
[release delivery](releases.md) for exact commands and output paths.
