import { releaseRepository } from '../repositories/release-repository.js';
import { supportRepository } from '../repositories/support-repository.js';

const HOUR = 60 * 60 * 1000;

// Startup release announcement and hourly support-request retention.
export class HelpJobs {
  constructor({ config, logger }) {
    this.config = config;
    this.logger = logger;
    this.timer = null;
    this.running = null;
  }

  start() {
    this.running = this.run(async () => {
      const release = await releaseRepository.recordStartup(this.config.application.version);
      if (release.invalid) {
        this.logger.warn({ version: release.version }, 'APP_VERSION is not MAJOR.MINOR.PATCH; update notices are disabled');
      } else if (release.kind) {
        this.logger.info({ version: release.version, kind: release.kind, notified: release.notified }, 'Announced application update');
      }
      await this.maintain();
    });
    this.timer = setInterval(() => { this.running = this.run(() => this.maintain()); }, HOUR);
    this.timer.unref();
  }

  async run(task) {
    try { await task(); } catch (error) { this.logger.error({ err: error }, 'Help center background job failed'); }
  }

  async maintain() {
    const removed = await supportRepository.cleanup();
    if (removed) this.logger.info({ removed }, 'Removed expired support requests');
  }

  async stop() {
    clearInterval(this.timer);
    await this.running;
  }
}
