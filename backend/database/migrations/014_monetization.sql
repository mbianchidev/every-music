-- w7-monetization: Stripe billing records and processed webhook events, an
-- append-only points ledger with balances, invite codes and referrals, paid
-- promotions, first-party sponsored cards with aggregate daily statistics,
-- rewarded video views, sponsored-card preferences and offer broadcasts.

CREATE TABLE IF NOT EXISTS billing_customers (
    customer_id TEXT PRIMARY KEY CHECK (length(customer_id) BETWEEN 4 AND 255),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_customers_orphaned ON billing_customers(created_at) WHERE user_id IS NULL;

CREATE TABLE IF NOT EXISTS billing_checkout_sessions (
    id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 4 AND 255),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product TEXT NOT NULL CHECK (product IN ('premium', 'partner', 'points')),
    pack_id TEXT CHECK (pack_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
    points INTEGER CHECK (points BETWEEN 1 AND 1000000),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CHECK ((product = 'points') = (points IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_billing_checkout_sessions_user ON billing_checkout_sessions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
    id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 4 AND 255),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    customer_id TEXT NOT NULL CHECK (length(customer_id) BETWEEN 4 AND 255),
    plan TEXT NOT NULL CHECK (plan IN ('premium', 'partner')),
    status TEXT NOT NULL CHECK (status ~ '^[a-z_]{1,40}$'),
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    last_event_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_user ON billing_subscriptions(user_id, updated_at DESC) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing_webhook_events (
    id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 4 AND 255),
    type TEXT NOT NULL CHECK (length(type) BETWEEN 1 AND 100),
    event_created_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_processed ON billing_webhook_events(processed_at);

CREATE TABLE IF NOT EXISTS points_balances (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only: the trigger below rejects edits other than detaching a
-- deleted administrator (actor_id set to NULL by its foreign key).
CREATE TABLE IF NOT EXISTS points_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta INTEGER NOT NULL CHECK (delta <> 0 AND delta BETWEEN -1000000 AND 1000000),
    reason TEXT NOT NULL CHECK (reason IN ('purchase', 'referral_inviter', 'referral_invitee', 'rewarded_video', 'app_rating',
        'event_grant', 'premium_days', 'profile_boost', 'announcement_boost', 'announcement_pin')),
    reference TEXT NOT NULL CHECK (length(reference) BETWEEN 3 AND 255),
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    note TEXT CHECK (length(note) <= 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_points_ledger_reference ON points_ledger(reference);
CREATE INDEX IF NOT EXISTS idx_points_ledger_user ON points_ledger(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_points_ledger_reason ON points_ledger(reason, created_at);

CREATE OR REPLACE FUNCTION points_ledger_append_only() RETURNS trigger AS $$
BEGIN
    IF ROW(NEW.id, NEW.user_id, NEW.delta, NEW.reason, NEW.reference, NEW.balance_after, NEW.note, NEW.created_at)
        IS DISTINCT FROM ROW(OLD.id, OLD.user_id, OLD.delta, OLD.reason, OLD.reference, OLD.balance_after, OLD.note, OLD.created_at)
        OR NEW.actor_id IS NOT NULL AND NEW.actor_id IS DISTINCT FROM OLD.actor_id THEN
        RAISE EXCEPTION 'points_ledger entries are append-only';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS points_ledger_append_only ON points_ledger;
CREATE TRIGGER points_ledger_append_only BEFORE UPDATE ON points_ledger
    FOR EACH ROW EXECUTE FUNCTION points_ledger_append_only();

CREATE TABLE IF NOT EXISTS referral_codes (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z2-9]{8,16}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referrals (
    invitee_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('registration', 'claim')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded', 'capped')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rewarded_at TIMESTAMPTZ,
    CHECK (invitee_id <> inviter_id)
);
CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals(inviter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_pending ON referrals(created_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS promotions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('profile_boost', 'announcement_boost', 'announcement_pin')),
    announcement_id UUID REFERENCES announcements(id) ON DELETE CASCADE,
    place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
    place_label TEXT CHECK (length(place_label) <= 255),
    latitude DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
    radius_km INTEGER CHECK (radius_km BETWEEN 1 AND 1000),
    country_code TEXT CHECK (country_code ~ '^[A-Z]{2}$'),
    region_code TEXT CHECK (length(region_code) <= 20),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ NOT NULL,
    days INTEGER NOT NULL CHECK (days BETWEEN 1 AND 365),
    points_spent INTEGER NOT NULL CHECK (points_spent >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at > starts_at),
    CHECK ((kind = 'profile_boost') = (announcement_id IS NULL)),
    CHECK ((kind = 'announcement_pin') = (latitude IS NOT NULL AND longitude IS NOT NULL AND radius_km IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(kind, ends_at, starts_at);
CREATE INDEX IF NOT EXISTS idx_promotions_user ON promotions(user_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_promotions_announcement ON promotions(announcement_id) WHERE announcement_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sponsored_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sponsor_name TEXT NOT NULL CHECK (length(sponsor_name) BETWEEN 2 AND 80),
    title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 120),
    body TEXT NOT NULL CHECK (length(body) BETWEEN 3 AND 600),
    link_url TEXT CHECK (link_url ~ '^https://[^\s]+$' AND length(link_url) <= 2048),
    link_label TEXT CHECK (length(link_label) BETWEEN 2 AND 60),
    image_url TEXT CHECK (image_url ~ '^/realm/media/[0-9a-f-]{36}$'),
    image_alt TEXT CHECK (length(image_alt) <= 200),
    video_url TEXT CHECK (video_url ~ '^https://[^\s]+$' AND length(video_url) <= 2048),
    video_media_id UUID REFERENCES media(id) ON DELETE SET NULL,
    video_seconds INTEGER CHECK (video_seconds BETWEEN 5 AND 600),
    reward_points INTEGER CHECK (reward_points BETWEEN 1 AND 1000),
    placements TEXT[] NOT NULL DEFAULT ARRAY['feed', 'musicians']::text[]
        CHECK (cardinality(placements) BETWEEN 1 AND 2 AND placements <@ ARRAY['feed', 'musicians']::text[]),
    genre_ids UUID[] NOT NULL DEFAULT '{}' CHECK (cardinality(genre_ids) <= 20),
    instrument_ids UUID[] NOT NULL DEFAULT '{}' CHECK (cardinality(instrument_ids) <= 20),
    place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
    place_label TEXT CHECK (length(place_label) <= 255),
    latitude DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
    radius_km INTEGER CHECK (radius_km BETWEEN 1 AND 1000),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ,
    priority SMALLINT NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 100),
    max_per_page SMALLINT NOT NULL DEFAULT 1 CHECK (max_per_page BETWEEN 1 AND 3),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at IS NULL OR ends_at > starts_at),
    CHECK (video_url IS NULL OR video_media_id IS NULL),
    CHECK ((latitude IS NULL) = (radius_km IS NULL) AND (latitude IS NULL) = (longitude IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_sponsored_cards_live ON sponsored_cards(priority DESC, starts_at) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_sponsored_cards_image ON sponsored_cards(image_url) WHERE image_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sponsored_cards_video ON sponsored_cards(video_media_id) WHERE video_media_id IS NOT NULL;

-- Aggregate counters only: no viewer or clicker identities are stored.
CREATE TABLE IF NOT EXISTS sponsored_card_stats (
    card_id UUID NOT NULL REFERENCES sponsored_cards(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    impressions INTEGER NOT NULL DEFAULT 0 CHECK (impressions >= 0),
    clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0),
    video_completions INTEGER NOT NULL DEFAULT 0 CHECK (video_completions >= 0),
    PRIMARY KEY (card_id, day)
);

-- Server-issued view tokens for rewarded videos, kept for anti-abuse caps and
-- purged after 30 days.
CREATE TABLE IF NOT EXISTS rewarded_video_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id UUID REFERENCES sponsored_cards(id) ON DELETE SET NULL,
    token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    minimum_seconds INTEGER NOT NULL CHECK (minimum_seconds BETWEEN 1 AND 600),
    status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'rewarded', 'abandoned')),
    points INTEGER CHECK (points BETWEEN 1 AND 1000),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rewarded_video_views_user ON rewarded_video_views(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS monetization_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    hide_sponsored BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offer_broadcasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    headline TEXT NOT NULL CHECK (length(headline) BETWEEN 3 AND 120),
    body TEXT NOT NULL CHECK (length(body) BETWEEN 3 AND 500),
    link TEXT CHECK (link ~ '^#[a-z][a-z0-9-]*(\?[^\s]*)?$' AND length(link) <= 200),
    audience TEXT NOT NULL CHECK (audience IN ('all', 'free', 'paid')),
    recipients INTEGER NOT NULL DEFAULT 0 CHECK (recipients >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_offer_broadcasts_page ON offer_broadcasts(created_at DESC, id);
