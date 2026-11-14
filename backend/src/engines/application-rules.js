import { requestError } from './request-error.js';
import { InputValidator } from '../validators/input-validator.js';

export const OWNER_STATUSES = ['new', 'shortlisted', 'accepted', 'declined'];
export const NOTIFIED_STATUSES = ['shortlisted', 'accepted', 'declined'];
export const APPLICATION_LINK_TYPES = ['spotify', 'youtube', 'soundcloud', 'bandcamp', 'website', 'other'];
export const APPLICATION_DAILY_LIMIT = 20;
export const MAX_APPLICATION_LINKS = 5;
export const MAX_APPLICATION_INSTRUMENTS = 20;
export const DEFAULT_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

// SQL predicate for an announcement that no longer accepts replies. `a` is the
// announcements row and `o` its owner's users row.
export function announcementClosedSql(a = 'a', o = 'o') {
  return `(${a}.is_deleted IS TRUE OR ${a}.is_published IS NOT TRUE
    OR (${a}.expires_at IS NOT NULL AND ${a}.expires_at <= NOW())
    OR ${o}.is_active IS NOT TRUE OR ${o}.is_deleted IS TRUE)`;
}

// Applicants see "closed" once the call stops accepting replies, whatever the
// owner's private pipeline status was.
export function applicantStatus(status, isClosed) {
  if (status === 'withdrawn') return 'withdrawn';
  return isClosed ? 'closed' : status;
}

export function retentionEndsAt(closedAt, retentionDays, now = new Date()) {
  const start = closedAt ? new Date(closedAt) : now;
  return new Date(start.getTime() + retentionDays * DAY_MS).toISOString();
}

export function statusNotificationTitle(status) {
  return {
    shortlisted: 'Your application was shortlisted',
    accepted: 'Your application was accepted',
    declined: 'Your application was declined',
  }[status];
}

export function normalizeApplication({ message, instrumentIds = [], links = [] }) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) throw requestError(400, 'VALIDATION_ERROR', 'Write a message for the announcement owner');
  if (text.length > 4000) throw requestError(400, 'VALIDATION_ERROR', 'Messages can have at most 4000 characters');
  const ids = [...new Set((instrumentIds ?? []).map(id => String(id).toLowerCase()))];
  if (ids.length > MAX_APPLICATION_INSTRUMENTS || ids.some(id => !InputValidator.validateUuid(id, 'Instrument ID').valid)) {
    throw requestError(400, 'VALIDATION_ERROR', `Choose at most ${MAX_APPLICATION_INSTRUMENTS} instruments from the announcement`);
  }
  const list = links ?? [];
  if (!Array.isArray(list) || list.length > MAX_APPLICATION_LINKS || !InputValidator.validateLinks(list).valid) {
    throw requestError(400, 'VALIDATION_ERROR', `Add at most ${MAX_APPLICATION_LINKS} HTTP or HTTPS links`);
  }
  return {
    message: text,
    instrumentIds: ids,
    links: list.map(link => ({ linkType: link.linkType || 'other', url: link.url.trim() })),
  };
}

export function normalizeOwnerNote(note) {
  if (note === undefined) return undefined;
  const text = note.trim();
  return text ? text : null;
}
