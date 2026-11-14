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
];

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
export function notificationText({ t, formatNumber }, item) {
  if (!knownNotificationKind(item.kind)) return { title: item.title, detail: '' };
  const params = localParams(item.params, formatNumber);
  const complete = key => placeholders(english.kinds[item.kind][key])
    .every(name => Object.hasOwn(params, name) && params[name] !== null && params[name] !== '');
  return {
    title: complete('title') ? t(`notifications.kinds.${item.kind}.title`, params) : item.title,
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
