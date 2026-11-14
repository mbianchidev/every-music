import 'dotenv/config';
import { createECDH } from 'node:crypto';
import { createInfrastructureConfig, validateInfrastructureConfig } from './infrastructure.js';
import { createMonetizationConfig, validateMonetizationConfig } from './monetization.js';
import { createBandCollabConfig } from './band-collab.js';

const ENVIRONMENTS = new Set(['development', 'test', 'production']);

function parseInteger(value, fallback, name, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const candidate = value === undefined || value === '' ? fallback : Number.parseInt(value, 10);

  if (!Number.isInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }

  return candidate;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === '') {
    return fallback;
  }

  if (value === 'true' || value === '1') {
    return true;
  }

  if (value === 'false' || value === '0') {
    return false;
  }

  throw new Error(`Expected a boolean value, received "${value}"`);
}

// [limit key, wishlist name, free default, premium default]; null means unlimited.
export const ENTITLEMENT_LIMITS = [
  ['maxActiveAnnouncements', 'MAX_ANNOUNCEMENT_LIMIT', 5, null],
  ['maxSavedSearches', 'MAX_FILTERS_SAVED', 1, 20],
  ['announcementStats', 'SEE_ADS_STATS', false, true],
  ['maxProjectsShown', 'MAX_PROJECTS_SHOWN', 3, null],
  ['maxContentShown', 'MAX_CONTENT_SHOWN', 3, null],
  ['maxSavedAnnouncements', 'MAX_SAVABLE_ADS', 10, null],
  ['announcementExpiryDays', 'EXPIRATION_DATE_DAY_LIMIT', 30, null],
  ['profileVisits', 'SEE_PROFILE_VISITS', false, true],
];

function parseLimit(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  if (typeof fallback === 'boolean') {
    try { return parseBoolean(value); } catch { throw new Error(`${name} must be true or false`); }
  }
  if (value === 'unlimited') return null;
  return parseInteger(value, fallback, name, { minimum: 1, maximum: 100000 });
}

function createEntitlements(env) {
  const plan = (prefix, index) => Object.fromEntries(ENTITLEMENT_LIMITS.map((definition) => {
    const [key, name] = definition;
    return [key, parseLimit(env[`${prefix}_${name}`], definition[index], `${prefix}_${name}`)];
  }));
  const partnerRequired = parseBoolean(env.PARTNER_PLAN_REQUIRED, false);
  const free = { ...plan('FREE', 2), businessPages: !partnerRequired };
  const premium = { ...plan('PREMIUM', 3), businessPages: !partnerRequired };
  return { free, premium, partner: { ...premium, businessPages: true } };
}

function createAccountTrust(env) {
  return {
    twoFactorKey: env.TWO_FACTOR_ENCRYPTION_KEY || '',
    verificationRetentionDays: parseInteger(env.VERIFICATION_MEDIA_RETENTION_DAYS, 7, 'VERIFICATION_MEDIA_RETENTION_DAYS', { minimum: 1, maximum: 90 }),
    sms: {
      twilio: {
        accountSid: env.TWILIO_ACCOUNT_SID || '',
        authToken: env.TWILIO_AUTH_TOKEN || '',
        fromNumber: env.TWILIO_FROM_NUMBER || '',
        messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID || '',
      },
    },
  };
}

export function validateAccountTrust(accountTrust) {
  if (!accountTrust) return;
  if (accountTrust.twoFactorKey && accountTrust.twoFactorKey.length < 32) {
    throw new Error('TWO_FACTOR_ENCRYPTION_KEY must be at least 32 characters when set');
  }
  const twilio = accountTrust.sms?.twilio ?? {};
  const anyTwilio = Object.values(twilio).some(Boolean);
  if (anyTwilio && (!twilio.accountSid || !twilio.authToken || !(twilio.fromNumber || twilio.messagingServiceSid))) {
    throw new Error('SMS requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID');
  }
  if (twilio.fromNumber && !/^\+[1-9]\d{7,14}$/.test(twilio.fromNumber)) {
    throw new Error('TWILIO_FROM_NUMBER must be an E.164 phone number such as +15550100000');
  }
}

