# AT Protocol / MusicSky exploration

[Documentation index](README.md) | [Architecture](architecture.md)

Exploration for [#68](https://github.com/mbianchidev/every-music/issues/68),
based on the official specifications read on 2026-11-14.
**Recommendation: add an explicit, opt-in public federation adapter later;
do not replace the current private application with public AT repositories.**
MusicSky is a working name, not a claim of a registered service or namespace.
This exploration does not enable federation or publish any user data.

## What the protocol provides

AT Protocol separates account identity (DIDs and movable handles), personal
data servers (PDS), relays that distribute repository updates, and application
views that build discovery/read APIs. Signed repositories contain published
records; they are not a private relational database. Lexicons define shared
record/RPC schemas under reverse-domain NSIDs.

This fits public musician identity and open calls. It does not automatically
provide Every.music's private messages, notification preferences, analytics
consent, moderation workflow, SQL search indexes, or account linking. Bluesky's
`app.bsky.*` product schemas are not the same thing as the underlying protocol.
Custom music records would need an app view that understands them.

| Current data | Possible AT mapping | Boundary |
|---|---|---|
| Public artist name, bio, instruments, genres | A versioned musician-profile Lexicon | Export selected public fields only; exclude email, birth/age, phone and private contacts |
| Published open call | A music-announcement record with city, remote flag and catalog identifiers | Never export drafts; define expiration, edits, deletion and moderation behavior |
| Public project portfolio | A project record, with DID-based collaborator references | Collaborators need consent; an existing SQL user ID is not a DID |
| Announcement images | PDS blob upload and a typed blob reference | Do not export a local API URL as portable media; enforce size/type/rights checks |
| Public comments/reactions/follows | Music-specific records or deliberately compatible public schemas | Publishing makes relationships public; existing private bookmarks remain local |
| Messages, block controls, notification settings | Existing authenticated backend | Do not put private message text or settings in public repos |
| Analytics and push subscriptions | Existing opt-in server aggregates and secret subscription storage | Never federate these records or provider keys |

## A safe architecture

```text
Shared web/native client
    -> existing Fastify API -> PostgreSQL (private state and local read model)
    -> optional federation adapter
         -> AT OAuth / selected PDS -> public music records and blobs
         <- relay/repository updates -> music app-view indexing
```

Keep the current email/Google account and add an explicit verified DID link.
Do not infer ownership by email or handle text: handles can change, while the
DID is the stable identity. Mapping tables would need unique DID/user links,
record URI/CID/revision mappings, export consent, and a transactional outbox.
Publish only after a local transaction commits; retry idempotently and show
pending/failed federation status instead of reporting local success as remote
publication.

Treat imported records as hostile data: validate Lexicons and byte limits,
escape rendering, verify repository/identity provenance through maintained
SDKs, and apply local moderation/block/visibility rules before indexing.
Track relay cursors, handle replays/deletes, bound backfills, and support
rebuilding the public read model without touching private messages.

Local deletion cannot guarantee removal of copies held by remote parties.
Make that consequence visible before users opt in. Keep local removal and
remote tombstones/retries observable. Moderation labels and account migration
are operational requirements, not things a PDS alone solves.

## Authentication is not another Google ID-token flow

The current AT OAuth profile requires authorization code with PKCE, PAR, DPoP
and server-issued nonces, server/client metadata discovery, and account
identity verification of the returned DID. Its `client_id` is a public HTTPS
metadata URL, not a conventional shared client secret. Discovery/PDS requests
need hardened SSRF, redirect, DNS, timeout, and response-size controls.

Use a maintained AT OAuth SDK rather than extending the Google credential
bridge or collecting a user's PDS password. Keep AT session/DPoP material out
of public records and URLs. Browser/native callback and key-storage paths
must be tested separately; do not assume embedded WebView Google behavior
or the present first-party refresh tokens implement AT OAuth.

## Illustrative public record shape

This is design material, not a published/validated Lexicon or a runtime API:

```json
{
  "$type": "com.example.musicsky.announcement",
  "title": "Synthetic ensemble seeks a drummer",
  "description": "A fictional remote collaboration example.",
  "city": "Example City",
  "remote": true,
  "instrumentKeys": ["drums"],
  "genreKeys": ["jazz"],
  "createdAt": "2026-11-14T10:00:00.000Z"
}
```

Choose a domain the project actually controls before defining NSIDs; the
`com.example` placeholder must not be published as a production namespace.
Define stable catalog keys rather than exporting installation-specific UUIDs.
Lexicon evolution is constrained: breaking record changes need a new NSID.
Blob references, DID references, length limits, timestamps, expiration, and
deletion semantics need an actual validated schema before interoperability.

## Bounded next experiment and exit criteria

Use a disposable PDS and synthetic accounts only. First authenticate/link a
DID using the maintained OAuth client, then publish/read/update/delete one
synthetic open call and its blob under a controlled test namespace. Index it
through a small app-view reader and verify replay/idempotence, consent-off
behavior, handle changes, and a deleted record disappearing locally.

Proceed to a product integration only after measuring the hosted services and
storage costs, choosing domain/schema ownership and moderation policy, testing
native callbacks, and defining migration/export/revocation UX. A direct SQL
replacement would require substantially more work without making private
messaging or consent safer. No external PDS, federation account, or real user
publication is needed to complete this exploration.

## Sources

- [Official protocol overview](https://atproto.com/guides/overview):
  DIDs/handles, PDS, relays, app views, portability, and moderation separation.
- [Personal data repositories](https://atproto.com/guides/data-repos):
  published signed records, DIDs, CIDs, NSIDs, and record keys.
- [Lexicons](https://atproto.com/guides/lexicon) and
  [Lexicon specification](https://atproto.com/specs/lexicon):
  custom schemas, namespaces, and evolution constraints.
- [OAuth specification](https://atproto.com/specs/oauth):
  required discovery, metadata, PKCE, PAR, DPoP and account authentication.
  Recheck the live specification before implementation; this profile evolves.
