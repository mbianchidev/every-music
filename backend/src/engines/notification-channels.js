import { NOTIFICATION_CHANNELS, notificationKinds, notificationKind } from './notification-catalog.js';

export const CHANNEL_COLUMNS = { inApp: 'in_app', push: 'push', email: 'email' };

// Legacy category booleans in user_preferences. They stay master switches: when
// a category is off, none of its kinds are delivered on any channel.
export const CATEGORY_COLUMNS = {
  messages: 'messages',
  announcements: 'announcements',
  engagements: 'engagements',
  profileViews: 'profile_views',
};
export const CATEGORY_DEFAULTS = { messages: true, announcements: true, engagements: true, profileViews: false };

// Kinds that are only produced for plans with the named entitlement switch.
export const PLAN_FEATURES = { announcement_stats: 'announcementStats', profile_stats: 'profileVisits' };

export const catalogKinds = () => Object.keys(notificationKinds);

export function categoryOf(kind) {
  const { preference } = notificationKind(kind);
  if (!preference) return null;
  if (!Object.hasOwn(CATEGORY_COLUMNS, preference)) throw new Error(`Unknown notification preference for ${kind}`);
  return preference;
}

export function channelAvailability(kind, channel) {
  if (!NOTIFICATION_CHANNELS.includes(channel)) throw new Error(`Unknown notification channel: ${channel}`);
  const availability = notificationKind(kind)[channel];
  if (!['on', 'optional', 'off'].includes(availability)) throw new Error(`Invalid ${channel} availability for ${kind}`);
  return availability;
}

// "on" channels start enabled and "optional" ones start disabled. A category
// switch that is off by default (profileViews) is already an explicit opt-in,
// so the optional in-app channel of its kinds follows that switch.
export function defaultChoice(kind, channel) {
  const availability = channelAvailability(kind, channel);
  if (availability === 'on') return true;
  return availability === 'optional' && channel === 'inApp' && categoryOf(kind) !== null;
}

export function resolveChannel(kind, channel, override) {
  if (channelAvailability(kind, channel) === 'off') return false;
  return typeof override === 'boolean' ? override : defaultChoice(kind, channel);
}

// Kinds are catalog keys, never user input; quoting keeps any key valid SQL.
function kindLiteral(kind) {
  notificationKind(kind);
  return `'${kind.replaceAll("'", "''")}'`;
}

// SQL deciding delivery of one kind. Expressions use the aliases `u` (users),
// `p` (user_preferences) and `c` (this kind's notification_channel_preferences)
// that `joins` provides after `FROM users u`.
export function deliverySql(kind) {
  const category = categoryOf(kind);
  const gate = category
    ? `COALESCE(p.${CATEGORY_COLUMNS[category]}, ${CATEGORY_DEFAULTS[category] ? 'TRUE' : 'FALSE'})`
    : 'TRUE';
  const channel = name => (channelAvailability(kind, name) === 'off'
    ? 'FALSE'
    : `COALESCE(c.${CHANNEL_COLUMNS[name]}, ${defaultChoice(kind, name) ? 'TRUE' : 'FALSE'})`);
  const inApp = channel('inApp');
  const push = `(COALESCE(p.push, FALSE) AND ${channel('push')})`;
  const email = `(COALESCE(u.email_verified, FALSE) AND ${channel('email')})`;
  return {
    joins: `LEFT JOIN user_preferences p ON p.user_id = u.id
      LEFT JOIN notification_channel_preferences c ON c.user_id = u.id AND c.kind = ${kindLiteral(kind)}`,
    gate,
    inApp,
    push,
    email,
    deliverable: `(${gate} AND (${inApp} OR ${push} OR ${email}))`,
  };
}
