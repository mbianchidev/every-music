-- w6-marketplace: gear, lesson, service and endorsement listings with photos,
-- catalog tags, saved listings, listing reports and moderation removal.

CREATE TABLE IF NOT EXISTS marketplace_listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_type TEXT NOT NULL CHECK (listing_type IN ('sell', 'wanted', 'lesson', 'service_offer', 'service_wanted', 'endorsement')),
    category TEXT NOT NULL CHECK (category ~ '^[a-z][a-z0-9_]{1,47}$'),
    subcategory TEXT CHECK (subcategory ~ '^[a-z][a-z0-9_]{1,47}$'),
    title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 120),
    description TEXT NOT NULL CHECK (length(description) BETWEEN 10 AND 5000),
    item_condition TEXT CHECK (item_condition IN ('new', 'used', 'refurbished')),
    price_mode TEXT NOT NULL CHECK (price_mode IN ('fixed', 'negotiable', 'free', 'contact')),
    price_minor BIGINT CHECK (price_minor BETWEEN 0 AND 100000000000),
    currency TEXT CHECK (currency ~ '^[A-Z]{3}$'),
    rate_unit TEXT CHECK (rate_unit IN ('hour', 'session', 'day', 'project')),
    location_text TEXT CHECK (length(location_text) <= 160),
    latitude DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
    is_remote BOOLEAN NOT NULL DEFAULT FALSE,
    shipping_available BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reserved', 'sold', 'closed')),
    expires_at TIMESTAMPTZ NOT NULL,
    expiry_notified_at TIMESTAMPTZ,
    removed_at TIMESTAMPTZ,
    removed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    moderation_note TEXT CHECK (length(moderation_note) <= 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((price_minor IS NULL) = (currency IS NULL)),
    CHECK (price_mode <> 'fixed' OR price_minor IS NOT NULL),
    CHECK (price_mode NOT IN ('free', 'contact') OR price_minor IS NULL),
    CHECK ((latitude IS NULL) = (longitude IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_browse ON marketplace_listings(listing_type, created_at DESC, id)
    WHERE removed_at IS NULL AND status IN ('active', 'reserved');
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_owner ON marketplace_listings(user_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_expiry ON marketplace_listings(expires_at)
    WHERE removed_at IS NULL AND expiry_notified_at IS NULL AND status IN ('active', 'reserved');
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_keywords ON marketplace_listings USING gin ((title || ' ' || description) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_location ON marketplace_listings USING gin (location_text gin_trgm_ops);

CREATE TABLE IF NOT EXISTS marketplace_listing_photos (
    listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 7),
    PRIMARY KEY (listing_id, media_id),
    UNIQUE (listing_id, position)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_listing_photos_media ON marketplace_listing_photos(media_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listing_photos_url ON marketplace_listing_photos(('/realm/media/' || media_id::text));

CREATE TABLE IF NOT EXISTS marketplace_listing_instruments (
    listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    instrument_id UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    PRIMARY KEY (listing_id, instrument_id)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_listing_instruments_tag ON marketplace_listing_instruments(instrument_id);

CREATE TABLE IF NOT EXISTS marketplace_listing_genres (
    listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    genre_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (listing_id, genre_id)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_listing_genres_tag ON marketplace_listing_genres(genre_id);

CREATE TABLE IF NOT EXISTS marketplace_saved_listings (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, listing_id)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_saved_listings_page ON marketplace_saved_listings(user_id, created_at DESC, listing_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_saved_listings_listing ON marketplace_saved_listings(listing_id);

ALTER TABLE user_reports ADD COLUMN IF NOT EXISTS listing_id UUID REFERENCES marketplace_listings(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_user_reports_listing ON user_reports(listing_id, status) WHERE listing_id IS NOT NULL;
