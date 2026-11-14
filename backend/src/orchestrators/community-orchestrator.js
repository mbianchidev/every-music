import { CommunityConductor } from '../conductors/community-conductor.js';
import { identityGuard, optionalIdentityGuard } from '../guards/identity-guard.js';
import { uuid, text, object, params, paging as pageProperties } from '../validators/http-schemas.js';
const paging = object({ ...pageProperties, archived: { enum: ['true', 'false'] }, format: { const: 'encrypted-v1' } });

export async function communityOrchestrator(fastify, { config }) {
  const conductor = new CommunityConductor(config);
  const route = (method, url, handler, schema = {}, guard = identityGuard) => fastify.route({
    method, url, preHandler: guard, schema, handler,
  });
  const preferences = object(Object.fromEntries(
    ['messages', 'announcements', 'engagements', 'profileViews', 'push', 'analytics', 'platformAnalytics'].map(key => [key, { type: 'boolean' }]),
  ));
  route('GET', '/account', conductor.getAccount);
  route('GET', '/preferences', conductor.getPreferences);
  route('PUT', '/preferences', conductor.updatePreferences, { body: preferences });
  route('POST', '/conversations', conductor.startConversation, {
    body: object({ recipientUserId: uuid }, ['recipientUserId']),
  });
  route('GET', '/conversations', conductor.listConversations, { querystring: paging });
  route('GET', '/conversations/:conversationId/messages', conductor.getMessages, {
    params: params('conversationId'), querystring: paging,
  });
  route('POST', '/conversations/:conversationId/messages', conductor.sendMessage, {
    params: params('conversationId'),
    body: object({ body: text(4000), clientId: uuid, ciphertext: text(65536), senderKeyId: uuid, recipientKeyId: uuid }, ['clientId']),
  });
  route('PATCH', '/conversations/:conversationId', conductor.updateConversation, {
    params: params('conversationId'),
    body: object({ read: { const: true }, archived: { type: 'boolean' }, blocked: { type: 'boolean' } }),
  });
  route('DELETE', '/conversations/:conversationId/messages/:messageId', conductor.deleteMessage, {
    params: params('conversationId', 'messageId'),
  });
  route('GET', '/notifications', conductor.getNotifications, { querystring: paging });
  route('PATCH', '/notifications', conductor.readNotifications, { body: object({ read: { const: true } }, ['read']) });
  route('PATCH', '/notifications/:notificationId', conductor.readNotifications, {
    params: params('notificationId'), body: object({ read: { const: true } }, ['read']),
  });
  route('POST', '/media', conductor.uploadImage, {
    body: object({ data: text(2796204), mimeType: { enum: ['image/jpeg', 'image/png'] }, purpose: { enum: ['profile', 'announcement'] } },
      ['data', 'mimeType', 'purpose']),
  });
  route('GET', '/media/:mediaId', conductor.getImage, { params: params('mediaId') }, optionalIdentityGuard);
  route('GET', '/analytics', conductor.getAnalytics);
  route('POST', '/analytics/events', conductor.recordView, {
    body: object({ kind: { enum: ['profile_view', 'announcement_view'] }, resourceId: uuid }, ['kind', 'resourceId']),
  });
  route(['POST', 'DELETE'], '/profiles/:profileId/follow', conductor.follow, { params: params('profileId') });
  route('GET', '/announcements/:announcementId/comments', conductor.getComments, {
    params: params('announcementId'), querystring: paging,
  }, optionalIdentityGuard);
  route('POST', '/announcements/:announcementId/comments', conductor.addComment, {
    params: params('announcementId'), body: object({ body: text(2000) }, ['body']),
  });
  route('DELETE', '/announcements/:announcementId/comments/:commentId', conductor.deleteComment, {
    params: params('announcementId', 'commentId'),
  });
  route('POST', '/push/subscriptions', conductor.subscribePush, {
    body: object({ endpoint: text(2048), keys: object({ p256dh: text(128), auth: text(64) }, ['p256dh', 'auth']) }, ['endpoint', 'keys']),
  });
  route('DELETE', '/push/subscriptions', conductor.unsubscribePush, { body: object({ endpoint: text(2048) }, ['endpoint']) });
}
