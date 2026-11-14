// Payments (Stripe Checkout and webhooks), the points economy, referrals,
// rewarded videos and promoted discovery placements. Stripe stays disabled
// until both its secret key and webhook signing secret are set; points earned
// in the app keep working without it.

const PACK = /^([a-z0-9][a-z0-9_-]{0,31}):(\d{1,7}):(price_[A-Za-z0-9]{1,200}):(\d{1,7})$/;

function integer(value, fallback, name, minimum, maximum) {
  const candidate = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return candidate;
}

function days(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const list = value.split(',').map(item => item.trim()).filter(Boolean).map(Number);
  if (!list.length || list.length > 6 || list.some(item => !Number.isInteger(item) || item < 1 || item > 365)
    || new Set(list).size !== list.length) {
    throw new Error(`${name} must list up to six distinct day counts between 1 and 365, separated by commas`);
  }
  return list.sort((a, b) => a - b);
}

// "id:points:price_id:amount_minor", comma separated, for example
// "starter:500:price_123:499". The amount is shown in the store; Stripe
// Checkout always charges the price configured in Stripe.
export function parsePointsPacks(value) {
  if (!value?.trim()) return [];
  const packs = value.split(',').map(item => item.trim()).filter(Boolean).map((item) => {
    const match = PACK.exec(item);
    if (!match) throw new Error('STRIPE_POINTS_PACKS entries must look like id:points:price_id:amount_minor');
    const points = Number(match[2]);
    if (points < 1) throw new Error('STRIPE_POINTS_PACKS points must be at least 1');
    return { id: match[1], points, priceId: match[3], amountMinor: Number(match[4]) };
  });
  if (packs.length > 8) throw new Error('STRIPE_POINTS_PACKS supports at most eight packs');
  if (new Set(packs.map(pack => pack.id)).size !== packs.length) throw new Error('STRIPE_POINTS_PACKS ids must be unique');
  return packs;
}

