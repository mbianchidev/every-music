import { communityRepository } from '../repositories/community-repository.js';
import { InputValidator } from '../validators/input-validator.js';
import { optimizeImage } from '../engines/media-engine.js';
import { requestError } from '../engines/request-error.js';
import { validatePushSubscription } from '../engines/push-dispatcher.js';

function pagination(request) {
  const result = InputValidator.parsePagination(request.query?.page, request.query?.pageSize);
  if (!result.valid) throw requestError(400, 'VALIDATION_ERROR', result.message);
  return result.pagination;
}

function pageOf(rows, key, page) {
  return {
    [key]: rows.slice(0, page.pageSize),
    pagination: { ...page, hasMore: rows.length > page.pageSize },
  };
}

const ok = (reply, data, status = 200) => reply.code(status).send({ success: true, data });

export class CommunityConductor {
  constructor(config) {
    this.config = config;
  }

  getPreferences = async (request, reply) => ok(reply, {
    ...await communityRepository.preferences(request.authenticatedUser.userId),
    pushPublicKey: this.config.push?.publicKey || null,
  });

  updatePreferences = async (request, reply) => {
    if (request.body.push && !this.config.push?.publicKey) {
      throw requestError(503, 'PUSH_NOT_CONFIGURED', 'Browser push is not configured on this server');
    }
    return ok(reply, await communityRepository.updatePreferences(request.authenticatedUser.userId, request.body));
  };

  startConversation = async (request, reply) => ok(reply,
    await communityRepository.startConversation(request.authenticatedUser.userId, request.body.recipientUserId), 201);

  listConversations = async (request, reply) => {
    const page = pagination(request);
    const archived = InputValidator.parseOptionalBoolean(request.query.archived, 'Archived');
    if (!archived.valid) throw requestError(400, 'VALIDATION_ERROR', archived.message);
    const rows = await communityRepository.listConversations(request.authenticatedUser.userId, page, archived.value ?? false);
    return ok(reply, pageOf(rows, 'conversations', page));
  };

  getMessages = async (request, reply) => {
    const page = pagination(request);
    const result = await communityRepository.getMessages(request.params.conversationId, request.authenticatedUser.userId, page);
    return ok(reply, { ...pageOf(result.rows, 'messages', page), conversation: result.conversation });
  };

  sendMessage = async (request, reply) => {
    if (!request.body.body.trim()) throw requestError(400, 'VALIDATION_ERROR', 'Message cannot be blank');
    const row = await communityRepository.sendMessage(request.params.conversationId, request.authenticatedUser.userId, request.body);
    return ok(reply, { id: row.id, senderId: row.sender_id, body: row.body, createdAt: row.created_at, isDeleted: row.is_deleted }, 201);
  };

  updateConversation = async (request, reply) => ok(reply,
    await communityRepository.updateConversation(request.params.conversationId, request.authenticatedUser.userId, request.body));

  deleteMessage = async (request, reply) => {
    await communityRepository.deleteMessage(request.params.conversationId, request.params.messageId, request.authenticatedUser.userId);
    return ok(reply, { message: 'Message removed' });
  };

  getNotifications = async (request, reply) => {
    const page = pagination(request);
    const result = await communityRepository.notifications(request.authenticatedUser.userId, page);
    return ok(reply, { ...pageOf(result.rows, 'notifications', page), unreadCount: result.unreadCount });
  };

  readNotifications = async (request, reply) => {
    await communityRepository.readNotifications(request.authenticatedUser.userId, request.params.notificationId);
    return ok(reply, { message: 'Notifications marked read' });
  };

  uploadImage = async (request, reply) => {
    const content = await optimizeImage(request.body.data, request.body.mimeType);
    return ok(reply, await communityRepository.addImage(request.authenticatedUser.userId, request.body.purpose, content), 201);
  };

  getImage = async (request, reply) => {
    const image = await communityRepository.image(request.params.mediaId, request.authenticatedUser?.userId);
    return reply.type('image/webp').header('Cache-Control', image.owned ? 'private, no-store' : 'public, max-age=3600')
      .send(image.content);
  };

  getAnalytics = async (request, reply) => ok(reply, await communityRepository.analytics(request.authenticatedUser.userId));

  recordView = async (request, reply) => ok(reply,
    await communityRepository.recordView(request.authenticatedUser.userId, request.body.kind, request.body.resourceId));

  follow = async (request, reply) => ok(reply,
    await communityRepository.follow(request.authenticatedUser.userId, request.params.profileId, request.method === 'POST'));

  getComments = async (request, reply) => {
    const page = pagination(request);
    const rows = await communityRepository.comments(request.params.announcementId, request.authenticatedUser?.userId, page);
    return ok(reply, pageOf(rows, 'comments', page));
  };

  addComment = async (request, reply) => {
    if (!request.body.body.trim()) throw requestError(400, 'VALIDATION_ERROR', 'Comment cannot be blank');
    return ok(reply, await communityRepository.addComment(request.params.announcementId, request.authenticatedUser.userId, request.body.body), 201);
  };

  deleteComment = async (request, reply) => {
    await communityRepository.deleteComment(request.params.announcementId, request.params.commentId, request.authenticatedUser.userId);
    return ok(reply, { message: 'Comment removed' });
  };

  subscribePush = async (request, reply) => {
    validatePushSubscription(request.body);
    if (!this.config.push?.publicKey) throw requestError(503, 'PUSH_NOT_CONFIGURED', 'Browser push is not configured on this server');
    await communityRepository.subscribePush(request.authenticatedUser.userId, request.body);
    return ok(reply, { message: 'Push notifications enabled' }, 201);
  };

  unsubscribePush = async (request, reply) => {
    await communityRepository.unsubscribePush(request.authenticatedUser.userId, request.body.endpoint);
    return ok(reply, { message: 'Push notifications disabled for this browser' });
  };
}
