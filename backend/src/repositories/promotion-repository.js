import { randomUUID } from 'node:crypto';
import { realmConnector } from './realm-connector.js';
import { pointsRepository } from './points-repository.js';
import { placeRepository } from './place-repository.js';
import { publishEvent } from './event-publisher.js';
import { requestError } from '../engines/request-error.js';
import { distanceSql } from '../engines/geo.js';
import { spendCost } from '../engines/monetization-rules.js';

const LIVE = 'p.starts_at <= NOW() AND p.ends_at > NOW()';
const CANDIDATE_LIMIT = 200;
const candidate = row => ({ id: row.id, kind: row.kind === 'announcement_pin' ? 'pinned' : 'boosted' });

function promotionView(row) {
  return {
    id: row.id, kind: row.kind, announcementId: row.announcement_id, announcementTitle: row.announcement_title ?? null,
    placeLabel: row.place_label, radiusKm: row.radius_km, startsAt: row.starts_at, endsAt: row.ends_at,
    days: row.days, pointsSpent: row.points_spent, createdAt: row.created_at,
    active: new Date(row.starts_at) <= new Date() && new Date(row.ends_at) > new Date(),
  };
}

// Promotions bought with points: profile and announcement boosts, area pins,
// and Premium days (an entitlement with source 'points'). Repeated boosts of
// the same target and Premium days queue after the current period instead of
// overlapping it.
class PromotionRepository {
  async spend(userId, input, points) {
    const cost = spendCost(points, input);
    return realmConnector.transaction(async (executor) => {
      const id = randomUUID();
      if (input.kind === 'premium_days') {
        const debit = await pointsRepository.debit(executor, {
          userId, points: cost, reason: 'premium_days', reference: `premium:${id}`, note: `${input.days} days`,
        });
        const { rows: [entitlement] } = await executor.execute(`
          WITH queued AS (
            SELECT GREATEST(NOW(), COALESCE(MAX(ends_at), NOW())) AS starts_at FROM user_entitlements
            WHERE user_id = $1 AND source = 'points' AND plan = 'premium' AND revoked_at IS NULL
          )
          INSERT INTO user_entitlements (user_id, plan, source, reference, starts_at, ends_at)
          SELECT $1, 'premium', 'points', $2, starts_at, starts_at + make_interval(days => $3::int) FROM queued
          RETURNING id, plan, source, starts_at, ends_at`, [userId, `points:${id}`, input.days]);
        await publishEvent(executor, 'entitlements.changed', { userId });
        return {
          kind: 'premium_days', cost, balance: debit.balance,
          entitlement: { id: entitlement.id, plan: entitlement.plan, startsAt: entitlement.starts_at, endsAt: entitlement.ends_at },
        };
      }
      const target = await this.target(executor, userId, input);
      // Debiting first locks the balance row, which serializes this user's
      // purchases so queued periods cannot overlap.
      const debit = await pointsRepository.debit(executor, {
        userId, points: cost, reason: input.kind, reference: `promotion:${id}`, note: `${input.days} days`,
      });
      const { rows: [queue] } = await executor.execute(`
        SELECT GREATEST(NOW(), COALESCE(MAX(ends_at), NOW())) AS starts_at FROM promotions
        WHERE user_id = $1 AND kind = $2 AND announcement_id IS NOT DISTINCT FROM $3 AND $2 <> 'announcement_pin'`,
      [userId, input.kind, target.announcementId]);
      const startsAt = new Date(queue.starts_at);
      const endsAt = new Date(startsAt.getTime() + input.days * 86400000);
      if (target.expiresAt && new Date(target.expiresAt) < endsAt) {
        throw requestError(409, 'ANNOUNCEMENT_EXPIRES_FIRST',
          'This call expires before the promotion would end. Extend the call or choose a shorter duration.');
      }
      const { rows: [row] } = await executor.execute(`
        INSERT INTO promotions (id, user_id, kind, announcement_id, place_id, place_label, latitude, longitude, radius_km,
          country_code, region_code, starts_at, ends_at, days, points_spent)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`, [
        id, userId, input.kind, target.announcementId, target.place?.id ?? null, target.place?.label ?? null,
        target.place?.latitude ?? null, target.place?.longitude ?? null, input.kind === 'announcement_pin' ? input.radiusKm : null,
        target.place?.countryCode ?? null, target.place?.regionCode ?? null, startsAt, endsAt, input.days, cost,
      ]);
      await publishEvent(executor, input.kind === 'profile_boost' ? 'profiles.changed' : 'announcements.changed',
        { id: target.announcementId ?? userId });
      return { kind: input.kind, cost, balance: debit.balance, promotion: promotionView(row) };
    });
  }

