import { mediaRepository } from '../repositories/media-repository.js';
import { pushDeviceRepository } from '../repositories/push-device-repository.js';
import { nativePushAvailability, normalizeDeviceToken } from '../engines/native-push.js';
import { requestError } from '../engines/request-error.js';
import { ok } from './response-helpers.js';

const platformNames = { android: 'Android', ios: 'iOS' };

// Streams managed media without a JSON envelope. Only media readable through a
// public reference may be cached by browsers and shared proxies.
export function sendMedia(reply, media) {
  reply.type(media.mimeType)
    .header('Content-Length', media.byteSize)
    .header('Cache-Control', media.public && !media.owned ? 'public, max-age=3600' : 'private, no-store');
  if (media.purpose === 'attachment') {
    reply.header('Content-Disposition', `attachment; filename="${media.id}.bin"`);
  }
  return reply.send(media.body);
}

export class InfrastructureConductor {
  constructor(config) {
    this.config = config;
  }

  availability() {
    return nativePushAvailability(this.config.nativePush);
  }

  uploadBlob = async (request, reply) => {
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      throw requestError(400, 'INVALID_BLOB', 'Send the encrypted bytes as a non-empty application/octet-stream body');
    }
    return ok(reply, await mediaRepository.storeAttachment(request.authenticatedUser.userId, request.body), 201);
  };

  listDevices = async (request, reply) => ok(reply, {
    providers: this.availability(),
    devices: await pushDeviceRepository.list(request.authenticatedUser.userId),
  });

  registerDevice = async (request, reply) => {
    const { platform } = request.body;
    const token = normalizeDeviceToken(platform, request.body.token);
    if (!this.availability()[platform]) {
      throw requestError(503, 'PUSH_NOT_CONFIGURED', `${platformNames[platform]} push is not configured on this server`);
    }
    return ok(reply, await pushDeviceRepository.register(request.authenticatedUser.userId, platform, token), 201);
  };

  unregisterDevice = async (request, reply) => {
    const { platform } = request.body;
    await pushDeviceRepository.removeToken(request.authenticatedUser.userId, platform, normalizeDeviceToken(platform, request.body.token));
    return ok(reply, { message: 'Push notifications disabled for this device' });
  };

  removeDevice = async (request, reply) => {
    await pushDeviceRepository.remove(request.authenticatedUser.userId, request.params.deviceId);
    return ok(reply, { message: 'Device removed' });
  };
}