export function createMonetizationConfig(env = process.env) {
  const price = name => (env[name] || '').trim();
  return {
    monetization: {
      stripe: {
        secretKey: (env.STRIPE_SECRET_KEY || '').trim(),
        webhookSecret: (env.STRIPE_WEBHOOK_SECRET || '').trim(),
        premiumPriceId: price('STRIPE_PREMIUM_PRICE_ID'),
        partnerPriceId: price('STRIPE_PARTNER_PRICE_ID'),
        packs: parsePointsPacks(env.STRIPE_POINTS_PACKS),
        currency: (env.BILLING_CURRENCY || 'EUR').trim().toUpperCase(),
        premiumMonthlyMinor: integer(env.PREMIUM_MONTHLY_PRICE_MINOR, 399, 'PREMIUM_MONTHLY_PRICE_MINOR', 0, 10000000),
        partnerMonthlyMinor: integer(env.PARTNER_MONTHLY_PRICE_MINOR, 1999, 'PARTNER_MONTHLY_PRICE_MINOR', 0, 10000000),
      },
      points: {
        premiumDayCost: integer(env.POINTS_PREMIUM_DAY_COST, 20, 'POINTS_PREMIUM_DAY_COST', 1, 100000),
        premiumDurations: days(env.POINTS_PREMIUM_DURATIONS_DAYS, [7, 30], 'POINTS_PREMIUM_DURATIONS_DAYS'),
        profileBoostDayCost: integer(env.POINTS_PROFILE_BOOST_DAY_COST, 60, 'POINTS_PROFILE_BOOST_DAY_COST', 1, 100000),
        announcementBoostDayCost: integer(env.POINTS_ANNOUNCEMENT_BOOST_DAY_COST, 60, 'POINTS_ANNOUNCEMENT_BOOST_DAY_COST', 1, 100000),
        pinDayBaseCost: integer(env.POINTS_PIN_DAY_BASE_COST, 80, 'POINTS_PIN_DAY_BASE_COST', 1, 100000),
        pinDayCostPer10Km: integer(env.POINTS_PIN_DAY_COST_PER_10_KM, 10, 'POINTS_PIN_DAY_COST_PER_10_KM', 0, 100000),
        pinMaxRadiusKm: integer(env.POINTS_PIN_MAX_RADIUS_KM, 200, 'POINTS_PIN_MAX_RADIUS_KM', 5, 1000),
        promotionDurations: days(env.POINTS_PROMOTION_DURATIONS_DAYS, [1, 3, 7], 'POINTS_PROMOTION_DURATIONS_DAYS'),
        referralInviter: integer(env.POINTS_REFERRAL_INVITER, 200, 'POINTS_REFERRAL_INVITER', 0, 100000),
        referralInvitee: integer(env.POINTS_REFERRAL_INVITEE, 100, 'POINTS_REFERRAL_INVITEE', 0, 100000),
        referralMonthlyCap: integer(env.REFERRAL_MONTHLY_CAP, 10, 'REFERRAL_MONTHLY_CAP', 0, 1000),
        referralClaimDays: integer(env.REFERRAL_CLAIM_DAYS, 7, 'REFERRAL_CLAIM_DAYS', 1, 90),
        appRating: integer(env.POINTS_APP_RATING, 50, 'POINTS_APP_RATING', 0, 100000),
        rewardedVideo: integer(env.POINTS_REWARDED_VIDEO, 10, 'POINTS_REWARDED_VIDEO', 1, 1000),
        rewardedVideoDailyCap: integer(env.REWARDED_VIDEO_DAILY_CAP, 10, 'REWARDED_VIDEO_DAILY_CAP', 0, 100),
        rewardedVideoMinimumSeconds: integer(env.REWARDED_VIDEO_MIN_SECONDS, 15, 'REWARDED_VIDEO_MIN_SECONDS', 5, 600),
      },
      discovery: {
        promotedPerPage: integer(env.PROMOTED_RESULTS_PER_PAGE, 2, 'PROMOTED_RESULTS_PER_PAGE', 0, 5),
        sponsoredPerPage: integer(env.SPONSORED_CARDS_PER_PAGE, 1, 'SPONSORED_CARDS_PER_PAGE', 0, 3),
      },
      sponsoredVideoBytes: integer(env.SPONSORED_VIDEO_BYTE_LIMIT, 15 * 1024 * 1024, 'SPONSORED_VIDEO_BYTE_LIMIT', 1024 * 1024, 50 * 1024 * 1024),
      jobIntervalMinutes: integer(env.MONETIZATION_JOB_INTERVAL_MINUTES, 15, 'MONETIZATION_JOB_INTERVAL_MINUTES', 1, 1440),
    },
  };
}

export const paymentsEnabled = stripe => Boolean(stripe?.secretKey && stripe?.webhookSecret);

export function validateMonetizationConfig(config) {
  const { stripe } = config.monetization;
  if (Boolean(stripe.secretKey) !== Boolean(stripe.webhookSecret)) {
    throw new Error('Payments require STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET together');
  }
  if (stripe.secretKey && !/^(sk|rk)_(test|live)_[A-Za-z0-9_]{8,}$/.test(stripe.secretKey)) {
    throw new Error('STRIPE_SECRET_KEY must be a Stripe secret or restricted key (sk_test_..., sk_live_...)');
  }
  if (stripe.webhookSecret && !/^whsec_[A-Za-z0-9_]{8,}$/.test(stripe.webhookSecret)) {
    throw new Error('STRIPE_WEBHOOK_SECRET must be a webhook signing secret (whsec_...)');
  }
  for (const [name, value] of [['STRIPE_PREMIUM_PRICE_ID', stripe.premiumPriceId], ['STRIPE_PARTNER_PRICE_ID', stripe.partnerPriceId]]) {
    if (value && !/^price_[A-Za-z0-9]{1,200}$/.test(value)) throw new Error(`${name} must be a Stripe price ID (price_...)`);
  }
  if (!/^[A-Z]{3}$/.test(stripe.currency)) throw new Error('BILLING_CURRENCY must be an ISO 4217 code such as EUR');
  return true;
}
