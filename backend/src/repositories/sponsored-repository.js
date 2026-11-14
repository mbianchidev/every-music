import { createHash, randomBytes } from 'node:crypto';
import { realmConnector } from './realm-connector.js';
import { pointsRepository } from './points-repository.js';
import { placeRepository } from './place-repository.js';
import { requestError } from '../engines/request-error.js';
import { distanceSql } from '../engines/geo.js';
import { sponsoredSlots } from '../engines/monetization-rules.js';

const LIVE = 'c.is_active = TRUE AND c.starts_at <= NOW() AND (c.ends_at IS NULL OR c.ends_at > NOW())';
const REWARDED = '(c.video_url IS NOT NULL OR c.video_media_id IS NOT NULL)';
const VIEW_TOKEN_TTL_MINUTES = 60;
export const sponsoredVideoPath = id => `/realm/sponsored/${id}/video`;
const hashToken = token => createHash('sha256').update(token).digest('hex');

// Public shape of a sponsored card. Links are absolute https URLs chosen by
// administrators; the client opens them with rel="sponsored noopener noreferrer".
export function sponsoredCardView(row, rewardPoints) {
  const rewarded = Boolean(row.video_url || row.video_media_id);
  return {
    id: row.id, sponsorName: row.sponsor_name, title: row.title, body: row.body,
    linkUrl: row.link_url, linkLabel: row.link_label, imageUrl: row.image_url, imageAlt: row.image_alt,
    rewarded, rewardPoints: rewarded ? row.reward_points ?? rewardPoints : null,
  };
}

function adminView(row) {
  return {
    ...sponsoredCardView(row, null),
    rewardPoints: row.reward_points, videoUrl: row.video_url,
    videoMediaUrl: row.video_media_id ? `/realm/media/${row.video_media_id}` : null,
    videoSeconds: row.video_seconds, placements: row.placements, genreIds: row.genre_ids, instrumentIds: row.instrument_ids,
    placeId: row.place_id, placeLabel: row.place_label, radiusKm: row.radius_km,
    startsAt: row.starts_at, endsAt: row.ends_at, priority: row.priority, maxPerPage: row.max_per_page, active: row.is_active,
    live: row.is_active && new Date(row.starts_at) <= new Date() && (!row.ends_at || new Date(row.ends_at) > new Date()),
    createdAt: row.created_at, updatedAt: row.updated_at,
    stats: row.impressions === undefined ? undefined : {
      impressions: row.impressions, clicks: row.clicks, videoCompletions: row.video_completions,
    },
  };
}

const FIELDS = {
  sponsorName: 'sponsor_name', title: 'title', body: 'body', linkUrl: 'link_url', linkLabel: 'link_label',
  imageUrl: 'image_url', imageAlt: 'image_alt', videoUrl: 'video_url', videoSeconds: 'video_seconds',
  rewardPoints: 'reward_points', placements: 'placements', genreIds: 'genre_ids', instrumentIds: 'instrument_ids',
  startsAt: 'starts_at', endsAt: 'ends_at', priority: 'priority', maxPerPage: 'max_per_page', active: 'is_active',
};

