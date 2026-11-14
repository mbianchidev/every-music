# Installation and usage

[Documentation index](README.md) | [Configuration](configuration.md) | [Operations](deployment.md)

## Choose a setup

- **Web/self-hosted:** use the [README quickstart](../README.md#quick-start-with-docker-compose).
  It requires Git, a Docker engine with Compose v2, and authenticated SMTP.
  Containers supply Node.js and PostgreSQL; no Rust toolchain is needed.
- **Development:** use [local development](development.md). It needs Node.js
  26.12.1 (22.12+ minimum) and PostgreSQL 16.
- **Native client:** use a verified [CI development bundle or source build](releases.md).
  The API URL is embedded when building, and a backend is always required.
  Native shells require the API; offline web/PWA support is described below.
  There is no published app-store release.

The shell examples use a POSIX shell. Windows users can use WSL for Compose and
the web stack; native Windows packaging uses Node.js, Rust, and the Windows
toolchain as described in the release guide.

## Install and verify the web stack

From a clone of this repository:

```bash
cp .env.example .env
```

Edit `.env` before running anything. Use a strong database password, two distinct
random signing keys of at least 32 characters, and working SMTP credentials.
Keep the web origin first in `PORTAL_ORIGINS`; email links use this first entry.
Use `http://localhost` for the default local web setup. Never commit `.env`.

```bash
docker compose build --no-cache
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:8080/health/ready
curl --fail http://localhost/healthz
```

Wait for all three services to be healthy. API readiness reports
`"status":"ready"` when PostgreSQL is reachable; the web probe returns `ok`.
Open <http://localhost>. If port 80, 8080, or 5432 is occupied, change the
[Compose host ports](configuration.md#compose-settings) before starting.

A new database volume receives the schema and instrument/genre catalogs.
No users or announcements are seeded. Existing databases receive tracked
migrations when the API container starts.

## First useful workflow

1. Choose **Create an account**. Use an email address that can receive verification
   mail. Passwords need at least eight characters, uppercase, lowercase, and a number.
2. Follow the email verification link, then sign in. If it expires or delivery
   fails, attempt sign-in and use **Resend verification email**.
3. Open **Profile**, then **Complete profile** or **Edit profile**. Fill in your
   identity, city, biography, image, instruments/experience, and genres, then save.
4. Open **Post**. Enter a title (5-255 characters), description (20-5000
   characters), optional city, and whether remote collaboration is welcome.
   Add optional instruments, genres, images, and music links. Publish to open
   the announcement detail, or uncheck publishing to keep a private draft.
5. Open **Feed** to browse calls. **Save** bookmarks a call; **Saved** lets you
   revisit or remove it. **My calls** lets you edit or delete your announcements.
6. Use **Profile > Sign out** to end the session.

### Discover and collaborate

Desktop navigation lives in the left sidebar. On mobile, Feed, Musicians,
Post, and Messages stay in the bottom bar; **More** opens the remaining sections.
Close that menu with its close button, Escape, or the backdrop.

Feed and Musicians have keyword, city, instrument, genre, date, and sorting controls.
Open **Filters and sorting** to show the advanced controls on any screen size.
**Date posted** (calls) and **Joined** (musicians) select the past 7 or 30 days,
or any time. The feed also filters remote/local collaboration. Results update after a short
typing pause; Previous/Next controls load bounded pages. The URL preserves
search filters and page on reload. Cards show the actual creator, instruments,
genres, and location so you can compare results before opening a detail.
Open a title or musician name for details.

Announcement details include the creator, links, reactions, comments, saving,
sharing, and a contact route to private messaging. Only owners can edit/delete
announcements; commenters and announcement owners can remove comments.
**Save** and **Saved** on a call toggle its bookmark; the Saved list also offers
an explicit Remove action.
Drafts and expired calls are not visible to other users. Shared deep links
return to the requested detail after sign-in.

In Edit profile, the separate **Musical projects** form creates, edits, and
removes projects with music links, collaborator search, and individual roles.
Projects save independently of the profile form. Profile and announcement
images accept JPEG/PNG up to 2 MiB and 16 megapixels. Preview before saving;
uploads are rotated, resized to at most 1280 pixels, converted to WebP, and
stripped of metadata. Published images are public.

### Messages and notifications

Use **Send message** on a musician profile. Conversation history survives
reload. Sending a failed draft again does not duplicate the message. Opening
the newest messages marks the conversation and its message alerts read.
Archive to hide a conversation, show archived conversations to restore it,
or block a musician to prevent either participant sending new messages.
New messages restore archived conversations. Removing your own message
replaces its text for both participants; recipients cannot remove your text.

Messages are private to the participants at the API boundary, but are **not
end-to-end encrypted**. The host/database administrator can access stored text.
Use a trusted HTTPS host and do not send secrets.

**Follow musician** opts into their new-announcement alerts, subject to your
notification preferences. Notifications also include messages, comments,
reactions, and optional daily profile-view alerts. The notification center has
read controls and pagination. Settings controls categories and optional
browser push; permission is requested only when you choose to enable it.
Push is generic and excludes message text. Configure the
[optional providers](configuration.md#browser-push-and-live-updates) first.

### Themes, analytics, and installation

The **Color theme** control offers System, Light, and Dark. An explicit choice
persists in this browser; System follows OS changes.

Analytics is off by default. Enable it in Settings to count mutually opted-in
profile/announcement views, likes, saves, and received messages. The dashboard
shows daily totals and per-announcement reach for 30 days, not unique visitors
or all traffic. It stores no viewer identity, IP address, or message body in
analytics. Turning it off deletes your daily report totals. Existing public
announcement counters, messages, reactions, and bookmarks are not deleted by
analytics opt-out.

The production web build is installable using **Install app**, when offered,
or your browser's Install/Add to Home Screen menu. Its manifest supplies the
app icon, standalone display, and launch colors. Native shells do not register
this service worker. Google sign-in is optional in the web client; see
[provider setup](configuration.md#google-web-sign-in).

The PWA saves only its static shell in the service-worker cache. The current
tab can additionally retain the last matching feed page for up to 24 hours,
scoped to the signed-in account. Offline results are explicitly labelled and
read-only. There is no offline messaging, profile cache, or automatic mutation
queue. Failed submissions retain the open form; reconnect and submit again.
Signing out clears saved feed results and unsubscribes this browser from push.
An **Update app** control appears when a newer shell is ready; finish editing
before choosing it, because accepting an update reloads the app.

## Sessions and password recovery

The client stores its session in browser `sessionStorage`. A page reload can
restore it within that browser session; it is not a persistent offline login.
Access tokens default to 30 minutes and revocable refresh sessions to 30 days.
The client shares a single refresh request when concurrent API requests expire.
Network failures preserve local session state; confirmed authentication failures
clear it.

Use **Forgot your password?** on sign-in, then follow the emailed reset link.
Reset links expire after one hour; verification links after 24 hours. Password
reset revokes the account's refresh sessions. Never share reset links or tokens.

## Troubleshooting

| Symptom | Check |
|---|---|
| Compose reports a missing variable | Fill in `.env` using [configuration](configuration.md); the example values are not working secrets |
| API not ready | Inspect `docker compose logs realm-store realm-nexus`; check PostgreSQL credentials and migration failures |
| Registration works but sign-in says unverified | Verify SMTP and resend verification; registration is retained when email delivery fails |
| Email links point to the wrong host/port | Correct the first `PORTAL_ORIGINS` entry and request a new link |
| Native client cannot connect | Confirm its embedded absolute API URL ends in `/realm`, and check API CORS and native CSP |
| API returns 429 | Wait for the configured rate window; review shared proxy traffic and rate-limit settings |
| UI reports a network error | Check API reachability, `/realm` proxying, browser console/network logs, and allowed origins |
| Live updates reconnect repeatedly | Check `/realm/events`, proxy buffering/timeouts, account session, and connection limits |
| Push is unavailable | Check HTTPS, production build/service worker, VAPID keys, browser support and permission; iOS needs Home Screen installation |
| Google button is missing or fails | Configure the web client ID and exact authorized origins; use Retry Google sign-in after the five-minute challenge expires |
| Uploaded image is rejected | Use a real JPEG/PNG under 2 MiB/16 megapixels; animated and renamed non-image files are rejected |
| No offline feed copy is available | Reopen the last matching feed in the same signed-in tab, or reconnect; private APIs and other search pages are not cached |
| Changes to `.env` do not apply | Run `docker compose up -d` to recreate changed services; `restart` alone does not reload container environment |

API readiness only checks PostgreSQL. It does not prove SMTP, external identity
providers, or a client connection works. See [operations](deployment.md) for
health checks and structured logging.

## Upgrades, stopping, and uninstalling

Back up PostgreSQL and verify a restore before an upgrade. Review migrations;
then follow the [upgrade procedure](deployment.md#upgrading). Do not rerun the
development bootstrap against an existing database.

```bash
docker compose down
```

This stops/removes this Compose stack's containers and network, not its data.
The named volume `everymusic-realm-volume` remains and is reused on the next
start. Do not remove it or use volume-removal flags unless you deliberately
intend to erase the database and have a verified backup.

Uninstalling a native client does not remove server-side profiles or
announcements. The current UI has no account-deletion workflow. Hosts are
responsible for database retention, backups, and any data-removal process.