const CLIENT_VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;
const versionCore = value => value.split('.').map(Number);
const versionAtMost = (left, right) => {
  const [a, b] = [versionCore(left), versionCore(right)];
  const index = a.findIndex((part, position) => part !== b[position]);
  return index === -1 || a[index] < b[index];
};

// Help center, legal templates and client version notices (w3-help-onboarding).
function createHelpConfig(env) {
  const optional = (name, pattern, message) => {
    const value = env[name]?.trim() || '';
    if (value && !pattern.test(value)) throw new Error(`${name} ${message}`);
    return value || null;
  };
  const email = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,}$/;
  const clientVersions = {
    minimum: optional('CLIENT_MIN_VERSION', CLIENT_VERSION, 'must be a MAJOR.MINOR.PATCH version'),
    latest: optional('CLIENT_LATEST_VERSION', CLIENT_VERSION, 'must be a MAJOR.MINOR.PATCH version'),
    updateUrl: optional('CLIENT_UPDATE_URL', /^https?:\/\/[^\s]{1,2040}$/, 'must be an http(s) URL'),
  };
  if (clientVersions.minimum && clientVersions.latest && !versionAtMost(clientVersions.minimum, clientVersions.latest)) {
    throw new Error('CLIENT_MIN_VERSION cannot be newer than CLIENT_LATEST_VERSION');
  }
  const effectiveDate = optional('LEGAL_EFFECTIVE_DATE', /^\d{4}-\d{2}-\d{2}$/, 'must be a YYYY-MM-DD date');
  if (effectiveDate && Number.isNaN(Date.parse(`${effectiveDate}T00:00:00Z`))) throw new Error('LEGAL_EFFECTIVE_DATE must be a valid date');
  return {
    legal: {
      operatorName: optional('OPERATOR_NAME', /^[^\n\r]{1,200}$/, 'must be one line of at most 200 characters'),
      operatorContactEmail: optional('OPERATOR_CONTACT_EMAIL', email, 'must be an email address'),
      operatorJurisdiction: optional('OPERATOR_JURISDICTION', /^[^\n\r]{1,120}$/, 'must be one line of at most 120 characters'),
      effectiveDate,
      termsVersion: optional('TERMS_VERSION', /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/, 'must use 1-32 letters, digits, dots, dashes, or underscores') || '1',
    },
    support: { email: optional('SUPPORT_EMAIL', email, 'must be an email address') },
    clientVersions,
  };
}