// First-party sponsored cards managed by administrators, their aggregate
// daily statistics, and rewarded video views.
class SponsoredRepository {
  async normalize(executor, input, actorId, existing = null) {
    const values = {};
    for (const [key, column] of Object.entries(FIELDS)) {
      if (input[key] !== undefined) values[column] = typeof input[key] === 'string' ? input[key].trim() || null : input[key];
    }
    if (values.image_url && values.image_url !== existing?.image_url) {
      const { rows } = await executor.execute(`SELECT id FROM media WHERE id = $1 AND user_id = $2 AND purpose = 'sponsored'`,
        [values.image_url.slice('/realm/media/'.length), actorId]);
      if (!rows.length) throw requestError(400, 'INVALID_MEDIA', 'Upload the card image as a sponsored image first');
    }
    if (values.image_url && !(values.image_alt ?? existing?.image_alt)) {
      throw requestError(400, 'IMAGE_ALT_REQUIRED', 'Describe the image for people who cannot see it');
    }
    for (const column of ['sponsor_name', 'title', 'body']) {
      if (column in values && !values[column]) throw requestError(400, 'VALIDATION_ERROR', 'Sponsor, title, and text cannot be blank');
    }
    const startsAt = new Date(values.starts_at ?? existing?.starts_at ?? Date.now());
    const endsAt = values.ends_at === undefined ? existing?.ends_at : values.ends_at;
    if (endsAt && new Date(endsAt) <= startsAt) throw requestError(400, 'INVALID_DATES', 'The end date must be after the start date');
    if (values.video_url) values.video_media_id = null;
    for (const [key, table] of [['genre_ids', 'genres'], ['instrument_ids', 'instruments']]) {
      if (!values[key]?.length) continue;
      values[key] = [...new Set(values[key].map(id => id.toLowerCase()))];
      const { rows } = await executor.execute(`SELECT COUNT(*)::int AS count FROM ${table} WHERE id = ANY($1::uuid[])`, [values[key]]);
      if (rows[0].count !== values[key].length) throw requestError(400, 'INVALID_TARGETING', 'Choose genres and instruments from the catalog');
    }
    if (input.placeId !== undefined) {
      if (input.placeId === null) Object.assign(values, { place_id: null, place_label: null, latitude: null, longitude: null, radius_km: null });
      else {
        const place = await placeRepository.find(input.placeId, executor);
        if (!place) throw requestError(400, 'PLACE_NOT_FOUND', 'Choose a city from the suggestions');
        if (!(input.radiusKm ?? existing?.radius_km)) throw requestError(400, 'RADIUS_REQUIRED', 'Choose a radius for the target area');
        Object.assign(values, {
          place_id: place.id, place_label: place.label, latitude: place.latitude, longitude: place.longitude,
          radius_km: input.radiusKm ?? existing.radius_km,
        });
      }
    } else if (input.radiusKm !== undefined && existing?.place_id) values.radius_km = input.radiusKm;
    return values;
  }

  async create(executor, actorId, input) {
    const values = { ...await this.normalize(executor, input, actorId), created_by: actorId };
    const columns = Object.keys(values);
    const { rows } = await executor.execute(`
      INSERT INTO sponsored_cards (${columns.join(', ')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})
      RETURNING *`, Object.values(values));
    return adminView(rows[0]);
  }

  async lock(executor, id) {
    const { rows } = await executor.execute('SELECT * FROM sponsored_cards WHERE id = $1 FOR UPDATE', [id]);
    if (!rows.length) throw requestError(404, 'SPONSORED_CARD_NOT_FOUND', 'Sponsored card not found');
    return rows[0];
  }

  async update(executor, actorId, id, input) {
    const existing = await this.lock(executor, id);
    const values = await this.normalize(executor, input, actorId, existing);
    if (!Object.keys(values).length) return adminView(existing);
    const entries = Object.entries(values);
    const { rows } = await executor.execute(`
      UPDATE sponsored_cards SET ${entries.map(([column], index) => `${column} = $${index + 2}`).join(', ')}, updated_at = NOW()
      WHERE id = $1 RETURNING *`, [id, ...entries.map(([, value]) => value)]);
    return adminView(rows[0]);
  }

  async attachVideo(executor, id, mediaId) {
    await this.lock(executor, id);
    const { rows } = await executor.execute(`
      UPDATE sponsored_cards SET video_media_id = $2, video_url = NULL, updated_at = NOW() WHERE id = $1 RETURNING *`, [id, mediaId]);
    return adminView(rows[0]);
  }

  async remove(executor, id) {
    const { rows } = await executor.execute('DELETE FROM sponsored_cards WHERE id = $1 RETURNING id', [id]);
    if (!rows.length) throw requestError(404, 'SPONSORED_CARD_NOT_FOUND', 'Sponsored card not found');
  }

