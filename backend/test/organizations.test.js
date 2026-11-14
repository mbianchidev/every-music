import test from 'node:test';
import assert from 'node:assert/strict';
import {
  effectivePermissions, hasPermission, isCalendarDate, openStreetMapLinks, organizationInputErrors, similarityScore,
} from '../src/engines/organization-model.js';
import { normalizeInput } from '../src/conductors/organization-conductor.js';
import {
  FeedError, assertAllowedFeedUrl, fetchYoutubeFeed, parseYoutubeFeed, youtubeFeedUrl,
} from '../src/engines/youtube-feed.js';
import { OrganizationFeedImporter } from '../src/engines/organization-feed-importer.js';

const channel = 'UCabcdefghijklmnopqrstuv';
const entry = (id, title, published = '2026-01-02T03:04:05+00:00') => `
  <entry><id>yt:video:${id}</id><yt:videoId>${id}</yt:videoId><title>${title}</title>
  <link rel="alternate" href="https://evil.example/${id}"/><published>${published}</published>
  <media:group><media:title>ignored</media:title></media:group></entry>`;
const feed = entries => `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Channel</title>${entries}</feed>`;

function response(body, { status = 200, type = 'application/atom+xml; charset=UTF-8', length } = {}) {
  const bytes = new TextEncoder().encode(body);
  return new Response(bytes, { status, headers: { 'content-type': type, ...(length ? { 'content-length': String(length) } : {}) } });
}

test('leaders and admins hold every permission while members hold only granted ones', () => {
  assert.deepEqual(effectivePermissions('leader'), ['manage_profile', 'manage_members', 'post_announcements', 'manage_calendar']);
  assert.deepEqual(effectivePermissions('admin', []), effectivePermissions('leader'));
  assert.deepEqual(effectivePermissions('member', ['post_announcements', 'unknown']), ['post_announcements']);
  assert.equal(hasPermission({ role: 'member', permissions: [] }, 'manage_profile'), false);
  assert.equal(hasPermission({ role: 'member', permissions: [] }, null), true);
  assert.equal(hasPermission(null, null), false);
});

test('organization input rules reject fields that do not apply to the kind', () => {
  assert.deepEqual(organizationInputErrors('venue', { name: 'Hall', venueType: 'club', capacity: 300 }), []);
  assert.match(organizationInputErrors('band', { capacity: 300 }).join(), /only to venues/);
  assert.match(organizationInputErrors('venue', { formedYear: 2001 }).join(), /only to bands/);
  assert.match(organizationInputErrors('band', { slug: 'mine' }).join(), /Slug/);
  assert.match(organizationInputErrors('band', { slug: 'Bad Slug' }).join(), /Slug/);
  assert.deepEqual(organizationInputErrors('band', { slug: 'the-synthetic-band' }), []);
  assert.match(organizationInputErrors('band', { pictureUrl: 'https://example.test/x.png' }).join(), /organization image/);
  assert.match(organizationInputErrors('band', { latitude: 1 }).join(), /together/);
  assert.match(organizationInputErrors('label', { activeSince: 2010, activeUntil: 2001 }).join(), /end after/);
  assert.match(organizationInputErrors('label', { contactEmail: 'not-an-email' }).join(), /email/);
  assert.match(organizationInputErrors('label', { links: [{ linkType: 'website', url: 'javascript:alert(1)' }] }).join(), /link/);
  assert.match(organizationInputErrors('band', { name: '   ' }).join(), /Name/);
});

test('normalization trims text, blanks optional fields, and canonicalizes identifiers', () => {
  assert.deepEqual(normalizeInput({
    name: '  Synthetic  ', bio: '   ', slug: 'Synthetic-Band', genreIds: ['AAAAAAAA-0000-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000000'],
  }), { name: 'Synthetic', bio: null, slug: 'synthetic-band', genreIds: ['aaaaaaaa-0000-4000-8000-000000000000'] });
});

test('helpers validate calendar dates and build OpenStreetMap links', () => {
  assert.equal(isCalendarDate('2024-02-29'), true);
  assert.equal(isCalendarDate('2023-02-29'), false);
  assert.equal(isCalendarDate('2023-2-1'), false);
  assert.deepEqual(openStreetMapLinks(45.4642, 9.19), {
    map: 'https://www.openstreetmap.org/?mlat=45.464200&mlon=9.190000#map=16/45.464200/9.190000',
    directions: 'https://www.openstreetmap.org/directions?route=%3B45.464200%2C9.190000',
  });
  assert.equal(openStreetMapLinks(null, 9), null);
});

test('similarity favours shared members, then genres, then proximity', () => {
  assert.deepEqual(similarityScore({}), { score: 0, reasons: [] });
  const members = similarityScore({ sharedMembers: 1 });
  const genres = similarityScore({ sharedGenres: 1 });
  assert.ok(members.score > genres.score);
  assert.deepEqual(similarityScore({ sharedGenres: 2, distance: 12 }), {
    score: 6, reasons: [{ reason: 'shared_genres', count: 2 }, { reason: 'nearby' }],
  });
  assert.equal(similarityScore({ distance: 150 }).score, 1);
  assert.equal(similarityScore({ distance: 500 }).score, 0);
  assert.equal(similarityScore({ sameCity: true }).score, 2);
});

