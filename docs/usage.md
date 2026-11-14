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

### Reply to calls and review applicants

On someone else's open call, **Apply to this call** opens a reply form. Write a
message, optionally tick the instruments from the call you can cover, and add up
to five links to demos or your website. The form says it plainly: the owner sees
your message, and it is stored on Every.music without end-to-end encryption.
Use Messages for anything private. You can send one active reply per call;
**Withdraw application** removes it from the owner's view and lets you reply
again while the call is open. Blocked musicians cannot reply to each other.

**Applications** in the navigation has two views. **Sent** lists your replies
with their status: Sent, Shortlisted, Accepted, Declined, Withdrawn, or Closed
when the call was deleted, unpublished, or expired. **Received** is the owner
dashboard across all your calls. Filter by call, status, or the instrument an
applicant can cover, and sort by newest or oldest. Each applicant shows their
name, picture, city, and profile instruments, plus their message and links.
Change the status, keep a private note only you can see, or choose
**Message applicant** to open the encrypted conversation. Open the dashboard
for one call from **Applicants** in **My calls** or **Review applications** on
your announcement page. Applicants are notified when you shortlist, accept, or
decline them, and you are notified about each new reply.

When a call closes, its applications stay readable to you for 90 days by
default (`APPLICATION_RETENTION_DAYS`); the dashboard shows the exact date.
Status changes are off for closed calls, but notes still work. After the
retention period the applications are deleted automatically.

### Places, contacts, plans and saved searches

**City** fields suggest cities as you type, including common local names such
as "Milano" or "Den Haag"; use the arrow keys and Enter, or click a
suggestion. Choosing a city also records its region, country and approximate
coordinates. You can still type a town that is not listed; it is shown as
written but cannot be found by distance, region or country.

Edit profile also has **Age**, **Open to new projects**, contact details
(Telegram, WhatsApp, Signal, phone and a personal website) with a **Who can
see your contacts** choice, and up to 20 music and social links. Contacts are
never shown to people who are not signed in. Your profile also shows as open
to new projects automatically while you have an active published call. On the
free plan other musicians see your first three links and three projects; you
always see everything, with a note when something is hidden.

The call editor has an **Expiration date**. The free plan keeps a call online
for up to 30 days and fills that date in for you; Premium can leave it empty.
It also shows how many active calls you have. The free plan allows five active
calls and ten saved calls at a time; the editor and Saved list show what is
left, and a clear message explains when a limit is reached. **My calls** has
**Publish** and **Unpublish** buttons so you can pause a call instead of
deleting it.

In **Filters and sorting**, choose **Near city** and a **Distance**, or a
**Country** and **Region**, then sort by **Nearest first**. Calls also filter
by **Cover band**, and musicians by **Availability** (open to new projects).
To search near your current position, first turn on **Use my location for
nearby searches** in Settings, then choose **Use my location**. Your browser
asks for permission; the position is rounded to about 1 km, used only for
those results and never saved.

**Save this search** keeps the current feed filters in **Saved searches** and
notifies you when a newly published call matches. A saved "near me" search
stores the nearest city, not your position. The free plan keeps one saved
search; turn its notifications off or delete it from Saved searches.

Only you see the likes, dislikes and statistics of your own calls; other
members see only their own reaction. Views, saves and the **Analytics** screen
need Premium; the free plan explains this instead. **Who visited your profile**
on your profile lists, with Premium, members who visited in the last 30 days
and chose to be shown. That choice is **Show me to musicians whose profiles I
visit** in Settings, off by default; turning it off deletes your recorded
visits.

