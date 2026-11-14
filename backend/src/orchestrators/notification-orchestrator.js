import { NotificationConductor } from '../conductors/notification-conductor.js';
import { identityGuard } from '../guards/identity-guard.js';
import { object } from '../validators/http-schemas.js';
import { NOTIFICATION_CHANNELS, notificationKinds } from '../engines/notification-catalog.js';

export async function notificationOrchestrator(fastify, { config }) {
  const conductor = new NotificationConductor(config);
  const choice = { type: ['boolean', 'null'] };
  const channels = object(Object.fromEntries(NOTIFICATION_CHANNELS.map(channel => [channel, choice])));
  const kinds = object(Object.fromEntries(Object.keys(notificationKinds).map(kind => [kind, channels])));

  fastify.get('/preferences/notifications', { preHandler: identityGuard }, conductor.getPreferences);
  fastify.put('/preferences/notifications', {
    preHandler: identityGuard,
    schema: { body: object({ kinds }, ['kinds']) },
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, conductor.updatePreferences);
}