  async list(executor, { page, pageSize }) {
    const { rows } = await executor.execute(`
      SELECT c.*, COALESCE(s.impressions, 0)::int AS impressions, COALESCE(s.clicks, 0)::int AS clicks,
        COALESCE(s.video_completions, 0)::int AS video_completions
      FROM sponsored_cards c LEFT JOIN (
        SELECT card_id, SUM(impressions) AS impressions, SUM(clicks) AS clicks, SUM(video_completions) AS video_completions
        FROM sponsored_card_stats WHERE day > CURRENT_DATE - 30 GROUP BY card_id
      ) s ON s.card_id = c.id
      ORDER BY c.is_active DESC, c.priority DESC, c.created_at DESC, c.id LIMIT $1 OFFSET $2`, [pageSize + 1, (page - 1) * pageSize]);
    return rows.map(adminView);
  }

  async totals(executor) {
    const { rows: [row] } = await executor.execute(`
      SELECT COALESCE(SUM(impressions), 0)::int AS impressions, COALESCE(SUM(clicks), 0)::int AS clicks,
        COALESCE(SUM(video_completions), 0)::int AS video_completions,
        (SELECT COUNT(*)::int FROM sponsored_cards c WHERE ${LIVE}) AS live
      FROM sponsored_card_stats WHERE day > CURRENT_DATE - 30`);
    return { impressions: row.impressions, clicks: row.clicks, videoCompletions: row.video_completions, liveCards: row.live };
  }

  // Premium perk: paid accounts may hide sponsored cards.
  async hiddenFor(viewerId, executor = realmConnector) {
    if (!viewerId) return false;
    const { rows } = await executor.execute(`
      SELECT EXISTS(SELECT 1 FROM monetization_settings s WHERE s.user_id = $1 AND s.hide_sponsored)
        AND EXISTS(SELECT 1 FROM user_entitlements e WHERE e.user_id = $1 AND e.revoked_at IS NULL
          AND e.starts_at <= NOW() AND (e.ends_at IS NULL OR e.ends_at > NOW())) AS hidden`, [viewerId]);
    return rows[0].hidden;
  }

  // Live cards targeted at this search, falling back to the viewer's own
  // profile genres, instruments and location when the search has none.
  async forPlacement({ placement, genreId, instrumentId, center, viewerId, page, slots, rewardPoints }) {
    if (!slots) return [];
    const values = [placement, genreId ?? null, instrumentId ?? null, viewerId ?? null, `${page}`];
    const add = (value) => { values.push(value); return `$${values.length}`; };
    const cardDistance = (latitude, longitude) => distanceSql('c.latitude', 'c.longitude', latitude, longitude);
    const area = center
      ? `${cardDistance(`${add(center.latitude)}::float8`, `${add(center.longitude)}::float8`)} <= c.radius_km`
      : `EXISTS(SELECT 1 FROM profiles vp WHERE vp.user_id = $4::uuid AND vp.latitude IS NOT NULL
          AND ${cardDistance('vp.latitude::float8', 'vp.longitude::float8')} <= c.radius_km)`;
    const { rows } = await realmConnector.execute(`
      SELECT c.* FROM sponsored_cards c
      WHERE ${LIVE} AND $1 = ANY(c.placements)
        AND (cardinality(c.genre_ids) = 0 OR $2::uuid = ANY(c.genre_ids) OR ($2::uuid IS NULL AND EXISTS(
          SELECT 1 FROM user_genres ug JOIN profiles vp ON vp.id = ug.profile_id WHERE vp.user_id = $4::uuid AND ug.genre_id = ANY(c.genre_ids))))
        AND (cardinality(c.instrument_ids) = 0 OR $3::uuid = ANY(c.instrument_ids) OR ($3::uuid IS NULL AND EXISTS(
          SELECT 1 FROM user_instruments ui JOIN profiles vp ON vp.id = ui.profile_id WHERE vp.user_id = $4::uuid AND ui.instrument_id = ANY(c.instrument_ids))))
        AND (c.latitude IS NULL OR ${area})
      ORDER BY c.priority DESC, md5(c.id::text || $5 || CURRENT_DATE::text) LIMIT 10`, values);
    const cards = sponsoredSlots(rows.map(row => ({ id: row.id, maxPerPage: row.max_per_page, row })), slots);
    await this.count(cards.map(card => card.id), 'impressions');
    return cards.map(card => sponsoredCardView(card.row, rewardPoints));
  }