function parseOrigins(value) {
  return (value || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function createConnectionString(env) {
  if (env.REALM_CONNECTION) {
    return env.REALM_CONNECTION;
  }

  const values = [
    env.REALM_HOST,
    env.REALM_NAME,
    env.REALM_USER,
    env.REALM_PASSWORD,
  ];

  if (values.some((value) => !value)) {
    return undefined;
  }

  const user = encodeURIComponent(env.REALM_USER);
  const password = encodeURIComponent(env.REALM_PASSWORD);
  const host = env.REALM_HOST;
  const port = parseInteger(env.REALM_PORT, 5432, 'REALM_PORT', { minimum: 1, maximum: 65535 });
  const database = encodeURIComponent(env.REALM_NAME);
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

export function createRealmConfig(env = process.env) {
  const environment = env.REALM_ENV || env.NODE_ENV || 'development';
  const legacyTokenHours = env.TOKEN_LIFESPAN_HOURS
    ? Number.parseInt(env.TOKEN_LIFESPAN_HOURS, 10) * 60
    : undefined;

  return {
    environment,
    application: {
      version: env.APP_VERSION || '1.0.0',
    },
    nexus: {
      port: parseInteger(env.NEXUS_PORT, 8080, 'NEXUS_PORT', { minimum: 1, maximum: 65535 }),
      host: env.NEXUS_HOST || '0.0.0.0',
      trustProxy: parseBoolean(env.TRUST_PROXY, false),
    },
    realm: {
      connectionString: createConnectionString(env),
      pooling: {
        minimum: parseInteger(env.REALM_POOL_MIN, 2, 'REALM_POOL_MIN', { maximum: 100 }),
        maximum: parseInteger(env.REALM_POOL_MAX, 10, 'REALM_POOL_MAX', { minimum: 1, maximum: 100 }),
      },
    },
    cipher: {
      primaryKey: env.CIPHER_PRIMARY_KEY,
      refreshKey: env.CIPHER_REFRESH_KEY,
      issuer: env.TOKEN_ISSUER || 'every.music',
      audience: env.TOKEN_AUDIENCE || 'every.music.clients',
      accessTokenMinutes: parseInteger(
        env.TOKEN_LIFESPAN_MINUTES,
        legacyTokenHours ?? 30,
        'TOKEN_LIFESPAN_MINUTES',
        { minimum: 5, maximum: 1440 },
      ),
      refreshTokenDays: parseInteger(
        env.REFRESH_LIFESPAN_DAYS,
        env.REFRESH_LIFESPAN_HOURS
          ? Math.ceil(Number.parseInt(env.REFRESH_LIFESPAN_HOURS, 10) / 24)
          : 30,
        'REFRESH_LIFESPAN_DAYS',
        { minimum: 1, maximum: 90 },
      ),
      rotationGraceSeconds: parseInteger(
        env.REFRESH_ROTATION_GRACE_SECONDS,
        30,
        'REFRESH_ROTATION_GRACE_SECONDS',
        { minimum: 5, maximum: 120 },
      ),
    },
    googleGateway: {
      identityKey: env.GOOGLE_IDENTITY_KEY,
    },
    push: {
      publicKey: env.VAPID_PUBLIC_KEY || '',
      privateKey: env.VAPID_PRIVATE_KEY || '',
      subject: env.VAPID_SUBJECT || '',
    },
    mailTransporter: {
      gateway: env.MAIL_GATEWAY,
      port: parseInteger(env.MAIL_PORT, 587, 'MAIL_PORT', { minimum: 1, maximum: 65535 }),
      identity: env.MAIL_IDENTITY,
      credential: env.MAIL_CREDENTIAL,
      senderAlias: env.MAIL_SENDER_ALIAS,
    },
    entitlements: createEntitlements(env),
    notifications: {
      jobIntervalMinutes: parseInteger(env.NOTIFICATION_JOB_INTERVAL_MINUTES, 60, 'NOTIFICATION_JOB_INTERVAL_MINUTES', { minimum: 1, maximum: 1440 }),
      statsDigestWeekday: parseInteger(env.STATS_DIGEST_WEEKDAY, 1, 'STATS_DIGEST_WEEKDAY', { minimum: 1, maximum: 7 }),
      statsDigestMinimum: parseInteger(env.STATS_DIGEST_MIN_EVENTS, 1, 'STATS_DIGEST_MIN_EVENTS', { minimum: 1, maximum: 100000 }),
      comeBackAfterDays: parseInteger(env.COME_BACK_AFTER_DAYS, 30, 'COME_BACK_AFTER_DAYS', { minimum: 1, maximum: 90 }),
      comeBackMaxReminders: parseInteger(env.COME_BACK_MAX_REMINDERS, 3, 'COME_BACK_MAX_REMINDERS', { minimum: 0, maximum: 24 }),
      inviteNudgeAfterDays: parseInteger(env.INVITE_NUDGE_AFTER_DAYS, 7, 'INVITE_NUDGE_AFTER_DAYS', { minimum: 1, maximum: 365 }),
    },
    applications: {
      retentionDays: parseInteger(env.APPLICATION_RETENTION_DAYS, 90, 'APPLICATION_RETENTION_DAYS', { minimum: 1, maximum: 3650 }),
    },
    marketplace: {
      listingDays: parseInteger(env.MARKETPLACE_LISTING_DAYS, 60, 'MARKETPLACE_LISTING_DAYS', { minimum: 1, maximum: 365 }),
      expiryReminderDays: parseInteger(env.MARKETPLACE_EXPIRY_REMINDER_DAYS, 3, 'MARKETPLACE_EXPIRY_REMINDER_DAYS', { minimum: 1, maximum: 30 }),
    },
    accountTrust: createAccountTrust(env),
    ...createHelpConfig(env),
    ...createInfrastructureConfig(env),
    ...createMonetizationConfig(env),
    events: {
      reminderIntervalSeconds: parseInteger(env.EVENT_REMINDER_INTERVAL_SECONDS, 60, 'EVENT_REMINDER_INTERVAL_SECONDS', { maximum: 3600 }),
    },
    ...createBandCollabConfig(env),
    organizations: {
      youtubeFeedIntervalMinutes: parseInteger(env.YOUTUBE_FEED_INTERVAL_MINUTES, 60, 'YOUTUBE_FEED_INTERVAL_MINUTES', { maximum: 10080 }),
    },
    boundaries: {
      portalOrigins: parseOrigins(env.PORTAL_ORIGINS || env.PORTAL_ORIGIN),
      rateWindow: parseInteger(env.RATE_WINDOW_MS, 900000, 'RATE_WINDOW_MS', { minimum: 1000 }),
      rateThreshold: parseInteger(env.RATE_THRESHOLD, 150, 'RATE_THRESHOLD', { minimum: 1 }),
      uploadLimit: parseInteger(env.UPLOAD_BYTE_LIMIT, 5242880, 'UPLOAD_BYTE_LIMIT', { minimum: 1024 }),
    },
  };
}

export function validateRealmConfig(config = realmConfig) {
  if (!ENVIRONMENTS.has(config.environment)) {
    throw new Error(`REALM_ENV must be one of: ${[...ENVIRONMENTS].join(', ')}`);
  }

  const missingKeys = [
    ['REALM_CONNECTION', config.realm.connectionString],
    ['CIPHER_PRIMARY_KEY', config.cipher.primaryKey],
    ['CIPHER_REFRESH_KEY', config.cipher.refreshKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missingKeys.length > 0) {
    throw new Error(`Missing mandatory configuration: ${missingKeys.join(', ')}`);
  }

  if (config.realm.pooling.minimum > config.realm.pooling.maximum) {
    throw new Error('REALM_POOL_MIN cannot exceed REALM_POOL_MAX');
  }

  if (config.cipher.primaryKey.length < 32 || config.cipher.refreshKey.length < 32) {
    throw new Error('Cipher keys must each be at least 32 characters');
  }

  if (config.cipher.primaryKey === config.cipher.refreshKey) {
    throw new Error('CIPHER_PRIMARY_KEY and CIPHER_REFRESH_KEY must be different');
  }

  const push = config.push;
  if (push && (push.publicKey || push.privateKey || push.subject)) {
    try {
      const key = createECDH('prime256v1');
      key.setPrivateKey(Buffer.from(push.privateKey, 'base64url'));
      if (!key.getPublicKey().equals(Buffer.from(push.publicKey, 'base64url'))
        || !['https:', 'mailto:'].includes(new URL(push.subject).protocol)) {
        throw new Error('Invalid VAPID configuration');
      }
    } catch {
      throw new Error('VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT must be a matching key pair and HTTPS/mailto contact');
    }
  }

  if (config.marketplace && config.marketplace.expiryReminderDays >= config.marketplace.listingDays) {
    throw new Error('MARKETPLACE_EXPIRY_REMINDER_DAYS must be lower than MARKETPLACE_LISTING_DAYS');
  }
  validateAccountTrust(config.accountTrust);
  if (config.mediaStorage) validateInfrastructureConfig(config);
  if (config.monetization) validateMonetizationConfig(config);

  if (config.environment === 'production') {
    const mailValues = [
      config.mailTransporter.gateway,
      config.mailTransporter.identity,
      config.mailTransporter.credential,
      config.mailTransporter.senderAlias,
    ];

    if (mailValues.some((value) => !value)) {
      throw new Error('Production email delivery requires MAIL_GATEWAY, MAIL_IDENTITY, MAIL_CREDENTIAL, and MAIL_SENDER_ALIAS');
    }
  }

  return true;
}

export const realmConfig = createRealmConfig();
