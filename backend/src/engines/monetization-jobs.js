import { realmConnector } from '../repositories/realm-connector.js';
import { ratingRepository } from '../repositories/rating-repository.js';
import { referralRepository } from '../repositories/referral-repository.js';
import { pointsRepository } from '../repositories/points-repository.js';
import { billingRepository } from '../repositories/billing-repository.js';
import { sponsoredRepository } from '../repositories/sponsored-repository.js';
import { notificationRepository } from '../repositories/notification-repository.js';

// Periodic monetization work. Every step is idempotent and leases rows with
// SKIP LOCKED where needed, so several API processes can run it safely.
export class MonetizationJobs {
  constructor({ config, gateway, connector = realmConnector, logger = console }) {
    this.settings = config.monetization;
    this.gateway = gateway;
    this.connector = connector;
    this.logger = logger;
    this.timer = null;
    this.running = null;
  }

  start() {
    if (this.timer) return;
    const run = () => { this.running = this.runOnce().finally(() => { this.running = null; }); };
    this.timer = setInterval(run, this.settings.jobIntervalMinutes * 60000);
    this.timer.unref?.();
    setTimeout(run, 5000).unref?.();
  }

  async stop() {
    clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }

  async runOnce() {
    for (const [name, step] of [
      ['rating rewards', () => this.rewardRatings()],
      ['referral rewards', () => referralRepository.rewardPending(this.settings.points)],
      ['deleted billing customers', () => this.deleteOrphanedCustomers()],
      ['purge', () => this.purge()],
    ]) {
      try {
        await step();
      } catch (error) {
        this.logger.error({ err: error }, `Monetization job step failed: ${name}`);
      }
    }
  }

  // One rating reward per account: later ratings are marked processed with
  // no reference, so rating every release cannot be farmed for points.
  async rewardRatings() {
    const amount = this.settings.points.appRating;
    if (!amount) return 0;
    return this.connector.transaction(async (executor) => {
      let rewarded = 0;
      for (const rating of await ratingRepository.unrewarded(executor)) {
        const reference = `app_rating:${rating.userId}`;
        const credit = await pointsRepository.credit(executor, { userId: rating.userId, delta: amount, reason: 'app_rating', reference });
        await ratingRepository.markRewarded(executor, rating.id, credit.duplicate ? null : reference);
        if (credit.duplicate) continue;
        rewarded += 1;
        await notificationRepository.create(executor, {
          userId: rating.userId, kind: 'points_earned', title: `You earned ${amount} points`, link: '#wallet',
          key: `points:app_rating:${rating.userId}`, params: { points: amount, reason: 'app_rating' },
        });
      }
      return rewarded;
    });
  }

  async deleteOrphanedCustomers() {
    if (!this.gateway?.enabled) return 0;
    let deleted = 0;
    await this.connector.transaction(async (executor) => {
      for (const customerId of await billingRepository.orphanedCustomers(executor)) {
        await this.gateway.deleteCustomer(customerId);
        await billingRepository.forgetCustomer(executor, customerId);
        deleted += 1;
      }
    });
    return deleted;
  }

  async purge() {
    await this.connector.transaction(async (executor) => {
      await billingRepository.purgeEvents(executor);
      await sponsoredRepository.purgeViews(executor);
    });
  }
}