  async count(cardIds, column) {
    if (!cardIds.length) return;
    const totals = new Map();
    for (const id of cardIds) totals.set(id, (totals.get(id) ?? 0) + 1);
    await realmConnector.execute(`
      INSERT INTO sponsored_card_stats (card_id, day, ${column})
      SELECT id, CURRENT_DATE, amount FROM unnest($1::uuid[], $2::int[]) AS counted(id, amount)
      WHERE EXISTS(SELECT 1 FROM sponsored_cards c WHERE c.id = counted.id)
      ON CONFLICT (card_id, day) DO UPDATE SET ${column} = sponsored_card_stats.${column} + EXCLUDED.${column}`,
    [[...totals.keys()], [...totals.values()]]);
  }

  async click(cardId) {
    const { rows } = await realmConnector.execute(`SELECT link_url FROM sponsored_cards c WHERE c.id = $1 AND ${LIVE}`, [cardId]);
    if (!rows.length || !rows[0].link_url) throw requestError(404, 'SPONSORED_CARD_NOT_FOUND', 'Sponsored card not found');
    await this.count([cardId], 'clicks');
    return { linkUrl: rows[0].link_url };
  }

  async liveVideo(cardId) {
    const { rows } = await realmConnector.execute(`
      SELECT video_media_id FROM sponsored_cards c WHERE c.id = $1 AND c.video_media_id IS NOT NULL AND ${LIVE}`, [cardId]);
    if (!rows.length) throw requestError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    return rows[0].video_media_id;
  }

  async rewardedVideos(userId, points) {
    const { rows } = await realmConnector.execute(`
      SELECT c.* FROM sponsored_cards c WHERE ${LIVE} AND ${REWARDED} ORDER BY c.priority DESC, c.created_at DESC LIMIT 20`);
    const { rows: [today] } = await realmConnector.execute(`
      SELECT COUNT(*)::int AS count FROM rewarded_video_views
      WHERE user_id = $1 AND status = 'rewarded' AND completed_at >= date_trunc('day', NOW())`, [userId]);
    return {
      videos: rows.map(row => ({
        ...sponsoredCardView(row, points.rewardedVideo),
        videoUrl: row.video_url ?? sponsoredVideoPath(row.id),
        minimumSeconds: Math.max(points.rewardedVideoMinimumSeconds, row.video_seconds ?? 0),
      })),
      today: { completed: today.count, cap: points.rewardedVideoDailyCap },
    };
  }

  async dailyCompletions(executor, userId) {
    const { rows } = await executor.execute(`
      SELECT COUNT(*)::int AS count FROM rewarded_video_views
      WHERE user_id = $1 AND status = 'rewarded' AND completed_at >= date_trunc('day', NOW())`, [userId]);
    return rows[0].count;
  }

  // Issues a single-use view token. Only one view per account can be open, so
  // starting another abandons the previous one.
  async startView(userId, cardId, points) {
    return realmConnector.transaction(async (executor) => {
      await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const { rows } = await executor.execute(`SELECT * FROM sponsored_cards c WHERE c.id = $1 AND ${LIVE} AND ${REWARDED}`, [cardId]);
      if (!rows.length) throw requestError(404, 'VIDEO_NOT_FOUND', 'This sponsored video is no longer available');
      if (await this.dailyCompletions(executor, userId) >= points.rewardedVideoDailyCap) {
        throw requestError(429, 'DAILY_VIDEO_CAP_REACHED', `You can earn points from ${points.rewardedVideoDailyCap} videos per day. Come back tomorrow.`);
      }
      await executor.execute(`UPDATE rewarded_video_views SET status = 'abandoned' WHERE user_id = $1 AND status = 'started'`, [userId]);
      const token = randomBytes(32).toString('base64url');
      const minimumSeconds = Math.max(points.rewardedVideoMinimumSeconds, rows[0].video_seconds ?? 0);
      await executor.execute(`
        INSERT INTO rewarded_video_views (user_id, card_id, token_hash, minimum_seconds) VALUES ($1, $2, $3, $4)`,
      [userId, cardId, hashToken(token), minimumSeconds]);
      return { token, minimumSeconds, expiresInMinutes: VIEW_TOKEN_TTL_MINUTES };
    });
  }

