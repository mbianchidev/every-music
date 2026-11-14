import { realmConfig } from '../../config/realm.js';
import { promotionRepository } from '../repositories/promotion-repository.js';
import { sponsoredRepository } from '../repositories/sponsored-repository.js';
import { promotedSlice, sponsoredPositions } from './monetization-rules.js';

// Adds the promotion label to a transformed search result.
export const withPromotion = (row, view) => (row.promotion ? { ...view, promotion: row.promotion } : view);

// Keeps candidates whose search re-check matched, in rank order, once each.
export function rankPromoted(candidates, matches) {
  const seen = new Set();
  const ranked = [];
  for (const candidate of candidates) {
    const row = matches[candidate.kind]?.get(candidate.id);
    if (!row || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    ranked.push({ ...row, promotion: { kind: candidate.kind } });
  }
  return ranked;
}

// Merges promoted results (capped per page so organic results stay visible)
// and sponsored cards into one page of discovery results. Promoted candidates
// are re-run through the same search with the same filters, visibility and
// block rules; pins match on their area instead of the location filters.
async function place({ placement, key, candidates, recheck, rows, page, viewerId, genreId, instrumentId, center, settings }) {
  const perPage = settings.discovery.promotedPerPage;
  let promoted = [];
  if (perPage && candidates.length) {
    const matches = {};
    for (const kind of ['pinned', 'boosted']) {
      const ids = [...new Set(candidates.filter(candidate => candidate.kind === kind).map(candidate => candidate.id))];
      matches[kind] = new Map(ids.length ? (await recheck(kind, ids)).map(row => [key(row), row]) : []);
    }
    promoted = promotedSlice(rankPromoted(candidates, matches), page, perPage);
  }
  const promotedIds = new Set(promoted.map(key));
  const combined = [...promoted, ...rows.filter(row => !promotedIds.has(key(row)))];
  let slots = combined.length ? settings.discovery.sponsoredPerPage : 0;
  if (slots && await sponsoredRepository.hiddenFor(viewerId)) slots = 0;
  const cards = await sponsoredRepository.forPlacement({
    placement, genreId, instrumentId, center, viewerId, page, slots, rewardPoints: settings.points.rewardedVideo,
  });
  const positions = sponsoredPositions(combined.length, cards.length);
  return { rows: combined, sponsored: cards.map((card, index) => ({ position: positions[index], card })) };
}

export async function placeAnnouncements({ search, filters, page, rows, settings = realmConfig.monetization }) {
  const candidates = settings.discovery.promotedPerPage
    ? await promotionRepository.announcementCandidates({ location: filters.location, viewerId: filters.userId }) : [];
  return place({
    placement: 'feed', key: row => row.id, candidates, rows, page, settings, viewerId: filters.userId ?? null,
    genreId: filters.genreId, instrumentId: filters.instrumentId, center: filters.location?.center,
    recheck: (kind, ids) => search(
      kind === 'pinned' ? { ...filters, location: {}, city: undefined, sort: 'newest', ids } : { ...filters, sort: 'newest', ids },
      { page: 1, pageSize: ids.length, limit: ids.length },
    ),
  });
}

export async function placeProfiles({ search, filters, page, rows, settings = realmConfig.monetization }) {
  const candidates = settings.discovery.promotedPerPage ? await promotionRepository.profileCandidates() : [];
  return place({
    placement: 'musicians', key: row => row.user_id, candidates, rows, page, settings, viewerId: filters.viewerId ?? null,
    genreId: filters.genreId, instrumentId: filters.instrumentId, center: filters.location?.center,
    recheck: (_kind, ids) => search({ ...filters, sort: 'newest', userIds: ids }, { page: 1, pageSize: ids.length, limit: ids.length }),
  });
}