**Block musician** on a profile hides each of you from the other's search
results, removes follows between you, and hides your calls from them. Manage
blocked musicians in Settings. Reports also accept **Inappropriate language**
and **Fake profile using other people's photos**. City data comes from
[GeoNames](https://www.geonames.org/) under CC BY 4.0.

### Messages and notifications

Use **Send message** on a musician profile. Conversation history survives
reload. First generate and save a recovery key in Messages; both musicians need
messaging keys before a new message can be sent. Unlock with the saved recovery
key after reload or on another device. Sign-in/password recovery cannot replace
it. Compare fingerprints through another channel for independently verified
key identity; changed fingerprints block trust until explicitly compared.
Sending a failed draft again does not duplicate the message. Opening
the newest messages marks the conversation and its message alerts read.
Archive to hide a conversation, show archived conversations to restore it,
or block a musician to prevent either participant sending new messages.
New messages restore archived conversations. Removing your own message
replaces its text for both participants; recipients cannot remove your text.

New messages are end-to-end encrypted before upload. Legacy history is explicitly
labelled and may remain plaintext in the database/backups. Recipients can
deliberately share a selected decrypted message with an abuse report.
There is no forward-secrecy ratchet or independent cryptographic audit; use a
trusted HTTPS deployment and protect your devices/recovery keys. See the full
[security model, recovery and administration guide](messaging-security.md).

Use **Report musician** or **Report message** to submit a concern. Review exactly
what you are sharing and explicitly consent; report details/selected messages
are readable by administrators. **Your reports** shows their status.
Administrators see a report queue, can remove reported messages or suspend
member accounts, and have an audited report-access/action log. Admin roles are
operator-managed, with no default administrator or private-chat browsing.

**Follow musician** opts into their new-announcement alerts, subject to your
notification preferences, and notifies the musician once. Profiles show
follower and following counts. Notifications also include messages, comments,
reactions, and optional daily profile-view alerts. The notification center has
read controls and pagination. Settings controls categories and optional
browser push; permission is requested only when you choose to enable it.
Push is generic and excludes message text. Configure the
[optional providers](configuration.md#browser-push-and-live-updates) first.

Under **Notification channels** in Settings (or **Manage notification settings**
in the notification center), choose for each type of notification whether it
appears in the app, as browser push, or by email. Some types are not available
on every channel; those options are disabled and marked "not available". The
category switches above the channels still turn a whole category off. Email goes
to your verified account address, is written in your chosen language, and
never contains message text or other private content; every email links back to
these settings. Optional weekly statistics digests need analytics consent and a
plan that includes statistics. Inactive accounts may get a few "we miss you"
reminders by email, and new accounts get one in-app reminder to invite friends.
Choices apply to notifications created after you save them.

### Marketplace, lessons, and hiring

Open **Marketplace** in the navigation (on mobile, under **More**). Its tabs
separate **Gear** (instruments and equipment for sale or wanted), **Lessons**
(lessons and coaching), **Services and hire** (sound engineers, drivers,
security, tour managers, light technicians, booking agencies, designers, video
makers, social media managers, coaches, or what you want to hire), and
**Endorsements** (sponsorship and endorsement offers from instrument
companies). Search by keyword and open **Filters and sorting** for type,
category, condition, price range and currency, location, remote/online,
shipping, instrument, genre, and sort order. The URL keeps filters and page.

Choose **New listing**, pick what you are listing, its category, title,
description, and price: a fixed amount, a negotiable amount, free, or contact
for price, in any ISO 4217 currency. Lessons and services also state whether
the amount is per hour, session, day, or project. Add an optional location and
map coordinates, remote/online or shipping availability, up to eight photos
(the first is the cover; reorder or remove them before saving), and instrument
or genre tags. Listings stay up for 60 days by default.

On a listing, **Contact** opens an end-to-end encrypted conversation with the
lister and pre-fills a draft that links to the listing. **Save** adds it to
**Saved listings**, and **Report listing** sends a concern to administrators;
its status appears in **Your reports**. **My listings** shows all your
listings, including expired and moderated ones. From a listing you own you can
edit it, mark it reserved, sold (gear for sale) or closed, reopen it, renew it
for another listing period, or delete it. Sold, closed, and expired listings
leave search results; you get a notification a few days before a listing
expires.

Every.music does not process marketplace payments, hold money, offer buyer
protection, or resolve disputes. Agree on payment, delivery, and terms directly,
follow the safety tips shown on every listing, and report suspicious listings.
Administrators can remove a listing from the marketplace report queue (in
**Administration > Reports**) or from the listing itself; removals are
recorded in the audit log and notify the lister and reporters.

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

Platform analytics is a separate default-off opt-in in Settings. It requires
both musicians' personal and platform consent for new activity. The admin
overview shows aggregate activity/public-call reach and operational account
totals, not individual visitors or private messages. Existing personal history
is not imported into it. Turning platform analytics off stops new contributions
and clears totals for your own content; anonymous prior contributions to other
content are not individually traceable.

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

### Security, privacy, and verification

Open **Settings** and scroll to **Security**:

- **Two-step verification** adds a second sign-in step for email/password and
  Google sign-in. Choose **Set up two-step verification**, pick a method, and
  confirm with your current password (accounts without a password receive an
  emailed confirmation code). For an **Authenticator app**, scan the QR code or
  type the setup key, then enter the 6-digit code. **Email code** appears when
  the server can send mail and **Text message (SMS)** when an SMS provider is
  configured; your phone number is stored only while SMS is on. Save the ten
  recovery codes you are shown: each signs you in once if you lose your second
  step, and they are never shown again. Creating new recovery codes or turning
  two-step verification off asks for your password and a current code.
- At sign-in, enter the code from your app, email, or text message, or choose
  **Use a recovery code instead**. **Send a new code** resends email/SMS codes.
  A sign-in attempt expires after 10 minutes or five wrong codes; ten wrong
  codes in 15 minutes pause two-step sign-in for that account for 15 minutes.
  Password recovery does not bypass the second step.
- **Sign out of all devices** ends every session, including this browser, and
  turns off push notifications everywhere.
- **Download my data** saves a JSON file with your account, profile,
  announcements, comments, reactions, follows, notifications, reports you filed,
  and activity. It leaves out other people's private data and encrypted message
  contents, which only your devices can read. You can download it three times
  per hour.

Under **Privacy**, **Let people who have my email address find me** is off by
default. **Find people you know** accepts pasted email addresses, or contacts
chosen with your browser's contact picker where available. Your browser sends
only SHA-256 hashes of the addresses; matches are limited to people who opted
in, and nothing you search for is stored. Phone numbers are not used. Camera and
file access is used only when you pick an image to upload; image metadata is
removed and nothing else on your device is read.

To get the blue tick, open **Profile** and find **Verification**. Write the
code shown for today on paper, take a selfie holding it, add an optional
document scan, and choose **Request verification**. The photos are visible
only to you and administrators. An administrator compares them with your
profile, then approves or rejects the request with a note you can read. Photos
are deleted a few days after the decision (seven by default) or right away if
you cancel. Verified profiles show a blue tick on profile pages, musician cards,
and announcements. There is no automated face recognition or third-party
identity check, so the tick means an administrator reviewed the photos, not
that a legal identity was proven. Administrators review requests under
**Administration > Overview > Verification requests**; opening photos is
recorded in the audit log.

### Delete your account

**Settings > Security > Delete account** permanently deletes your account after
you confirm with your password (or an emailed code if you sign in only with
Google) and a two-step code when that is on. It cannot be undone, and all your
sessions end immediately. A confirmation email is sent when mail is configured.

- Deleted: your account, profile, projects, announcements, comments, reactions,
  saved items, follows, blocks, notifications, preferences, analytics totals,
  uploaded images, messaging keys and backups, two-step settings, and
  verification requests.
- Conversations: each conversation belongs to exactly two people, so your
  conversations and all their messages are removed for both participants.
  Copies already decrypted or exported on the other person's device cannot be
  recalled.
- Other people's content: you are removed from their project collaborator
  lists, and their like counters are recalculated.
- Reports filed by you or about you are removed. Administrator audit entries
  keep only the action and time; their actor or target IDs no longer lead to an
  account. They expire after 365 days.
- Anonymous aggregate counts you contributed to other people's analytics stay,
  because they cannot be traced back to you. Operator backups expire on their
  normal schedule.

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
| Two-step code is rejected | Check the device clock for authenticator apps, request a new email/SMS code, or use a recovery code; codes cannot be reused |
| Lost two-step device and recovery codes | Contact the operator, who can reset two-step verification after confirming your identity |

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
announcements. Members can delete their accounts in Settings; hosts remain
responsible for database retention and backups.
