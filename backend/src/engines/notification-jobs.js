import { realmConfig } from '../../config/realm.js';
import { realmConnector } from '../repositories/realm-connector.js';
import { NotificationEmailWorker, smtpNotificationMailer } from './notification-email-worker.js';
import { NotificationScheduler } from './notification-scheduler.js';

// Background lifecycle for notification email delivery and scheduled
// notifications, started and stopped with the API's other background jobs.
export class NotificationJobs {
  constructor({
    config = realmConfig,
    connector = realmConnector,
    mailer = smtpNotificationMailer,
    logger = console,
    intervalMs = 15000,
  } = {}) {
    this.logger = logger;
    this.intervalMs = intervalMs;
    this.scheduler = new NotificationScheduler({
      settings: config.notifications ?? realmConfig.notifications, connector, logger,
    });
    this.email = new NotificationEmailWorker({
      origin: config.boundaries.portalOrigins[0], connector, mailer, logger,
    });
    this.running = null;
    this.timer = null;
  }

  tick() {
    if (this.running) return this.running;
    this.running = (async () => {
      await this.scheduler.run();
      try {
        await this.email.dispatch();
      } catch (error) {
        this.logger.error({ err: error }, 'Notification email dispatch failed');
      }
    })().finally(() => { this.running = null; });
    return this.running;
  }

  start() {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.timer.unref();
  }

  async stop() {
    clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }
}