test('the YouTube feed URL is fixed to the HTTPS channel endpoint', () => {
  assert.equal(youtubeFeedUrl(channel).href, `https://www.youtube.com/feeds/videos.xml?channel_id=${channel}`);
  for (const value of ['UCshort', `UC${'a'.repeat(21)}/`, '../../etc', 'https://evil.example/', null]) {
    assert.throws(() => youtubeFeedUrl(value), FeedError);
  }
  for (const value of [
    `http://www.youtube.com/feeds/videos.xml?channel_id=${channel}`,
    `https://youtube.com.evil.example/feeds/videos.xml?channel_id=${channel}`,
    `https://www.youtube.com:8443/feeds/videos.xml?channel_id=${channel}`,
    `https://user@www.youtube.com/feeds/videos.xml?channel_id=${channel}`,
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channel}&x=1`,
    `https://www.youtube.com/redirect?channel_id=${channel}`,
  ]) assert.throws(() => assertAllowedFeedUrl(value), FeedError, value);
});

test('the feed parser extracts bounded entries and rebuilds links from video IDs', () => {
  const entries = parseYoutubeFeed(feed(entry('abcdefghijk', 'Live &amp; loud &#x1F3B8; &unknown;') + entry('bad id', 'Skipped')
    + entry('ABCDEFGHIJK', '<![CDATA[Raw <b>text</b>]]>')));
  assert.deepEqual(entries, [
    { videoId: 'abcdefghijk', title: 'Live & loud \u{1F3B8} &unknown;', publishedAt: '2026-01-02T03:04:05.000Z', url: 'https://www.youtube.com/watch?v=abcdefghijk' },
    { videoId: 'ABCDEFGHIJK', title: 'Raw <b>text</b>', publishedAt: '2026-01-02T03:04:05.000Z', url: 'https://www.youtube.com/watch?v=ABCDEFGHIJK' },
  ]);
  assert.equal(parseYoutubeFeed(feed(Array.from({ length: 30 }, (_, i) => entry(`video${String(i).padStart(6, '0')}`, 'x')).join(''))).length, 15);
  assert.throws(() => parseYoutubeFeed(`<!DOCTYPE feed [<!ENTITY x SYSTEM "file:///etc/passwd">]>${feed(entry('abcdefghijk', '&x;'))}`), /document type/);
  assert.throws(() => parseYoutubeFeed('<html></html>'), /Atom/);
});

test('feed fetching refuses redirects, non-XML, oversized bodies, failures, and slow servers', async () => {
  let options;
  const ok = await fetchYoutubeFeed(channel, { fetchImpl: async (url, init) => { options = { url, ...init }; return response(feed(entry('abcdefghijk', 'One'))); } });
  assert.equal(ok.length, 1);
  assert.equal(options.url, `https://www.youtube.com/feeds/videos.xml?channel_id=${channel}`);
  assert.equal(options.redirect, 'error');
  await assert.rejects(fetchYoutubeFeed(channel, { fetchImpl: async () => response('', { status: 302 }) }), /HTTP 302/);
  await assert.rejects(fetchYoutubeFeed(channel, { fetchImpl: async () => response('{}', { type: 'application/json' }) }), /XML/);
  await assert.rejects(fetchYoutubeFeed(channel, { maxBytes: 100, fetchImpl: async () => response(feed(entry('abcdefghijk', 'x'.repeat(200)))) }), /exceeds/);
  await assert.rejects(fetchYoutubeFeed(channel, { maxBytes: 100, fetchImpl: async () => response('<feed/>', { length: 5000 }) }), /exceeds/);
  await assert.rejects(fetchYoutubeFeed(channel, { fetchImpl: async () => { throw new TypeError('redirect not allowed'); } }), /request failed/);
  await assert.rejects(fetchYoutubeFeed(channel, {
    timeoutMs: 20,
    fetchImpl: (url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
  }), /timed out/);
});

test('the importer is disabled without an interval and logs per-band failures without stopping', async () => {
  const disabled = new OrganizationFeedImporter({ config: undefined, connector: { execute: () => assert.fail('no queries') } });
  assert.deepEqual(await disabled.run(), { checked: 0, imported: 0 });
  disabled.start();
  assert.equal(disabled.timer, null);
  const warnings = [];
  const imported = [];
  const importer = new OrganizationFeedImporter({
    config: { youtubeFeedIntervalMinutes: 30 },
    connector: {
      execute: async (sql, values) => {
        assert.match(sql, /SKIP LOCKED/);
        assert.deepEqual(values, [30, 5]);
        return { rows: [{ id: 'a', youtube_channel_id: channel }, { id: 'b', youtube_channel_id: channel }] };
      },
      transaction: async callback => callback({ execute: async () => ({ rows: [] }) }),
    },
    repository: { importYoutubeEntries: async (executor, id, channelId, entries) => { imported.push([id, entries.length]); return entries; } },
    fetchImpl: async () => (imported.length ? response('', { status: 500 }) : response(feed(entry('abcdefghijk', 'One')))),
    logger: { warn: (details, message) => warnings.push([details.organizationId, message]) },
  });
  assert.deepEqual(await importer.run(), { checked: 2, imported: 1 });
  assert.deepEqual(imported, [['a', 1]]);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], 'b');
});