  // The minimum watch time is measured on the server from the token's
  // issue time; the client's playback state is never trusted.
  async completeView(userId, token, points) {
    return realmConnector.transaction(async (executor) => {
      await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const { rows } = await executor.execute(`
        SELECT v.*, c.reward_points, EXTRACT(EPOCH FROM (NOW() - v.started_at))::float8 AS elapsed
        FROM rewarded_video_views v LEFT JOIN sponsored_cards c ON c.id = v.card_id
        WHERE v.token_hash = $1 AND v.user_id = $2 FOR UPDATE OF v`, [hashToken(token), userId]);
      const view = rows[0];
      if (!view || view.status !== 'started' || view.elapsed > VIEW_TOKEN_TTL_MINUTES * 60 || !view.card_id) {
        throw requestError(409, 'VIEW_NOT_ACTIVE', 'This video view expired or was already used. Start the video again.');
      }
      if (view.elapsed < view.minimum_seconds) {
        const remaining = Math.ceil(view.minimum_seconds - view.elapsed);
        throw Object.assign(requestError(409, 'WATCH_TIME_NOT_REACHED', `Keep watching for ${remaining} more seconds to earn points.`), { remaining });
      }
      if (await this.dailyCompletions(executor, userId) >= points.rewardedVideoDailyCap) {
        throw requestError(429, 'DAILY_VIDEO_CAP_REACHED', `You can earn points from ${points.rewardedVideoDailyCap} videos per day. Come back tomorrow.`);
      }
      const amount = view.reward_points ?? points.rewardedVideo;
      const credit = await pointsRepository.credit(executor, {
        userId, delta: amount, reason: 'rewarded_video', reference: `video:${view.id}`,
      });
      await executor.execute(`
        UPDATE rewarded_video_views SET status = 'rewarded', points = $2, completed_at = NOW() WHERE id = $1`, [view.id, amount]);
      await executor.execute(`
        INSERT INTO sponsored_card_stats (card_id, day, video_completions) VALUES ($1, CURRENT_DATE, 1)
        ON CONFLICT (card_id, day) DO UPDATE SET video_completions = sponsored_card_stats.video_completions + 1`, [view.card_id]);
      return {
        points: amount, balance: credit.balance,
        today: { completed: await this.dailyCompletions(executor, userId), cap: points.rewardedVideoDailyCap },
      };
    });
  }

  async purgeViews(executor, days = 30) {
    const { rowCount } = await executor.execute(`
      DELETE FROM rewarded_video_views WHERE started_at < NOW() - make_interval(days => $1::int)`, [days]);
    await executor.execute(`DELETE FROM sponsored_card_stats WHERE day < CURRENT_DATE - 400`);
    return rowCount;
  }

  async settings(userId) {
    const { rows } = await realmConnector.execute('SELECT hide_sponsored FROM monetization_settings WHERE user_id = $1', [userId]);
    return { hideSponsored: rows[0]?.hide_sponsored ?? false };
  }

  async saveSettings(executor, userId, { hideSponsored }) {
    await executor.execute(`
      INSERT INTO monetization_settings (user_id, hide_sponsored) VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET hide_sponsored = EXCLUDED.hide_sponsored, updated_at = NOW()`, [userId, hideSponsored]);
    return { hideSponsored };
  }
}

export const sponsoredRepository = new SponsoredRepository();
