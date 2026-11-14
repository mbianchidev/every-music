import { realmConnector } from '../repositories/realm-connector.js';
import { marketplaceRepository } from '../repositories/marketplace-repository.js';

const HOUR = 60 * 60 * 1000;

// Hourly marketplace maintenance: expiry reminders, then removal of listings
// that expired or were moderated more than a year ago.
export class MarketplaceExpiryJob {
  constructor({ config, connector = realmConnector, logger = console, intervalMs = HOUR, maxBatches = 20 }) {
    this.config = config;
    this.connector = connector;
    this.logger = logger;
    this.intervalMs = intervalMs;
    this.maxBatches = maxBatches;
    this.running = null;
  }

  async runOnce() {
    let notified = 0;
    for (let batch = 0; batch < this.maxBatches; batch += 1) {
      const count = await this.connector.transaction(executor => marketplaceRepository.notifyExpiring(executor, {
        reminderDays: this.config.expiryReminderDays,
      }));
      notified += count;
      if (count < 100) break;
    }
    const purged = await this.connector.transaction(executor => marketplaceRepository.purgeStale(executor));
    return { notified, purged };
  }

  start() {
    const tick = () => {
      if (this.running) return;
      this.running = this.runOnce()
        .catch(error => this.logger.error({ err: error }, 'Marketplace expiry maintenance failed'))
        .finally(() => { this.running = null; });
    };
    tick();
    this.timer = setInterval(tick, this.intervalMs);
    this.timer.unref();
  }

  async stop() {
    clearInterval(this.timer);
    await this.running;
  }
}
