// Delivery defaults per notification kind and channel, from the product
// notification table. "on" is enabled by default, "optional" is available but
// off until the user opts in, and "off" is never delivered on that channel.
// `preference` names the legacy boolean preference that still gates the kind.
// Add new kinds here; never reuse a kind for a different meaning.
export const NOTIFICATION_CHANNELS = ['inApp', 'push', 'email'];

export const notificationKinds = {
  message: { preference: 'messages', inApp: 'on', push: 'on', email: 'optional' },
  message_request: { preference: 'messages', inApp: 'on', push: 'on', email: 'optional' },
  comment: { preference: 'engagements', inApp: 'on', push: 'on', email: 'optional' },
  reaction: { preference: 'engagements', inApp: 'on', push: 'on', email: 'optional' },
  profile_view: { preference: 'profileViews', inApp: 'optional', push: 'optional', email: 'optional' },
  report_reviewed: { preference: 'engagements', inApp: 'on', push: 'on', email: 'optional' },
  announcement: { preference: 'announcements', inApp: 'on', push: 'on', email: 'optional' },
  new_follower: { inApp: 'on', push: 'optional', email: 'optional' },
  announcement_stats: { inApp: 'off', push: 'optional', email: 'optional' },
  profile_stats: { inApp: 'off', push: 'optional', email: 'optional' },
  events: { inApp: 'on', push: 'on', email: 'on' },
  offers: { inApp: 'on', push: 'on', email: 'on' },
  invite_friends: { inApp: 'on', push: 'off', email: 'off' },
  come_back: { inApp: 'off', push: 'optional', email: 'on' },
  app_update_minor: { inApp: 'on', push: 'off', email: 'off' },
  app_update_major: { inApp: 'on', push: 'on', email: 'on' },
  application_received: { inApp: 'on', push: 'on', email: 'optional' },
  application_status: { inApp: 'on', push: 'on', email: 'optional' },
  listing_expiring: { inApp: 'on', push: 'optional', email: 'optional' },
  listing_removed: { inApp: 'on', push: 'optional', email: 'optional' },
  security_alert: { inApp: 'on', push: 'on', email: 'optional' },
  verification_requested: { inApp: 'on', push: 'optional', email: 'off' },
  verification_decided: { inApp: 'on', push: 'on', email: 'optional' },
  saved_search_match: { inApp: 'on', push: 'on', email: 'optional' },
  support_reply: { inApp: 'on', push: 'optional', email: 'optional' },
  organization_invitation: { inApp: 'on', push: 'on', email: 'optional' },
  organization_membership: { inApp: 'on', push: 'optional', email: 'optional' },
  organization_update: { inApp: 'on', push: 'optional', email: 'optional' },
  organization_relation: { inApp: 'on', push: 'on', email: 'optional' },
  organization_claim: { inApp: 'on', push: 'on', email: 'optional' },
};

export function notificationKind(kind) {
  const definition = Object.hasOwn(notificationKinds, kind) ? notificationKinds[kind] : undefined;
  if (!definition) throw new Error(`Unknown notification kind: ${kind}`);
  return definition;
}

export function channelDefault(kind, channel) {
  if (!NOTIFICATION_CHANNELS.includes(channel)) throw new Error(`Unknown notification channel: ${channel}`);
  return notificationKind(kind)[channel] === 'on';
}
