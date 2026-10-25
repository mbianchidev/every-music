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
  There is no offline mode or published app-store release.

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
3. Open **Profile**, then **Create profile** or **Edit profile**. Fill in artist
   name, first and last name, city, and biography, then save.
4. Open **Post**. Enter a title (5-255 characters), description (20-5000
   characters), optional city, and whether remote collaboration is welcome.
   Publish to return to **My ads**.
5. Open **Feed** to browse calls. **Save** bookmarks a call; **Saved** lets you
   revisit or remove it. **My ads** lets you delete your own announcements after
   confirmation.
6. Use **Profile > Sign out** to end the session.

The current UI does not provide search filters, pagination controls, announcement
editing/reactions, or instrument/genre/project editors. These and Google ID-token
sign-in are available through the [API](api.md), not corresponding UI controls.
Contact/chat, media uploads, payments, and push notifications are not implemented.
The feed currently displays the first search page.

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
