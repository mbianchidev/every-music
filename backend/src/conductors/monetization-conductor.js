import { randomUUID } from 'node:crypto';
import { realmConnector } from '../repositories/realm-connector.js';
import { pointsRepository } from '../repositories/points-repository.js';
import { promotionRepository } from '../repositories/promotion-repository.js';
import { referralRepository } from '../repositories/referral-repository.js';
import { sponsoredRepository } from '../repositories/sponsored-repository.js';
import { billingRepository } from '../repositories/billing-repository.js';
import { entitlementRepository } from '../repositories/entitlement-repository.js';
import { administrationRepository } from '../repositories/administration-repository.js';
import { notificationRepository } from '../repositories/notification-repository.js';
import { mediaRepository } from '../repositories/media-repository.js';
import { publishEvent } from '../repositories/event-publisher.js';
import { pointsRules } from '../engines/monetization-rules.js';
import { requestError } from '../engines/request-error.js';
import { ok, pageOf, pagination } from './response-helpers.js';

const OFFER_BATCH = 1000;
const VIDEO_TYPES = {
  'video/mp4': bytes => bytes.length > 12 && bytes.toString('latin1', 4, 8) === 'ftyp',
  'video/webm': bytes => bytes.length > 4 && bytes.readUInt32BE(0) === 0x1a45dfa3,
};

// Parses a single "bytes=start-end" range; multiple ranges are not supported.
export function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return { invalid: true };
  let start;
  let end;
  if (match[1] === '') {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start > end || start >= size) return { invalid: true };
  return { start, end };
}

// Points wallet, promotions, referrals, rewarded videos, sponsored cards,
// the sponsored-card preference and the administrator monetization console.
export class MonetizationConductor {
  constructor(config, billing) {
    this.config = config;
    this.points = config.monetization.points;
    this.billing = billing;
    this.origin = config.boundaries.portalOrigins[0];
  }

  wallet = async (request, reply) => {
    const { userId } = request.authenticatedUser;
    const [balance, promotions] = await Promise.all([pointsRepository.balance(userId), promotionRepository.mine(userId)]);
    return ok(reply, { balance, rules: pointsRules(this.points), promotions });
  };

  ledger = async (request, reply) => {
    const page = pagination(request);
    return ok(reply, pageOf(await pointsRepository.ledger(request.authenticatedUser.userId, page), 'entries', page));
  };

  spend = async (request, reply) => {
    const body = request.body;
    const result = await promotionRepository.spend(request.authenticatedUser.userId, {
      kind: body.kind, days: body.days, announcementId: body.announcementId?.toLowerCase(),
      placeId: body.placeId, radiusKm: body.radiusKm,
    }, this.points);
    return ok(reply, result, 201);
  };

  referrals = async (request, reply) => ok(reply, await referralRepository.overview(request.authenticatedUser.userId, this.origin, this.points));

  claimReferral = async (request, reply) => {
    const result = await referralRepository.claim(request.authenticatedUser.userId, request.body.code, this.points);
    return ok(reply, { ...result, overview: await referralRepository.overview(request.authenticatedUser.userId, this.origin, this.points) }, 201);
  };

  rewardedVideos = async (request, reply) => ok(reply, await sponsoredRepository.rewardedVideos(request.authenticatedUser.userId, this.points));

  startView = async (request, reply) => ok(reply,
    await sponsoredRepository.startView(request.authenticatedUser.userId, request.params.cardId.toLowerCase(), this.points), 201);

  completeView = async (request, reply) => ok(reply,
    await sponsoredRepository.completeView(request.authenticatedUser.userId, request.body.token, this.points));

  click = async (request, reply) => ok(reply, await sponsoredRepository.click(request.params.cardId.toLowerCase()));

