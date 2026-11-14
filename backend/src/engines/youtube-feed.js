import { YOUTUBE_CHANNEL_PATTERN } from './organization-model.js';

// Outbound requests go only to this fixed HTTPS endpoint. Users choose a
// channel ID (validated against YouTube's format), never a URL.
const FEED_ORIGIN = 'https://www.youtube.com';
const FEED_PATH = '/feeds/videos.xml';
export const FEED_DEFAULTS = { timeoutMs: 10000, maxBytes: 1024 * 1024, maxEntries: 15 };

export class FeedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FeedError';
  }
}

export function youtubeFeedUrl(channelId) {
  if (typeof channelId !== 'string' || !YOUTUBE_CHANNEL_PATTERN.test(channelId)) throw new FeedError('Invalid YouTube channel ID');
  const url = new URL(FEED_PATH, FEED_ORIGIN);
  url.searchParams.set('channel_id', channelId);
  return assertAllowedFeedUrl(url.href);
}

export function assertAllowedFeedUrl(value) {
  const url = new URL(value);
  if (url.origin !== FEED_ORIGIN || url.pathname !== FEED_PATH || url.username || url.password || url.hash
    || [...url.searchParams.keys()].join() !== 'channel_id' || !YOUTUBE_CHANNEL_PATTERN.test(url.searchParams.get('channel_id'))) {
    throw new FeedError('Only the YouTube channel feed endpoint may be requested');
  }
  return url;
}

async function readCapped(body, maxBytes) {
  if (!body) return '';
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let size = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new FeedError(`Feed exceeds ${maxBytes} bytes`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function fetchYoutubeFeed(channelId, {
  fetchImpl = globalThis.fetch.bind(globalThis),
  timeoutMs = FEED_DEFAULTS.timeoutMs,
  maxBytes = FEED_DEFAULTS.maxBytes,
  maxEntries = FEED_DEFAULTS.maxEntries,
} = {}) {
  const url = youtubeFeedUrl(channelId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(url.href, {
        method: 'GET', redirect: 'error', signal: controller.signal, credentials: 'omit',
        headers: { accept: 'application/atom+xml, application/xml;q=0.9, text/xml;q=0.8' },
      });
    } catch (error) {
      throw new FeedError(controller.signal.aborted ? 'YouTube feed request timed out' : `YouTube feed request failed: ${error.message}`);
    }
    if (response.status !== 200) {
      await response.body?.cancel?.().catch(() => {});
      throw new FeedError(`YouTube feed returned HTTP ${response.status}`);
    }
    if (!/\bxml\b/i.test(response.headers.get('content-type') || '')) throw new FeedError('YouTube feed did not return XML');
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) throw new FeedError(`Feed exceeds ${maxBytes} bytes`);
    let text;
    try {
      text = await readCapped(response.body, maxBytes);
    } catch (error) {
      if (error instanceof FeedError) throw error;
      throw new FeedError(controller.signal.aborted ? 'YouTube feed request timed out' : 'YouTube feed could not be read');
    }
    return parseYoutubeFeed(text, maxEntries);
  } finally {
    clearTimeout(timer);
  }
}

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decodeText(value) {
  let text = value.trim();
  if (text.startsWith('<![CDATA[') && text.endsWith(']]>')) text = text.slice(9, -3);
  else {
    text = text.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,4});/gi, (match, entity) => {
      if (entity[0] !== '#') return Object.hasOwn(ENTITIES, entity) ? ENTITIES[entity] : match;
      const code = entity[1] === 'x' || entity[1] === 'X' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : '';
    });
  }
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
}

// Returns the text of the first <name> element in `block`, without parsing
// nested markup. Matching is index-based to keep it linear in input size.
function elementText(block, name) {
  let from = 0;
  for (;;) {
    const open = block.indexOf(`<${name}`, from);
    if (open === -1) return '';
    const next = block[open + name.length + 1];
    from = open + 1;
    if (next !== '>' && next !== ' ' && next !== '\n' && next !== '\t' && next !== '\r') continue;
    const start = block.indexOf('>', open);
    if (start === -1 || block[start - 1] === '/') return '';
    const close = block.indexOf(`</${name}>`, start);
    return close === -1 ? '' : block.slice(start + 1, close);
  }
}

// A deliberately small Atom reader for YouTube's public channel feed. It never
// resolves external entities or document type declarations: feeds that
// contain them are rejected rather than parsed.
export function parseYoutubeFeed(xml, maxEntries = FEED_DEFAULTS.maxEntries) {
  if (typeof xml !== 'string') throw new FeedError('Feed body must be text');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new FeedError('Feeds with document type declarations are refused');
  if (!xml.includes('<feed')) throw new FeedError('Not an Atom feed');
  const entries = [];
  let cursor = 0;
  while (entries.length < maxEntries) {
    const start = xml.indexOf('<entry', cursor);
    if (start === -1) break;
    const end = xml.indexOf('</entry>', start);
    if (end === -1) break;
    const block = xml.slice(start, end);
    cursor = end + '</entry>'.length;
    const videoId = decodeText(elementText(block, 'yt:videoId'));
    const publishedAt = new Date(decodeText(elementText(block, 'published')));
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || Number.isNaN(publishedAt.getTime())) continue;
    entries.push({
      videoId,
      title: decodeText(elementText(block, 'title')).slice(0, 255) || 'New video',
      publishedAt: publishedAt.toISOString(),
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }
  return entries;
}
