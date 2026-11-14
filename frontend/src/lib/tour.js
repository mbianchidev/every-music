// Spotlight tour of the main areas. Each step lists target selectors in
// priority order: the desktop sidebar first, then the mobile bar, then the
// mobile "More" button for sections that live inside the navigation dialog.
const MORE = '.mobile-nav [aria-controls="workspace-navigation"]';
const link = id => [`.desktop-nav a[href="#${id}"]`, `.mobile-nav a[href="#${id}"]`];

export const TOUR_STEPS = [
  { id: 'feed', targets: link('feed') },
  { id: 'musicians', targets: link('musicians') },
  { id: 'post', targets: ['.sidebar .nav-publish', '.mobile-nav a[href="#create"]'] },
  { id: 'messages', targets: link('messages') },
  { id: 'profile', targets: [...link('profile'), '.header-profile', MORE] },
  { id: 'settings', targets: [...link('settings'), MORE] },
  { id: 'help', targets: [...link('help'), MORE] },
];

export const TOUR_STORAGE_PREFIX = 'everymusic.tour.v1.';
const FINISHED = ['completed', 'skipped'];

function visible(element) {
  if (!element?.isConnected || !element.getClientRects().length) return false;
  const closedDialog = element.closest('dialog:not([open])');
  return !closedDialog;
}

export function resolveTarget(step, root = globalThis.document) {
  for (const selector of step.targets) {
    const element = [...(root?.querySelectorAll(selector) ?? [])].find(visible);
    if (element) return element;
  }
  return null;
}

export function localTourStatus(userId, storage = globalThis.localStorage) {
  if (!userId) return null;
  try {
    const value = storage?.getItem(`${TOUR_STORAGE_PREFIX}${userId}`);
    return FINISHED.includes(value) ? value : null;
  } catch (error) {
    console.warn('The tour progress on this device could not be read', error);
    return null;
  }
}

export function rememberTour(userId, status, storage = globalThis.localStorage) {
  if (!userId || !FINISHED.includes(status)) return false;
  try {
    storage?.setItem(`${TOUR_STORAGE_PREFIX}${userId}`, status);
    return true;
  } catch (error) {
    console.warn('The tour progress could not be saved on this device', error);
    return false;
  }
}

// The server status wins; this device's record only prevents a repeat when
// the account record could not be saved or read.
export function shouldStartTour(serverStatus, localStatus) {
  if (FINISHED.includes(localStatus)) return false;
  return serverStatus === 'pending';
}

// Places the step card beside a left-hand sidebar target, otherwise below or
// above it, and keeps it inside the viewport.
export function cardPosition(target, card, viewport, gap = 12) {
  const margin = 8;
  const width = Math.min(card.width, viewport.width - margin * 2);
  const clampTop = top => Math.min(Math.max(margin, top), Math.max(margin, viewport.height - card.height - margin));
  if (!target) return { top: clampTop((viewport.height - card.height) / 2), left: (viewport.width - width) / 2, width };
  const left = Math.min(Math.max(margin, target.left + target.width / 2 - width / 2), viewport.width - width - margin);
  const right = target.right + gap;
  if (target.left < viewport.width * 0.3 && right + width <= viewport.width - margin) {
    return { top: clampTop(target.top + target.height / 2 - card.height / 2), left: right, width };
  }
  const below = target.bottom + gap;
  if (below + card.height <= viewport.height - margin) return { top: below, left, width };
  const above = target.top - gap - card.height;
  if (above >= margin) return { top: above, left, width };
  return { top: clampTop(viewport.height - card.height - margin), left, width };
}
