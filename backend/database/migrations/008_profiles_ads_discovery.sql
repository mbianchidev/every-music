-- w1-profiles-ads: GeoNames places, place-linked profiles and announcements,
-- profile contacts and content links, open-to-projects, saved searches,
-- consented profile visits and additional report categories.

CREATE TABLE IF NOT EXISTS places (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    country_code TEXT NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
    country_name TEXT NOT NULL,
    region_code TEXT,
    region_name TEXT,
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    population INTEGER NOT NULL DEFAULT 0,
    search_names TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_places_search ON places USING gin (search_names gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_places_region ON places(country_code, region_code);
CREATE INDEX IF NOT EXISTS idx_places_location ON places(latitude, longitude);

CREATE TABLE IF NOT EXISTS place_datasets (
    name TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    row_count INTEGER NOT NULL,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS place_id INTEGER REFERENCES places(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_visibility TEXT NOT NULL DEFAULT 'members'
    CHECK (contact_visibility IN ('members', 'following', 'hidden'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS open_to_projects BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_profiles_place ON profiles(place_id);

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS place_id INTEGER REFERENCES places(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_place ON announcements(place_id);
CREATE INDEX IF NOT EXISTS idx_announcements_active_owner ON announcements(user_id, expires_at)
    WHERE is_published = TRUE AND is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS profile_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    link_type TEXT NOT NULL CHECK (link_type IN ('spotify', 'youtube', 'soundcloud', 'bandcamp', 'instagram', 'website', 'other')),
    url TEXT NOT NULL CHECK (length(url) BETWEEN 1 AND 2048),
    position SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profile_links_profile ON profile_links(profile_id, position);

CREATE INDEX IF NOT EXISTS idx_blocked_users_reverse ON blocked_users(blocked_user_id, user_id);

CREATE TABLE IF NOT EXISTS saved_searches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    filters JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters) = 'object'),
    notify BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saved_searches_owner ON saved_searches(user_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_notify ON saved_searches(user_id) WHERE notify = TRUE;

ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS share_profile_visits BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS profile_visits (
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    visitor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day DATE NOT NULL DEFAULT CURRENT_DATE,
    visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(owner_id, day, visitor_id),
    CHECK (owner_id <> visitor_id)
);
CREATE INDEX IF NOT EXISTS idx_profile_visits_visitor ON profile_visits(visitor_id);
CREATE INDEX IF NOT EXISTS idx_profile_visits_day ON profile_visits(day);

ALTER TABLE user_reports DROP CONSTRAINT IF EXISTS user_reports_category_check;
ALTER TABLE user_reports ADD CONSTRAINT user_reports_category_check CHECK (category IN (
    'spam', 'harassment', 'threats', 'inappropriate_language', 'fake_profile', 'other'
));