  async target(executor, userId, { kind, announcementId, placeId }) {
    if (kind === 'profile_boost') {
      const { rows } = await executor.execute(`
        SELECT p.id FROM profiles p JOIN users u ON u.id = p.user_id
        WHERE p.user_id = $1 AND u.is_active AND NOT u.is_deleted`, [userId]);
      if (!rows.length) throw requestError(409, 'PROFILE_REQUIRED', 'Create your profile before boosting it');
      return { announcementId: null };
    }
    if (!announcementId) throw requestError(400, 'INVALID_SPEND', 'Choose one of your calls to promote');
    const { rows } = await executor.execute(`
      SELECT id, expires_at, is_published FROM announcements
      WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE FOR SHARE`, [announcementId, userId]);
    if (!rows.length) throw requestError(404, 'ANNOUNCEMENT_NOT_FOUND', 'Announcement not found');
    const announcement = rows[0];
    if (!announcement.is_published || (announcement.expires_at && new Date(announcement.expires_at) <= new Date())) {
      throw requestError(409, 'ANNOUNCEMENT_NOT_LIVE', 'Only published, unexpired calls can be promoted');
    }
    const result = { announcementId: announcement.id, expiresAt: announcement.expires_at };
    if (kind === 'announcement_pin') {
      result.place = await placeRepository.find(placeId, executor);
      if (!result.place) throw requestError(400, 'PLACE_NOT_FOUND', 'Choose a city from the suggestions for the pin area');
    }
    return result;
  }

  async mine(userId) {
    const { rows } = await realmConnector.execute(`
      SELECT p.*, a.title AS announcement_title FROM promotions p LEFT JOIN announcements a ON a.id = p.announcement_id
      WHERE p.user_id = $1 AND p.ends_at > NOW() - INTERVAL '30 days'
      ORDER BY p.ends_at DESC, p.id LIMIT 50`, [userId]);
    return rows.map(promotionView);
  }

  // Ranked live announcement promotions for a search: area pins matching
  // the searched (or, without a location filter, the viewer's) area come
  // first, then boosts. Rotation changes daily so no promotion owns the top.
  async announcementCandidates({ location = {}, viewerId = null }) {
    const values = [];
    const add = (value) => { values.push(value); return `$${values.length}`; };
    const pinDistance = (latitude, longitude) => distanceSql('p.latitude', 'p.longitude', latitude, longitude);
    let area = 'FALSE';
    if (location.center) {
      area = `${pinDistance(`${add(location.center.latitude)}::float8`, `${add(location.center.longitude)}::float8`)} <= p.radius_km`;
    } else if (location.country) {
      area = `p.country_code = ${add(location.country)}${location.region ? ` AND p.region_code = ${add(location.region)}` : ''}`;
    } else if (viewerId) {
      area = `EXISTS(SELECT 1 FROM profiles vp WHERE vp.user_id = ${add(viewerId)}::uuid AND vp.latitude IS NOT NULL
        AND ${pinDistance('vp.latitude::float8', 'vp.longitude::float8')} <= p.radius_km)`;
    }
    const { rows } = await realmConnector.execute(`
      SELECT p.announcement_id AS id, p.kind FROM promotions p
      WHERE ${LIVE} AND (p.kind = 'announcement_boost' OR (p.kind = 'announcement_pin' AND ${area}))
      ORDER BY (p.kind = 'announcement_pin') DESC, md5(p.id::text || CURRENT_DATE::text)
      LIMIT ${CANDIDATE_LIMIT}`, values);
    return rows.map(candidate);
  }

  async profileCandidates() {
    const { rows } = await realmConnector.execute(`
      SELECT p.user_id AS id, p.kind FROM promotions p
      WHERE ${LIVE} AND p.kind = 'profile_boost'
      ORDER BY md5(p.id::text || CURRENT_DATE::text) LIMIT ${CANDIDATE_LIMIT}`);
    return rows.map(candidate);
  }

  async stats(executor) {
    const { rows } = await executor.execute(`
      SELECT kind, COUNT(*)::int AS count FROM promotions p WHERE ${LIVE} GROUP BY kind`);
    return Object.fromEntries(['profile_boost', 'announcement_boost', 'announcement_pin']
      .map(kind => [kind, rows.find(row => row.kind === kind)?.count ?? 0]));
  }
}

export const promotionRepository = new PromotionRepository();
