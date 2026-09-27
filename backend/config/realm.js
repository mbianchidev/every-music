import 'dotenv/config';

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
      identityLock: env.GOOGLE_IDENTITY_LOCK,
    },
    mailTransporter: {
      gateway: env.MAIL_GATEWAY,
      port: parseInteger(env.MAIL_PORT, 587, 'MAIL_PORT', { minimum: 1, maximum: 65535 }),
      identity: env.MAIL_IDENTITY,
      credential: env.MAIL_CREDENTIAL,
      senderAlias: env.MAIL_SENDER_ALIAS,
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