  video = async (request, reply) => {
    const mediaId = await sponsoredRepository.liveVideo(request.params.cardId.toLowerCase());
    const media = await mediaRepository.open(mediaId, null, { logger: request.log });
    const size = media.body.length;
    const range = parseRange(request.headers.range, size);
    reply.type(media.mimeType).header('Accept-Ranges', 'bytes').header('Cache-Control', 'public, max-age=3600');
    if (range?.invalid) return reply.code(416).header('Content-Range', `bytes */${size}`).send();
    if (!range) return reply.header('Content-Length', size).send(media.body);
    return reply.code(206).header('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
      .header('Content-Length', range.end - range.start + 1).send(media.body.subarray(range.start, range.end + 1));
  };

  settings = async (request, reply) => {
    const { userId } = request.authenticatedUser;
    const [{ plan }, settings] = await Promise.all([entitlementRepository.limitsFor(userId), sponsoredRepository.settings(userId)]);
    return ok(reply, { ...settings, eligible: plan !== 'free' });
  };

  saveSettings = async (request, reply) => {
    const { userId } = request.authenticatedUser;
    const result = await realmConnector.transaction(async (executor) => {
      const { plan } = await entitlementRepository.limitsFor(userId, executor);
      if (request.body.hideSponsored && plan === 'free') {
        throw requestError(403, 'PLAN_LIMIT_REACHED', 'Hiding sponsored cards is a Premium perk. Upgrade to turn it on.');
      }
      return sponsoredRepository.saveSettings(executor, userId, request.body);
    });
    return ok(reply, { ...result, eligible: true });
  };

  // Responds only after the administrator's transaction has committed.
  admin = (operation, status = 200) => async (request, reply) => ok(reply,
    await administrationRepository.withAdmin(request.authenticatedUser.userId, executor => operation(executor, request)), status);

  adminOverview = this.admin(async (executor, request) => {
    const { rows: offers } = await executor.execute(`
      SELECT id, headline, audience, recipients, created_at FROM offer_broadcasts ORDER BY created_at DESC, id LIMIT 10`);
    return {
      payments: { enabled: this.billing.gateway.enabled, subscriptions: await billingRepository.stats(executor) },
      points: await pointsRepository.totals(executor),
      promotions: await promotionRepository.stats(executor),
      referrals: await referralRepository.stats(executor),
      sponsored: await sponsoredRepository.totals(executor),
      offers: offers.map(row => ({ id: row.id, headline: row.headline, audience: row.audience, recipients: row.recipients, createdAt: row.created_at })),
      grants: await pointsRepository.recentGrants(executor),
      rules: pointsRules(this.points),
      limits: { videoBytes: this.config.monetization.sponsoredVideoBytes },
    };
  });

  listCards = this.admin(async (executor, request) => {
    const page = pagination(request);
    return pageOf(await sponsoredRepository.list(executor, page), 'cards', page);
  });

  createCard = this.admin(async (executor, request) => {
    const card = await sponsoredRepository.create(executor, request.authenticatedUser.userId, request.body);
    await administrationRepository.audit(executor, request.authenticatedUser.userId, 'sponsored_card_created', card.id);
    await publishEvent(executor, 'sponsored.changed');
    return card;
  }, 201);

  updateCard = this.admin(async (executor, request) => {
    const card = await sponsoredRepository.update(executor, request.authenticatedUser.userId, request.params.cardId, request.body);
    await administrationRepository.audit(executor, request.authenticatedUser.userId, 'sponsored_card_updated', card.id);
    await publishEvent(executor, 'sponsored.changed');
    return card;
  });

  deleteCard = this.admin(async (executor, request) => {
    await sponsoredRepository.remove(executor, request.params.cardId);
    await administrationRepository.audit(executor, request.authenticatedUser.userId, 'sponsored_card_deleted', request.params.cardId);
    await publishEvent(executor, 'sponsored.changed');
    return { id: request.params.cardId };
  });

  uploadVideo = async (request, reply) => {
    const { data, mimeType } = request.body;
    const limit = this.config.monetization.sponsoredVideoBytes;
    const bytes = /^[A-Za-z0-9+/]+={0,2}$/.test(data) && data.length % 4 === 0 ? Buffer.from(data, 'base64') : null;
    if (!bytes?.length || bytes.length > limit || !VIDEO_TYPES[mimeType]?.(bytes)) {
      throw requestError(400, 'INVALID_VIDEO', `Choose an MP4 or WebM video up to ${Math.floor(limit / 1048576)} MiB`);
    }
    const actorId = request.authenticatedUser.userId;
    await administrationRepository.withAdmin(actorId, executor => sponsoredRepository.lock(executor, request.params.cardId));
    // Stored outside the transaction: if attaching fails, the unreferenced
    // upload is removed by the hourly media cleanup like any other orphan.
    const media = await mediaRepository.store(actorId, 'sponsored', bytes, mimeType);
    const card = await administrationRepository.withAdmin(actorId, async (executor) => {
      const attached = await sponsoredRepository.attachVideo(executor, request.params.cardId, media.id);
      await administrationRepository.audit(executor, actorId, 'sponsored_video_uploaded', attached.id);
      await publishEvent(executor, 'sponsored.changed');
      return attached;
    });
    return ok(reply, card, 201);
  };

  // Fans out one "offers" notification per recipient; each recipient's
  // channel choices (including opting out) apply as for any notification.
  broadcastOffer = this.admin(async (executor, request) => {
    const { headline, message, link = null, audience } = request.body;
    if (!headline.trim() || !message.trim()) throw requestError(400, 'VALIDATION_ERROR', 'Write a headline and a message');
    const actorId = request.authenticatedUser.userId;
    const { rows: [broadcast] } = await executor.execute(`
      INSERT INTO offer_broadcasts (actor_id, headline, body, link, audience) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
    [actorId, headline.trim(), message.trim(), link, audience]);
    const paid = `EXISTS(SELECT 1 FROM user_entitlements e WHERE e.user_id = u.id AND e.revoked_at IS NULL
      AND e.starts_at <= NOW() AND (e.ends_at IS NULL OR e.ends_at > NOW()))`;
    const { rows } = await executor.execute(`
      SELECT u.id FROM users u WHERE u.is_active = TRUE AND u.is_deleted = FALSE AND u.email_verified = TRUE
        AND ($1 = 'all' OR ($1 = 'paid') = ${paid}) ORDER BY u.id`, [audience]);
    let recipients = 0;
    for (let index = 0; index < rows.length; index += OFFER_BATCH) {
      const created = await notificationRepository.createMany(executor, rows.slice(index, index + OFFER_BATCH).map(row => row.id), {
        kind: 'offers', title: headline.trim(), link: link ?? '#store', keyPrefix: `offer:${broadcast.id}`,
        params: { headline: headline.trim(), message: message.trim() },
      });
      recipients += created.length;
    }
    await executor.execute('UPDATE offer_broadcasts SET recipients = $2 WHERE id = $1', [broadcast.id, recipients]);
    await administrationRepository.audit(executor, actorId, 'offer_broadcast', broadcast.id);
    return { id: broadcast.id, recipients, createdAt: broadcast.created_at };
  }, 201);

  grantPoints = this.admin(async (executor, request) => {
    const { email, points, note } = request.body;
    const actorId = request.authenticatedUser.userId;
    const userId = await pointsRepository.lookupUser(executor, email.trim());
    const grantId = randomUUID();
    const result = await pointsRepository.credit(executor, {
      userId, delta: points, reason: 'event_grant', reference: `grant:${grantId}`, actorId, note: note.trim(),
    });
    await administrationRepository.audit(executor, actorId, 'points_granted', userId);
    await notificationRepository.create(executor, {
      userId, kind: 'points_earned', title: `You earned ${points} points`, link: '#wallet',
      key: `points:grant:${grantId}`, params: { points, reason: 'event_grant' },
    });
    return { userId, points, balance: result.balance, entry: result.entry };
  }, 201);
}
