import { requestError } from './request-error.js';

export const PROMOTION_KINDS = ['profile_boost', 'announcement_boost', 'announcement_pin'];
export const SPEND_KINDS = ['premium_days', ...PROMOTION_KINDS];
export const PIN_MIN_RADIUS_KM = 5;

const invalid = message => requestError(400, 'INVALID_SPEND', message);

// Points cost of one purchase. Pins cost more per day the wider their area:
// a base cost plus a surcharge for every started 10 km of radius.
export function spendCost(points, { kind, days, radiusKm }) {
  if (!SPEND_KINDS.includes(kind)) throw invalid('Choose what to spend points on');
  const durations = kind === 'premium_days' ? points.premiumDurations : points.promotionDurations;
  if (!durations.includes(days)) throw invalid(`Choose one of these durations: ${durations.join(', ')} days`);
  if (kind === 'premium_days') return points.premiumDayCost * days;
  if (kind === 'profile_boost') return points.profileBoostDayCost * days;
  if (kind === 'announcement_boost') return points.announcementBoostDayCost * days;
  if (!Number.isInteger(radiusKm) || radiusKm < PIN_MIN_RADIUS_KM || radiusKm > points.pinMaxRadiusKm) {
    throw invalid(`Choose a pin radius between ${PIN_MIN_RADIUS_KM} and ${points.pinMaxRadiusKm} km`);
  }
  return (points.pinDayBaseCost + Math.ceil(radiusKm / 10) * points.pinDayCostPer10Km) * days;
}

// Public description of earning and spending rules for clients.
export function pointsRules(points) {
  return {
    earn: {
      referralInviter: points.referralInviter,
      referralInvitee: points.referralInvitee,
      referralMonthlyCap: points.referralMonthlyCap,
      appRating: points.appRating,
      rewardedVideo: points.rewardedVideo,
      rewardedVideoDailyCap: points.rewardedVideoDailyCap,
    },
    spend: {
      premiumDayCost: points.premiumDayCost,
      premiumDurations: points.premiumDurations,
      profileBoostDayCost: points.profileBoostDayCost,
      announcementBoostDayCost: points.announcementBoostDayCost,
      pinDayBaseCost: points.pinDayBaseCost,
      pinDayCostPer10Km: points.pinDayCostPer10Km,
      pinMinRadiusKm: PIN_MIN_RADIUS_KM,
      pinMaxRadiusKm: points.pinMaxRadiusKm,
      promotionDurations: points.promotionDurations,
    },
  };
}

// Promoted results fill at most `perPage` slots per page, taken in order from
// the ranked candidates, so organic results always fill the rest of the page.
export function promotedSlice(candidates, page, perPage) {
  if (perPage < 1) return [];
  return candidates.slice((page - 1) * perPage, page * perPage);
}

// Fills sponsored slots from priority-ordered cards; a card repeats on the
// same page only up to its own `maxPerPage`.
export function sponsoredSlots(cards, slots) {
  const picked = [];
  const used = new Map();
  let progress = true;
  while (picked.length < slots && progress) {
    progress = false;
    for (const card of cards) {
      if (picked.length >= slots) break;
      const count = used.get(card.id) ?? 0;
      if (count >= card.maxPerPage) continue;
      used.set(card.id, count + 1);
      picked.push(card);
      progress = true;
    }
  }
  return picked;
}

// Positions (indexes into the combined results list) before which sponsored
// cards are shown: spread through the page, never before the first result.
export function sponsoredPositions(resultCount, slots) {
  if (!resultCount || !slots) return [];
  const positions = [];
  for (let index = 0; index < slots; index += 1) {
    positions.push(Math.min(resultCount, Math.max(1, Math.round(((index + 1) * resultCount) / (slots + 1)))));
  }
  return positions;
}
