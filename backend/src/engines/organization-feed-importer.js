import { realmConnector } from '../repositories/realm-connector.js';
import { organizationContentRepository } from '../repositories/organization-content-repository.js';
import { fetchYoutubeFeed } from './youtube-feed.js';

// Background job that imports each band's public YouTube channel feed. It
// leases due bands with SKIP LOCKED so several API processes never fetch the
// same channel concurrently, fetches outside any transaction, and stores new
// videos plus follower notifications atomically. Disabled when the interval
// is 0 or when no configuration is supplied.
export class OrganizationFeedImporter {
  constructor({
    config, connector = realmConnector, repository = organizationContentRepository, fetchImpl, logger = console, batchSize = 5,
  } = {}) {
    this.config = config;
    this.connector = connector;
    this.repository = repository;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
    this.batchSize = batchSize;
    this.running = null;
    this.timer = null;
  }

  get intervalMinutes() {
    return this.config?.youtubeFeedIntervalMinutes ?? 0;
  }

  async lease() {
    const { rows } = await this.connector.execute(`
      UPDATE organizations SET feed_checked_at = NOW()
      WHERE id IN (
        SELECT id FROM organizations
        WHERE kind = 'band' AND is_deleted = FALSE AND youtube_channel_id IS NOT NULL
          AND (feed_checked_at IS NULL OR feed_checked_at < NOW() - make_interval(mins => $1))
        ORDER BY feed_checked_at NULLS FIRST, id LIMIT $2 FOR UPDATE SKIP LOCKED
      ) RETURNING id, youtube_channel_id`, [this.intervalMinutes, this.batchSize]);
    return rows;
  }

  async importOne({ id, youtube_channel_id: channelId }) {
    const entries = await fetchYoutubeFeed(channelId, this.fetchImpl ? { fetchImpl: this.fetchImpl } : {});
    return this.connector.transaction(executor => this.repository.importYoutubeEntries(executor, id, channelId, entries));
  }

  async run() {
    if (this.intervalMinutes <= 0) return { checked: 0, imported: 0 };
    const due = await this.lease();
    let imported = 0;
    for (const organization of due) {
      try {
        imported += (await this.importOne(organization)).length;
      } catch (error) {
        this.logger.warn({ organizationId: organization.id, err: { message: error.message, name: error.name } }, 'YouTube feed import failed; retrying next interval');
      }
    }
    return { checked: due.length, imported };
  }

  start() {
    if (this.intervalMinutes <= 0 || this.timer) return;
    const tick = () => {
      if (this.running) return;
      this.running = this.run()
        .catch(error => this.logger.error({ err: error }, 'Organization feed import failed'))
        .finally(() => { this.running = null; });
    };
    this.timer = setInterval(tick, 60000);
    this.timer.unref();
    tick();
  }

  async stop() {
    clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }
}
