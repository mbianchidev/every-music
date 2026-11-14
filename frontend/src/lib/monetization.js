import conduit from './conduit.js';
import { t } from './i18n.js';

export const PIN_RADII = [5, 10, 25, 50, 100, 200, 500, 1000];

// Mirrors the server's pricing (engines/monetization-rules.js) so dialogs can
// show the cost before spending; the server computes the charged amount.
export function spendCost(rules, { kind, days, radiusKm }) {
  if (!rules) return null;
  if (kind === 'premium_days') return rules.premiumDayCost * days;
  if (kind === 'profile_boost') return rules.profileBoostDayCost * days;
  if (kind === 'announcement_boost') return rules.announcementBoostDayCost * days;
  if (kind === 'announcement_pin') return (rules.pinDayBaseCost + Math.ceil(radiusKm / 10) * rules.pinDayCostPer10Km) * days;
  return null;
}

export const pinRadii = rules => PIN_RADII.filter(radius => radius >= rules.pinMinRadiusKm && radius <= rules.pinMaxRadiusKm);

// Returns discovery results with sponsored cards placed before the server's
// positions. Positions index the result list; cards beyond the end follow it.
export function interleaveSponsored(rows, sponsored = []) {
  const placed = [...(sponsored ?? [])].sort((a, b) => a.position - b.position);
  const entries = [];
  let next = 0;
  rows.forEach((item, index) => {
    while (next < placed.length && placed[next].position <= index) {
      entries.push({ type: 'sponsored', card: placed[next].card, key: `sponsored-${placed[next].card.id}-${next}` });
      next += 1;
    }
    entries.push({ type: 'result', item, key: item.id });
  });
  for (; next < placed.length && rows.length; next += 1) {
    entries.push({ type: 'sponsored', card: placed[next].card, key: `sponsored-${placed[next].card.id}-${next}` });
  }
  return entries;
}

// Relative API paths (uploaded sponsored videos) become absolute API URLs;
// administrator-linked https videos are used as they are.
export function videoSource(url) {
  if (url?.startsWith('/realm/')) return `${conduit.baseUrl}${url.slice('/realm'.length)}`;
  return url?.startsWith('https://') ? url : '';
}

export const safeExternalUrl = url => (typeof url === 'string' && /^https:\/\/[^\s]+$/.test(url) ? url : null);

export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error(t('ui.fileUnreadable')));
    reader.readAsDataURL(file);
  });
}
