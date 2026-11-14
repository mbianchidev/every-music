import { realmConnector } from '../repositories/realm-connector.js';
import { eventRepository } from '../repositories/event-repository.js';

const HOUR_MS = 60 * 60 * 1000;

// Sends due event reminders every `intervalSeconds` (0 disables the job) and
// hourly removes reminders of events that ended or were cancelled. Due rows
// are leased with SKIP LOCKED, so several API processes can run it safely.
export class EventReminderJob {
  constructor({ intervalSeconds = 60, connector = realmConnector, logger = console, maxBatches = 20 } = {}) {
    this.intervalMs = intervalSeconds * 1000;
    this.connector = connector;
    this.logger = logger;
    this.maxBatches = maxBatches;
    this.running = null;
    this.timer = null;
    this.lastPurge = 0;
  }

  async runOnce() {
    let sent = 0;
    for (let batch = 0; batch < this.maxBatches; batch += 1) {
      const result = await this.connector.transaction(executor => eventRepository.sendDueReminders(executor));
      sent += result.sent;
      if (result.leased < 100) break;
    }
    let purged = 0;
    if (Date.now() - this.lastPurge >= HOUR_MS) {
      purged = await this.connector.transaction(executor => eventRepository.purgeReminders(executor));
      this.lastPurge = Date.now();
    }
    return { sent, purged };
  }

  start() {
    if (this.timer || this.intervalMs <= 0) return;
    const tick = () => {
      if (this.running) return;
      this.running = this.runOnce()
        .catch(error => this.logger.error({ err: error }, 'Event reminder job failed'))
        .finally(() => { this.running = null; });
    };
    tick();
    this.timer = setInterval(tick, this.intervalMs);
    this.timer.unref();
  }

  async stop() {
    clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }
}
