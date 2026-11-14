import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedPushEndpoint, validatePushSubscription } from '../src/engines/push-dispatcher.js';

test('push endpoints cannot target arbitrary servers, credentials, or non-HTTPS ports', () => {
  for (const endpoint of [
    'https://fcm.googleapis.com/fcm/send/synthetic',
    'https://updates.push.services.mozilla.com/wpush/v2/synthetic',
    'https://web.push.apple.com/synthetic',
    'https://synthetic.notify.windows.com/synthetic',
  ]) assert.equal(isAllowedPushEndpoint(endpoint), true, endpoint);
  for (const endpoint of [
    'http://fcm.googleapis.com/synthetic',
    'https://fcm.googleapis.com:444/synthetic',
    'https://user:password@fcm.googleapis.com/synthetic',
    'https://fcm.googleapis.com.example.test/synthetic',
    'https://127.0.0.1/private',
    'https://169.254.169.254/latest/meta-data',
    'https://example.test/notify.windows.com',
  ]) assert.equal(isAllowedPushEndpoint(endpoint), false, endpoint);
  assert.throws(() => validatePushSubscription({
    endpoint: 'https://fcm.googleapis.com/synthetic', keys: { p256dh: 'invalid', auth: 'invalid' },
  }), error => error.code === 'INVALID_PUSH_SUBSCRIPTION');
});
