import 'dotenv/config';

export const realmConfig = {
  environment: process.env.REALM_ENV || 'development',
  
  nexus: {
    port: parseInt(process.env.NEXUS_PORT) || 8080,
    host: process.env.NEXUS_HOST || '0.0.0.0',
  },
  
  realm: {
    connectionString: process.env.REALM_CONNECTION,
    pooling: {
      minimum: parseInt(process.env.REALM_POOL_MIN) || 2,
      maximum: parseInt(process.env.REALM_POOL_MAX) || 10,
    },
  },
  
  cipher: {
    primaryKey: process.env.CIPHER_PRIMARY_KEY,
    refreshKey: process.env.CIPHER_REFRESH_KEY,
    tokenLifespan: parseInt(process.env.TOKEN_LIFESPAN_HOURS) || 168,
    refreshLifespan: parseInt(process.env.REFRESH_LIFESPAN_HOURS) || 720,
  },
  
  googleGateway: {
    identityKey: process.env.GOOGLE_IDENTITY_KEY,
    identityLock: process.env.GOOGLE_IDENTITY_LOCK,
  },
  
  mailTransporter: {
    gateway: process.env.MAIL_GATEWAY,
    port: parseInt(process.env.MAIL_PORT) || 587,
    identity: process.env.MAIL_IDENTITY,
    credential: process.env.MAIL_CREDENTIAL,
    senderAlias: process.env.MAIL_SENDER_ALIAS,
  },
  
  boundaries: {
    portalOrigin: process.env.PORTAL_ORIGIN || 'http://localhost:3000',
    rateWindow: parseInt(process.env.RATE_WINDOW_MS) || 900000,
    rateThreshold: parseInt(process.env.RATE_THRESHOLD) || 150,
    uploadLimit: parseInt(process.env.UPLOAD_BYTE_LIMIT) || 5242880,
  },
};

export const validateRealmConfig = () => {
  const mandatoryKeys = [
    'REALM_CONNECTION',
    'CIPHER_PRIMARY_KEY',
    'CIPHER_REFRESH_KEY',
  ];
  
  const missingKeys = mandatoryKeys.filter(key => !process.env[key]);
  
  if (missingKeys.length > 0) {
    throw new Error(`Missing mandatory configuration: ${missingKeys.join(', ')}`);
  }
  
  if (realmConfig.cipher.primaryKey.length < 32) {
    throw new Error('CIPHER_PRIMARY_KEY must be at least 32 characters');
  }
  
  return true;
};
