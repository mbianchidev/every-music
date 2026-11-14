import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createInfrastructureConfig, validateInfrastructureConfig } from '../config/infrastructure.js';

const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const escaped = key => key.replace(/\n/g, '\\n');
const validate = env => validateInfrastructureConfig(createInfrastructureConfig(env));

test('optional storage and push providers default to PostgreSQL and disabled', () => {
  const config = createInfrastructureConfig({});
  assert.equal(config.mediaStorage.driver, 'postgres');
  assert.equal(config.attachmentLimit, 10 * 1024 * 1024);
  assert.equal(validateInfrastructureConfig(config), true);
  assert.throws(() => validate({ MEDIA_STORAGE: 'disk' }), /MEDIA_STORAGE/);
  assert.throws(() => validate({ ATTACHMENT_BYTE_LIMIT: '60000000' }), /ATTACHMENT_BYTE_LIMIT/);
});

test('the S3 driver requires a bucket, credentials, and a bare http(s) endpoint', () => {
  const s3 = { MEDIA_STORAGE: 's3', S3_BUCKET: 'everymusic-media', S3_ACCESS_KEY_ID: 'synthetic', S3_SECRET_ACCESS_KEY: 'synthetic-secret' };
  assert.equal(validate(s3), true);
  assert.equal(validate({ ...s3, S3_ENDPOINT: 'http://object-store:8333', S3_FORCE_PATH_STYLE: 'true', S3_REGION: 'auto' }), true);
  assert.throws(() => validate({ ...s3, S3_SECRET_ACCESS_KEY: '' }), /S3_SECRET_ACCESS_KEY/);
  assert.throws(() => validate({ ...s3, S3_BUCKET: 'Invalid_Bucket' }), /S3_BUCKET/);
  for (const endpoint of ['ftp://store.example.test', 'https://user:pass@store.example.test', 'https://store.example.test/bucket']) {
    assert.throws(() => validate({ ...s3, S3_ENDPOINT: endpoint }), /S3_ENDPOINT/, endpoint);
  }
  assert.throws(() => validate({ ...s3, S3_FORCE_PATH_STYLE: 'yes' }), /S3_FORCE_PATH_STYLE/);
});

test('native push providers need complete credentials of the right key type', () => {
  const fcm = { FCM_PROJECT_ID: 'synthetic-project', FCM_CLIENT_EMAIL: 'push@synthetic-project.iam.gserviceaccount.com', FCM_PRIVATE_KEY: escaped(rsa) };
  const apns = { APNS_KEY_ID: 'ABCDEF1234', APNS_TEAM_ID: 'TEAM123456', APNS_PRIVATE_KEY: escaped(ec), APNS_TOPIC: 'music.every.app' };
  assert.equal(validate({ ...fcm, ...apns, APNS_ENVIRONMENT: 'sandbox' }), true);
  assert.equal(createInfrastructureConfig(fcm).nativePush.fcm.privateKey.includes('\n'), true);
  assert.throws(() => validate({ ...fcm, FCM_CLIENT_EMAIL: '' }), /FCM_PROJECT_ID, FCM_CLIENT_EMAIL, and FCM_PRIVATE_KEY/);
  assert.throws(() => validate({ ...fcm, FCM_PRIVATE_KEY: escaped(ec) }), /FCM_PRIVATE_KEY/);
  assert.throws(() => validate({ ...apns, APNS_TOPIC: '' }), /APNS_TOPIC/);
  assert.throws(() => validate({ ...apns, APNS_PRIVATE_KEY: escaped(rsa) }), /APNS_PRIVATE_KEY/);
  assert.throws(() => validate({ ...apns, APNS_KEY_ID: 'short' }), /APNS_KEY_ID/);
  assert.throws(() => validate({ APNS_ENVIRONMENT: 'staging' }), /APNS_ENVIRONMENT/);
});
