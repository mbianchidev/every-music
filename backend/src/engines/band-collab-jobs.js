import { realmConnector } from '../repositories/realm-connector.js';
import { calendarRepository } from '../repositories/calendar-repository.js';
import { profileRatingRepository } from '../repositories/review-repository.js';

const DAY_MINUTES = 24 * 60;

// Background work for band collaboration: due calendar reminders every
// interval (rows leased with SKIP LOCKED), and a once-a-day republication of
// anonymous rating aggregates, leased through notification_job_runs.
export class BandCollabJobs {
  constructor({ config = {}, connector = realmConnector, logger = console, maxBatches = 20 } = {}) {
    this.connector = connector;
    this.logger = logger;
    this.intervalMs = (config.calendar?.reminderIntervalSeconds ?? 60) * 1000;
    this.maxBatches = maxBatches;
    this.running = null;
    this.timer = null;
  }

  async claim(name, minutes) {
    const { rows } = await this.connector.execute(`
      INSERT INTO notification_job_runs (name, last_run_at) VALUES ($1, NOW())
      ON CONFLICT (name) DO UPDATE SET last_run_at = NOW()
      WHERE notification_job_runs.last_run_at <= NOW() - make_interval(mins => $2::int)
      RETURNING name`, [name, minutes]);
    return rows.length > 0;
  }

  async sendReminders() {
    let sent = 0;
    for (let batch = 0; batch < this.maxBatches; batch += 1) {
      const result = await this.connector.transaction(executor => calendarRepository.dispatchDue(executor));
      sent += result.sent;
      if (result.leased < 100) break;
    }
    return sent;
  }

  async runOnce() {
    let reminders = 0;
    let ratingsPublished = false;
    try {
      reminders = await this.sendReminders();
    } catch (error) {
      this.logger.error({ err: error }, 'Calendar reminders failed');
    }
    try {
      if (await this.claim('profile_rating_publish', DAY_MINUTES)) {
        await this.connector.transaction(executor => profileRatingRepository.publish(executor));
        ratingsPublished = true;
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Publishing rating aggregates failed');
    }
    return { reminders, ratingsPublished };
  }

  start() {
    if (this.timer) return;
    const tick = () => {
      if (this.running) return;
      this.running = this.runOnce().finally(() => { this.running = null; });
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

