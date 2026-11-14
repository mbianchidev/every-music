export default {
  plans: { free: 'Free', premium: 'Premium', partner: 'Partner' },
  upgrade: {
    eyebrow: 'Premium feature',
    how: 'Your current plan: {plan}. Upgrade to Premium to unlock it.',
  },
  analytics: {
    upgradeTitle: 'Announcement statistics are a Premium feature',
    upgradeBody: 'Premium shows daily views, likes, saves and messages for your announcements and profile. Your analytics consent settings stay the same.',
  },
  expiry: {
    label: 'Expiration date',
    hintLimited: { one: 'Your plan keeps an announcement online for up to {count} day.', other: 'Your plan keeps an announcement online for up to {count} days.' },
    hintUnlimited: 'Optional. Leave empty to keep the announcement online until you unpublish it.',
    until: 'Online until {date}',
    open: 'No expiration date',
  },
  stats: {
    heading: 'Announcement statistics',
    ownerOnly: 'Only you can see these numbers',
    likes: 'Likes',
    dislikes: 'Dislikes',
    views: 'Views',
    saves: 'Saves',
    locked: 'Views and saves are available with Premium.',
  },
  publish: {
    publish: 'Publish',
    unpublish: 'Unpublish',
    publishNamed: 'Publish {title}',
    unpublishNamed: 'Unpublish {title}',
    published: '{title} is published.',
    unpublished: '{title} is now a private draft.',
  },
  quota: {
    failed: 'Plan limits could not be loaded.',
    activeAnnouncements: {
      limited: { one: '{used} of {limit} active announcement used.', other: '{used} of {limit} active announcements used.' },
      unlimited: { one: '{count} active announcement. Your plan has no limit.', other: '{count} active announcements. Your plan has no limit.' },
      full: 'Unpublish one or wait for one to expire before publishing another.',
    },
    savedAnnouncements: {
      limited: { one: '{used} of {limit} saved announcement used.', other: '{used} of {limit} saved announcements used.' },
      unlimited: { one: '{count} saved announcement.', other: '{count} saved announcements.' },
      full: 'Remove one to save another.',
    },
    savedSearches: {
      limited: { one: '{used} of {limit} saved search used.', other: '{used} of {limit} saved searches used.' },
      unlimited: { one: '{count} saved search.', other: '{count} saved searches.' },
      full: 'Delete one to save another.',
    },
  },
};
