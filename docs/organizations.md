# Organizations: bands, venues, organizers, agencies, and labels

[Documentation index](README.md) | [API reference](api.md#organizations) | [Usage](usage.md#bands-venues-and-other-pages) | [Architecture](architecture.md)

Organizations are shared pages that several accounts can run together. This
guide describes the data model, permission rules, and extension points that
other features (events, rehearsal calendars, group chat, reviews) build on.

## Kinds and fields

`organizations.kind` is one of `band`, `venue`, `organizer`, `booking_agency`,
or `label`. Every kind has a name, an optional unique `slug` (3-80 lowercase
letters, digits, and single hyphens; pages route by UUID or slug), a bio, a
picture and photos, free-text `city`/`region`/`country` plus optional
`latitude`/`longitude`, genres from the shared catalog, typed links
(`spotify`, `youtube`, `soundcloud`, `bandcamp`, `instagram`, `website`,
`other`), a contact email and phone, "work with us" text, and years of
activity (`active_since`/`active_until`).

- **Venues** add `venue_type` (`disco`, `venue`, `social_center`, `stadium`,
  `club`, `theater`, `other`), `capacity`, `parking_info`, and `directions`.
  Clients build OpenStreetMap map and directions links from the coordinates;
  no map tiles or geocoding service are called by the API.
- **Bands** add `formed_year`, the `open_to_*` flags (tours, live, support
  acts, endorsements), and an optional `youtube_channel_id`.

Location is stored in plain columns so a later places table can reference or
backfill them without a breaking change. Kind-specific columns are guarded by
database checks and rejected by the API for other kinds.

`verified_at` is set only by administrators, either directly or by approving a
verification request that the page leader sends from the page (a note, the
page's daily code, and an optional private document; see the
[API reference](api.md#page-verification-requests)). `managed = false` marks a
community-maintained venue (see below).

Pictures and photos must be images uploaded through `POST /realm/media` with
purpose `organization` by the editing account. They are public while the page
exists (`backend/src/engines/media-references.js`) and are kept by hourly
media cleanup.

## Membership and permissions

`organization_members` stores one row per membership period:

| Column | Meaning |
|---|---|
| `role` | `leader` (exactly one active), `admin`, or `member` |
| `status` | `invited`, `active`, `declined`, `left`, or `removed` |
| `title` | Free text such as "Lead guitar" |
| `permissions` | For members: any of `manage_profile`, `manage_members`, `post_announcements`, `manage_calendar` |
| `joined_on` / `left_on` | Member timeline shown as current line-up and former members |

Leaders and admins hold every permission. Members hold only the listed ones.
`manage_calendar` lets members create and edit the page's events; the calendar
and rehearsal feature can reuse it.

| Action | Requirement |
|---|---|
| Edit profile, photos, releases, similar bands, agency/label requests | `manage_profile` |
| Invite or remove members, edit titles and timelines | `manage_members`; only the leader can invite, remove, or change administrators |
| Change a member's permissions | Leader or admin |
| Promote/demote administrators, transfer leadership, delete the page | Leader |
| Publish updates and announcements for the page | `post_announcements` |
| Create and edit events organized by the page, leave lineups for a band | `manage_calendar` |
| Request page verification | Leader |
| Leave | Any non-leader member; the leader transfers leadership first |

The creator becomes the leader. Invitations notify the invitee
(`organization_invitation`), who accepts or declines from **Your pages**.
Leaving or removal closes the period with `left_on`; rejoining creates a new
row, so the timeline keeps every period. Leadership transfer makes the old
leader an admin.

### Reusable permission check

Use one call inside your transaction for every organization-scoped feature:

```js
import { organizationRepository } from '../repositories/organization-repository.js';

await realmConnector.transaction(async executor => {
  const access = await organizationRepository.requireMember(
    executor, organizationId, userId, 'manage_calendar', { lock: true },
  );
  // access = { organization: { id, kind, name, slug, managed, createdBy },
  //            memberId, role, title, permissions }
});
```

It throws 404 `ORGANIZATION_NOT_FOUND` for missing or deleted pages and 403
`ORGANIZATION_PERMISSION_REQUIRED` when the permission is missing. Pass `null`
for "any active member". `{ lock: true }` takes a row lock on the organization
to serialize concurrent changes. `organizationRepository.managerIds(executor,
id, permission)` returns active members holding a permission, for example to
notify them. `effectivePermissions` and `hasPermission` in
`backend/src/engines/organization-model.js` apply the same rules without the
database.

## Plans and community-maintained venues

Bands are always free. Creating a managed venue, organizer, booking agency, or
label page needs the `businessPages` plan limit, which is true for every plan
unless `PARTNER_PLAN_REQUIRED=true`. Artists and music lovers remain free users.

Anyone can add a venue as **community-maintained** (`managed = false`, no
plan needed). It has no members; only its creator can edit it, acting as
`maintainer` with `manage_profile`. It cannot publish updates or
announcements. Pages can be reported with the existing report flow, which
targets the leader or, for community venues, the creator.

A venue's operator requests to claim it (`organization_claims`, needs
`businessPages`). Administrators approve or reject claims; approval makes the
claimant the leader, marks the page managed, rejects other pending claims, and
notifies claimants (`organization_claim`). Decisions are recorded in the
admin audit log as `organization_claim_approved`/`organization_claim_rejected`;
verification changes as `organization_verified`/`organization_unverified`.

## Relations, similar bands, releases, and updates

- **Rosters and signings** (`organization_relations`): a booking agency
  (`roster`) or label (`label`) proposes a band. A band member with
  `manage_profile` accepts or declines; only accepted relations are public.
  Either side can end one.
- **Similar bands** ("for fans of"): bands pick up to ten others manually.
  Suggestions score other bands by shared current or former members (3 points
  each), shared genres (2 each), and proximity (same city or within 50 km: 2;
  within 200 km: 1). Spotify's related-artist data is not used because it
  requires API credentials.
- **Releases** (`single`, `ep`, `lp`, `album`) with a date and up to six links.
- **Updates feed** (`organization_posts`): manual posts by members with
  `post_announcements`, a post for each new release, and videos imported from
  the band's public YouTube channel feed. Followers are notified with kind
  `organization_update`. Only manual updates can be deleted; release posts
  follow their release, and imported videos stay so they are never re-imported
  or announced twice.

### YouTube import

A background job in each API process (`OrganizationFeedImporter`) runs every
minute and fetches bands whose feed was not checked within
`YOUTUBE_FEED_INTERVAL_MINUTES` (default 60; 0 disables it). Due bands are
leased with `FOR UPDATE SKIP LOCKED` so replicas do not fetch the same
channel twice. Requests go only to
`https://www.youtube.com/feeds/videos.xml?channel_id=<ID>`: the channel ID is
validated, redirects are refused, requests time out after 10 seconds, bodies
are capped at 1 MiB, and at most 15 entries are read. The parser rejects
document type and entity declarations, never resolves external entities, and
rebuilds video links from validated video IDs. Videos are deduplicated per
band; videos published before the channel was linked are imported without
notifications. Failures are logged and retried at the next interval.

Spotify, SoundCloud, Bandcamp, and other services are not imported
automatically: they need credentials or have no stable public feed. Post an
update or add a release instead.

## Follows, announcements, and music lovers

Anyone can follow a page (`organization_followers`); **Your pages** lists
updates from followed pages. Announcements can be published on behalf of a
managed page by a member with `post_announcements` (`announcements.organization_id`).
The author still owns and edits the announcement; cards and details show the
page, the page lists its open announcements, and page followers are notified.

`profiles.account_kind` is `artist` (default) or `music_lover`. Music lovers
skip instruments and projects; their profile shows bio, contacts, followed
pages and artists, and an events placeholder. `profiles.follows_visible`
(default true) lets anyone hide their follow lists from others.

## Extension points

- `frontend/src/components/PastAndNextEvents.jsx` renders the "Next events"
  and "Past events" sections for a page (events it organizes, performs in, or
  hosts) or a profile (performances and events the person goes to and shows),
  from `GET /realm/gigs/organizations/:id` and `/realm/gigs/profiles/:id`.
- `manage_calendar` grants event management for the page.
- `organizationRepository.requireMember` and `managerIds` are the supported
  way to authorize and notify organization members.
