import english from '../locales/en/notifications.js';

const PLACEHOLDER = /\{(\w+)\}/g;

export const NOTIFICATION_CHANNELS = ['inApp', 'push', 'email'];

const GROUPS = [
  ['messages', ['message', 'message_request']],
  ['activity', ['comment', 'reaction', 'profile_view', 'new_follower']],
  ['following', ['announcement']],
  ['statistics', ['announcement_stats', 'profile_stats']],
  ['community', ['events', 'offers', 'event_published', 'event_lineup', 'event_reminder', 'event_communication']],
  ['account', ['report_reviewed', 'invite_friends', 'come_back', 'app_update_minor', 'app_update_major']],
  ['wallet', ['points_earned', 'subscription_started', 'subscription_ended', 'payment_failed']],
  ['bands', ['band_message', 'calendar_invite', 'calendar_reminder']],
  ['reviews', ['review_received', 'review_approved']],
  ['applications', ['application_received', 'application_status', 'saved_search_match']],
  ['marketplace', ['listing_expiring', 'listing_removed']],
  ['pages', ['organization_invitation', 'organization_membership', 'organization_update', 'organization_relation', 'organization_claim']],
  ['trust', ['security_alert', 'verification_requested', 'verification_decided', 'support_reply']],
];

// Params whose value picks a localized `cases` title, mirroring the server's
// NOTIFICATION_SELECTORS. Other values keep the kind's generic title.
const SELECTORS = {
  application_status: ['status'],
  security_alert: ['event'],
  verification_requested: ['subjectType'],
  verification_decided: ['decision'],
  organization_membership: ['response', 'change'],
  organization_relation: ['status'],
  organization_claim: ['outcome'],
  event_communication: ['communicationKind'],
  calendar_invite: ['change'],
};

export const knownNotificationKind = kind => typeof kind === 'string' && Object.hasOwn(english.kinds, kind);

function placeholders(template) {
  return [...String(template ?? '').matchAll(PLACEHOLDER)].map(match => match[1]);
}

function localParams(params, formatNumber) {
  const source = params && typeof params === 'object' && !Array.isArray(params) ? params : {};
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [
    key, typeof value === 'number' && formatNumber ? formatNumber(value) : value,
  ]));
}

// Localized title and optional detail for a notification. Kinds this client
// does not know, or params missing for a placeholder, fall back to the
// server's English title.
function titleKey(kind, params) {
  const cases = english.kinds[kind].cases;
  for (const name of SELECTORS[kind] ?? []) {
    if (typeof params[name] === 'string' && cases && Object.hasOwn(cases, params[name])) return `cases.${params[name]}`;
  }
  return 'title';
}

export function notificationText({ t, formatNumber }, item) {
  if (!knownNotificationKind(item.kind)) return { title: item.title, detail: '' };
  const params = localParams(item.params, formatNumber);
  const template = path => path.split('.').reduce((value, part) => value?.[part], english.kinds[item.kind]);
  const complete = path => placeholders(template(path))
    .every(name => Object.hasOwn(params, name) && params[name] !== null && params[name] !== '');
  const title = [titleKey(item.kind, params), 'title'].find(complete);
  return {
    title: title ? t(`notifications.kinds.${item.kind}.${title}`, params) : item.title,
    detail: english.kinds[item.kind].detail && complete('detail') ? t(`notifications.kinds.${item.kind}.detail`, params) : '',
  };
}

export function notificationKindLabel(t, kind) {
  if (knownNotificationKind(kind)) return t(`notifications.kinds.${kind}.label`);
  const words = kind.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Groups server-provided kinds for display; kinds added later land in "other".
export function groupNotificationKinds(kinds) {
  const assigned = new Map(GROUPS.flatMap(([group, members]) => members.map(kind => [kind, group])));
  const groups = [...GROUPS.map(([group]) => group), 'other']
    .map(group => ({ group, kinds: kinds.filter(item => (assigned.get(item.kind) ?? 'other') === group) }));
  return groups.filter(group => group.kinds.length);
}
