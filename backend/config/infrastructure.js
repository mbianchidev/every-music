import { createPrivateKey } from 'node:crypto';

// Object storage, attachment limits and native push providers. Optional
// services stay disabled until their settings are complete.
export const MEDIA_STORAGE_DRIVERS = ['postgres', 's3'];
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const DEFAULT_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function integer(value, fallback, name, minimum, maximum) {
  const candidate = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return candidate;
}

function flag(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new Error(`${name} must be true or false`);
}

// Secrets passed through single-line environment variables usually escape
// their PEM line breaks as "\n".
const pem = value => (value ? value.replace(/\\n/g, '\n').trim() : '');

export function createInfrastructureConfig(env = process.env) {
  return {
    mediaStorage: {
      driver: (env.MEDIA_STORAGE || 'postgres').trim().toLowerCase(),
      s3: {
        endpoint: (env.S3_ENDPOINT || '').trim(),
        region: (env.S3_REGION || 'us-east-1').trim(),
        bucket: (env.S3_BUCKET || '').trim(),
        accessKeyId: env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: env.S3_SECRET_ACCESS_KEY || '',
        forcePathStyle: flag(env.S3_FORCE_PATH_STYLE, false, 'S3_FORCE_PATH_STYLE'),
      },
    },
    attachmentLimit: integer(env.ATTACHMENT_BYTE_LIMIT, DEFAULT_ATTACHMENT_BYTES, 'ATTACHMENT_BYTE_LIMIT', 1024, MAX_ATTACHMENT_BYTES),
    nativePush: {
      fcm: {
        projectId: (env.FCM_PROJECT_ID || '').trim(),
        clientEmail: (env.FCM_CLIENT_EMAIL || '').trim(),
        privateKey: pem(env.FCM_PRIVATE_KEY),
      },
      apns: {
        keyId: (env.APNS_KEY_ID || '').trim(),
        teamId: (env.APNS_TEAM_ID || '').trim(),
        privateKey: pem(env.APNS_PRIVATE_KEY),
        topic: (env.APNS_TOPIC || '').trim(),
        environment: (env.APNS_ENVIRONMENT || 'production').trim().toLowerCase(),
      },
    },
  };
}

function privateKey(value, name, type) {
  try {
    const key = createPrivateKey(value);
    if (type && key.asymmetricKeyType !== type) throw new Error('Unexpected key type');
  } catch {
    throw new Error(`${name} must be a PEM ${type === 'ec' ? 'P-256 (.p8)' : 'RSA'} private key`);
  }
}

const anySet = values => Object.values(values).some(Boolean);

export function validateInfrastructureConfig(config) {
  const { driver, s3 } = config.mediaStorage;
  if (!MEDIA_STORAGE_DRIVERS.includes(driver)) {
    throw new Error(`MEDIA_STORAGE must be one of: ${MEDIA_STORAGE_DRIVERS.join(', ')}`);
  }
  if (driver === 's3') {
    const missing = [['S3_BUCKET', s3.bucket], ['S3_ACCESS_KEY_ID', s3.accessKeyId], ['S3_SECRET_ACCESS_KEY', s3.secretAccessKey]]
      .filter(([, value]) => !value).map(([name]) => name);
    if (missing.length) throw new Error(`MEDIA_STORAGE=s3 requires ${missing.join(', ')}`);
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(s3.bucket)) throw new Error('S3_BUCKET must be a valid bucket name');
    if (!/^[a-z0-9-]{2,32}$/.test(s3.region)) throw new Error('S3_REGION must be a region name such as us-east-1 or auto');
    if (s3.endpoint) {
      let url;
      try { url = new URL(s3.endpoint); } catch { url = null; }
      if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password
        || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
        throw new Error('S3_ENDPOINT must be an http(s) origin without credentials, path, query, or fragment');
      }
    }
  }

  const { fcm, apns } = config.nativePush;
  if (anySet(fcm)) {
    if (!fcm.projectId || !fcm.clientEmail || !fcm.privateKey) {
      throw new Error('Android push requires FCM_PROJECT_ID, FCM_CLIENT_EMAIL, and FCM_PRIVATE_KEY together');
    }
    if (!/^[a-z0-9-]{4,64}$/.test(fcm.projectId)) throw new Error('FCM_PROJECT_ID must be a Firebase project ID');
    privateKey(fcm.privateKey, 'FCM_PRIVATE_KEY', 'rsa');
  }
  const apnsValues = { keyId: apns.keyId, teamId: apns.teamId, privateKey: apns.privateKey, topic: apns.topic };
  if (anySet(apnsValues)) {
    if (Object.values(apnsValues).some(value => !value)) {
      throw new Error('iOS push requires APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, and APNS_TOPIC together');
    }
    if (!/^[A-Z0-9]{10}$/.test(apns.keyId) || !/^[A-Z0-9]{10}$/.test(apns.teamId)) {
      throw new Error('APNS_KEY_ID and APNS_TEAM_ID must be 10-character Apple identifiers');
    }
    if (!/^[A-Za-z0-9.-]{3,155}$/.test(apns.topic)) throw new Error('APNS_TOPIC must be the app bundle identifier');
    privateKey(apns.privateKey, 'APNS_PRIVATE_KEY', 'ec');
  }
  if (!['production', 'sandbox'].includes(apns.environment)) {
    throw new Error('APNS_ENVIRONMENT must be production or sandbox');
  }
  return true;
}
