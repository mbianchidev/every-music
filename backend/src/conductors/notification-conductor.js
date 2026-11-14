import { notificationPreferenceRepository } from '../repositories/notification-preference-repository.js';
import { smtpNotificationMailer } from '../engines/notification-email-worker.js';
import { ok } from './response-helpers.js';

export class NotificationConductor {
  constructor(config, mailer = smtpNotificationMailer) {
    this.config = config;
    this.mailer = mailer;
  }

  view(overview) {
    return {
      ...overview,
      pushConfigured: Boolean(this.config.push?.publicKey),
      email: { ...overview.email, configured: this.mailer.available },
    };
  }

  getPreferences = async (request, reply) => ok(reply,
    this.view(await notificationPreferenceRepository.overview(request.authenticatedUser.userId)));

  updatePreferences = async (request, reply) => ok(reply,
    this.view(await notificationPreferenceRepository.update(request.authenticatedUser.userId, request.body.kinds)));
}
