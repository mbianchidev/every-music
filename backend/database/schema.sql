-- Database schema for Every.music MVP

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (main authentication and profile)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- NULL for OAuth users
    auth_provider VARCHAR(50) NOT NULL DEFAULT 'email', -- 'email' or 'google'
    google_id VARCHAR(255) UNIQUE,
    email_verified BOOLEAN DEFAULT FALSE,
    verification_token_hash VARCHAR(64) UNIQUE,
    verification_token_expires TIMESTAMP,
    reset_password_token_hash VARCHAR(64) UNIQUE,
    reset_password_expires TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    is_deleted BOOLEAN DEFAULT FALSE
);

-- User profiles table
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    artist_name VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    age INTEGER CHECK (age >= 13 AND age <= 120),
    city VARCHAR(255),
    state VARCHAR(255),
    country VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    bio TEXT,
    profile_picture_url TEXT,
    phone VARCHAR(50),
    telegram_id VARCHAR(100),
    whatsapp VARCHAR(100),
    signal VARCHAR(100),
    website_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Instruments that users can play
CREATE TABLE instruments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(50), -- 'string', 'wind', 'percussion', 'keyboard', 'vocal', 'electronic'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User instruments (many-to-many with experience)
CREATE TABLE user_instruments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    instrument_id UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    years_experience INTEGER CHECK (years_experience >= 0),
    skill_level VARCHAR(50) CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'professional')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(profile_id, instrument_id)
);

-- Music genres
CREATE TABLE genres (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    parent_genre_id UUID REFERENCES genres(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User genres (many-to-many)
CREATE TABLE user_genres (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    genre_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(profile_id, genre_id)
);

-- Projects/bands that users have been part of
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    years_active VARCHAR(100), -- e.g., "2018-2020" or "2019-Present"
    role VARCHAR(255), -- e.g., "Lead Guitarist"
    description TEXT,
    spotify_link TEXT,
    youtube_link TEXT,
    bandcamp_link TEXT,
    soundcloud_link TEXT,
    website_link TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Announcements/Ads for finding band members
CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    picture_url TEXT,
    city VARCHAR(255),
    state VARCHAR(255),
    country VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    is_remote BOOLEAN DEFAULT FALSE,
    is_cover_band BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP,
    is_published BOOLEAN DEFAULT TRUE,
    is_deleted BOOLEAN DEFAULT FALSE,
    views_count INTEGER DEFAULT 0,
    likes_count INTEGER DEFAULT 0,
    dislikes_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Instruments needed for announcements
CREATE TABLE announcement_instruments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    instrument_id UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(announcement_id, instrument_id)
);

-- Genres for announcements
CREATE TABLE announcement_genres (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    genre_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(announcement_id, genre_id)
);

-- Announcement content links (Spotify, YouTube, etc.)
CREATE TABLE announcement_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    link_type VARCHAR(50) NOT NULL, -- 'spotify', 'youtube', 'soundcloud', 'bandcamp', 'website', 'other'
    url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User reactions to announcements (likes/dislikes)
CREATE TABLE announcement_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction_type VARCHAR(20) CHECK (reaction_type IN ('like', 'dislike')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(announcement_id, user_id)
);

-- Saved announcements (bookmarks)
CREATE TABLE saved_announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(announcement_id, user_id)
);

-- Profile followers (following other musicians)
CREATE TABLE followers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(follower_id, following_id),
    CHECK (follower_id != following_id)
);

-- Refresh tokens for JWT
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked BOOLEAN DEFAULT FALSE,
    rotated_at TIMESTAMPTZ,
    replacement_jti VARCHAR(64),
    replaced_by UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_email_verified ON users(email_verified);
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_city ON profiles(city);
CREATE INDEX idx_profiles_location ON profiles(latitude, longitude);
CREATE INDEX idx_announcements_user_id ON announcements(user_id);
CREATE INDEX idx_announcements_published ON announcements(is_published);
CREATE INDEX idx_announcements_expires ON announcements(expires_at);
CREATE INDEX idx_announcements_location ON announcements(latitude, longitude);
CREATE INDEX idx_announcements_created ON announcements(created_at DESC);
CREATE INDEX idx_user_instruments_profile ON user_instruments(profile_id);
CREATE INDEX idx_user_genres_profile ON user_genres(profile_id);
CREATE INDEX idx_announcement_instruments ON announcement_instruments(announcement_id);
CREATE INDEX idx_announcement_genres ON announcement_genres(announcement_id);
CREATE INDEX idx_followers_follower ON followers(follower_id);
CREATE INDEX idx_followers_following ON followers(following_id);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_expiration ON refresh_tokens(expires_at) WHERE revoked = false;

CREATE TABLE schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Update trigger for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE projects ADD COLUMN IF NOT EXISTS collaborators JSONB NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('profile', 'announcement')),
    content BYTEA NOT NULL CHECK (octet_length(content) <= 2097152),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_owner ON media(user_id);

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    second_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(first_user_id, second_user_id),
    CHECK (first_user_id < second_user_id)
);
CREATE INDEX IF NOT EXISTS idx_conversations_second ON conversations(second_user_id);

CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT '-infinity',
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY(conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON conversation_members(user_id, archived);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID NOT NULL,
    body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(sender_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_messages_page ON messages(conversation_id, created_at DESC, id DESC);
ALTER TABLE messages ALTER COLUMN created_at SET DEFAULT clock_timestamp();

CREATE TABLE IF NOT EXISTS blocked_users (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY(user_id, blocked_user_id),
    CHECK (user_id <> blocked_user_id)
);

CREATE TABLE IF NOT EXISTS announcement_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_page ON announcement_comments(announcement_id, created_at, id);

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    messages BOOLEAN NOT NULL DEFAULT TRUE,
    announcements BOOLEAN NOT NULL DEFAULT TRUE,
    engagements BOOLEAN NOT NULL DEFAULT TRUE,
    profile_views BOOLEAN NOT NULL DEFAULT FALSE,
    push BOOLEAN NOT NULL DEFAULT FALSE,
    analytics BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    link TEXT NOT NULL,
    event_key TEXT UNIQUE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    push_sent BOOLEAN NOT NULL DEFAULT FALSE,
    push_attempts INTEGER NOT NULL DEFAULT 0,
    next_push_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_page ON notifications(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_push ON notifications(next_push_at)
    WHERE push_sent = FALSE AND push_attempts < 3 AND read_at IS NULL;

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS analytics_daily (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day DATE NOT NULL DEFAULT CURRENT_DATE,
    kind TEXT NOT NULL CHECK (kind IN ('profile_view', 'announcement_view', 'like', 'save', 'message')),
    resource_id UUID NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY(user_id, day, kind, resource_id)
);

CREATE TABLE IF NOT EXISTS google_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nonce_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 minutes'
);
CREATE INDEX IF NOT EXISTS idx_google_challenges_expiration ON google_challenges(expires_at);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_profiles_keywords ON profiles USING gin (
    (COALESCE(artist_name, '') || ' ' || COALESCE(first_name, '') || ' ' ||
     COALESCE(last_name, '') || ' ' || COALESCE(bio, '')) gin_trgm_ops
);
CREATE INDEX IF NOT EXISTS idx_announcements_keywords ON announcements USING gin (
    (title || ' ' || description) gin_trgm_ops
);
CREATE INDEX IF NOT EXISTS idx_profiles_city_search ON profiles USING gin (city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_announcements_city_search ON announcements USING gin (city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_created_page ON profiles(created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_announcements_visible_page ON announcements(created_at DESC, id)
    WHERE is_deleted = FALSE AND is_published = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_instruments_search ON user_instruments(instrument_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_user_genres_search ON user_genres(genre_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_announcement_instruments_search ON announcement_instruments(instrument_id, announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_genres_search ON announcement_genres(genre_id, announcement_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('member', 'admin'));
CREATE INDEX IF NOT EXISTS idx_users_active_admins ON users(id) WHERE role = 'admin' AND is_active = TRUE AND is_deleted = FALSE;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS platform_analytics BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS messaging_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    signing_key JSONB NOT NULL,
    encryption_key JSONB NOT NULL,
    identity_proof TEXT NOT NULL CHECK (length(identity_proof) <= 8192),
    fingerprint TEXT NOT NULL UNIQUE,
    encrypted_private_key TEXT NOT NULL CHECK (length(encrypted_private_key) <= 16384),
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messaging_keys_current ON messaging_keys(user_id) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_messaging_keys_owner ON messaging_keys(user_id, created_at DESC, id);

ALTER TABLE messages ALTER COLUMN body DROP NOT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS encryption_version SMALLINT NOT NULL DEFAULT 0 CHECK (encryption_version IN (0, 1));
ALTER TABLE messages ADD COLUMN IF NOT EXISTS ciphertext TEXT CHECK (length(ciphertext) <= 65536);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_key_id UUID REFERENCES messaging_keys(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient_key_id UUID REFERENCES messaging_keys(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS removed_by_moderation BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE messages SET body = NULL WHERE is_deleted = TRUE AND body IS NOT NULL;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'messages'::regclass AND conname = 'messages_encryption_check') THEN
        ALTER TABLE messages ADD CONSTRAINT messages_encryption_check CHECK (
            (is_deleted = TRUE AND body IS NULL AND ciphertext IS NULL)
            OR (is_deleted = FALSE AND encryption_version = 0 AND body IS NOT NULL AND ciphertext IS NULL
                AND sender_key_id IS NULL AND recipient_key_id IS NULL)
            OR (is_deleted = FALSE AND encryption_version = 1 AND body IS NULL AND ciphertext IS NOT NULL
                AND sender_key_id IS NOT NULL AND recipient_key_id IS NOT NULL)
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS platform_analytics_daily (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day DATE NOT NULL DEFAULT CURRENT_DATE,
    kind TEXT NOT NULL CHECK (kind IN ('profile_view', 'announcement_view', 'like', 'save', 'message')),
    resource_id UUID NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY(user_id, day, kind, resource_id)
);

CREATE TABLE IF NOT EXISTS user_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    category TEXT NOT NULL CHECK (category IN ('spam', 'harassment', 'threats', 'other')),
    details TEXT NOT NULL CHECK (length(details) BETWEEN 5 AND 2000),
    signed_evidence TEXT CHECK (length(signed_evidence) <= 32768),
    legacy_evidence TEXT CHECK (length(legacy_evidence) <= 4000),
    evidence_key_id UUID REFERENCES messaging_keys(id),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'actioned', 'dismissed')),
    moderator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    moderator_note TEXT CHECK (length(moderator_note) <= 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    CHECK (reporter_id <> reported_user_id),
    CHECK (NOT (signed_evidence IS NOT NULL AND legacy_evidence IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_user_reports_queue ON user_reports(status, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reporter ON user_reports(reporter_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_user_reports_target ON user_reports(reported_user_id);

CREATE TABLE IF NOT EXISTS admin_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('role_granted', 'role_revoked', 'report_viewed', 'report_reviewed',
        'report_dismissed', 'message_removed', 'user_suspended')),
    target_id UUID,
    report_id UUID REFERENCES user_reports(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_page ON admin_audit(created_at DESC, id);

-- Shared platform contracts used by roadmap features: media purposes, admin
-- audit actions, localized notification parameters, user locale and plans.

ALTER TABLE media DROP CONSTRAINT IF EXISTS media_purpose_check;
ALTER TABLE media ADD CONSTRAINT media_purpose_check CHECK (purpose IN (
    'profile', 'announcement', 'organization', 'listing', 'event',
    'verification', 'sponsored', 'support', 'attachment'
));

ALTER TABLE admin_audit DROP CONSTRAINT IF EXISTS admin_audit_action_check;
ALTER TABLE admin_audit ADD CONSTRAINT admin_audit_action_check CHECK (action ~ '^[a-z][a-z_]{2,63}$');

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS params JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS in_app BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_notifications_in_app ON notifications(user_id, created_at DESC, id DESC) WHERE in_app = TRUE;

ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS locale TEXT;
ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_locale_check;
ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_locale_check CHECK (locale IS NULL OR locale IN ('en', 'nl', 'it'));

CREATE TABLE IF NOT EXISTS user_entitlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL CHECK (plan IN ('premium', 'partner')),
    source TEXT NOT NULL CHECK (source IN ('admin', 'stripe', 'points', 'promotion')),
    reference TEXT CHECK (length(reference) <= 255),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_user_entitlements_active ON user_entitlements(user_id, ends_at) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_entitlements_reference ON user_entitlements(source, reference) WHERE reference IS NOT NULL;

-- w5-organizations: bands, venues, organizers, booking agencies and labels with
-- memberships, relations, releases, update feeds, follows and venue claims;
-- music-lover profiles; announcements published on behalf of an organization.

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kind TEXT NOT NULL CHECK (kind IN ('band', 'venue', 'organizer', 'booking_agency', 'label')),
    name VARCHAR(255) NOT NULL CHECK (length(btrim(name)) > 0),
    slug VARCHAR(80) UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    bio TEXT CHECK (length(bio) <= 5000),
    picture_url TEXT CHECK (length(picture_url) <= 2048),
    city VARCHAR(255),
    region VARCHAR(255),
    country VARCHAR(255),
    latitude DECIMAL(10, 8) CHECK (latitude BETWEEN -90 AND 90),
    longitude DECIMAL(11, 8) CHECK (longitude BETWEEN -180 AND 180),
    contact_email VARCHAR(320),
    contact_phone VARCHAR(50),
    work_with_us TEXT CHECK (length(work_with_us) <= 5000),
    venue_type TEXT CHECK (venue_type IN ('disco', 'venue', 'social_center', 'stadium', 'club', 'theater', 'other')),
    capacity INTEGER CHECK (capacity BETWEEN 1 AND 1000000),
    active_since SMALLINT CHECK (active_since BETWEEN 1800 AND 2200),
    active_until SMALLINT CHECK (active_until BETWEEN 1800 AND 2200),
    parking_info TEXT CHECK (length(parking_info) <= 2000),
    directions TEXT CHECK (length(directions) <= 2000),
    formed_year SMALLINT CHECK (formed_year BETWEEN 1800 AND 2200),
    open_to_tours BOOLEAN NOT NULL DEFAULT FALSE,
    open_to_live BOOLEAN NOT NULL DEFAULT FALSE,
    open_to_support_acts BOOLEAN NOT NULL DEFAULT FALSE,
    open_to_endorsements BOOLEAN NOT NULL DEFAULT FALSE,
    youtube_channel_id VARCHAR(24) CHECK (youtube_channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
    youtube_linked_at TIMESTAMPTZ,
    feed_checked_at TIMESTAMPTZ,
    managed BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (managed OR kind = 'venue'),
    CHECK (kind = 'venue' OR (venue_type IS NULL AND capacity IS NULL AND parking_info IS NULL AND directions IS NULL)),
    CHECK (kind = 'band' OR (formed_year IS NULL AND youtube_channel_id IS NULL AND NOT open_to_tours
        AND NOT open_to_live AND NOT open_to_support_acts AND NOT open_to_endorsements)),
    CHECK (active_until IS NULL OR active_since IS NULL OR active_until >= active_since)
);
CREATE INDEX IF NOT EXISTS idx_organizations_page ON organizations(kind, created_at DESC, id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_organizations_name_search ON organizations USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_organizations_location_search ON organizations USING gin (
    (COALESCE(city, '') || ' ' || COALESCE(region, '') || ' ' || COALESCE(country, '')) gin_trgm_ops
);
CREATE INDEX IF NOT EXISTS idx_organizations_creator ON organizations(created_by);
CREATE INDEX IF NOT EXISTS idx_organizations_feed ON organizations(feed_checked_at NULLS FIRST)
    WHERE youtube_channel_id IS NOT NULL AND is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS organization_genres (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    genre_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY(organization_id, genre_id)
);
CREATE INDEX IF NOT EXISTS idx_organization_genres_search ON organization_genres(genre_id, organization_id);

CREATE TABLE IF NOT EXISTS organization_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    link_type TEXT NOT NULL CHECK (link_type IN ('spotify', 'youtube', 'soundcloud', 'bandcamp', 'instagram', 'website', 'other')),
    url TEXT NOT NULL CHECK (length(url) <= 2048),
    position SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_organization_links_owner ON organization_links(organization_id, position);

CREATE TABLE IF NOT EXISTS organization_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    url TEXT NOT NULL CHECK (length(url) <= 2048),
    category TEXT NOT NULL CHECK (category IN ('inside', 'outside', 'gallery')),
    caption VARCHAR(200),
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_organization_photos_owner ON organization_photos(organization_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_organization_photos_url ON organization_photos(url);

CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'admin', 'member')),
    status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'declined', 'left', 'removed')),
    title VARCHAR(100),
    permissions TEXT[] NOT NULL DEFAULT '{}' CHECK (permissions <@ ARRAY[
        'manage_profile', 'manage_members', 'post_announcements', 'manage_calendar'
    ]::text[]),
    joined_on DATE,
    left_on DATE,
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (role <> 'leader' OR status IN ('active', 'left', 'removed')),
    CHECK (left_on IS NULL OR joined_on IS NULL OR left_on >= joined_on)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_members_current ON organization_members(organization_id, user_id)
    WHERE status IN ('invited', 'active');
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_members_leader ON organization_members(organization_id)
    WHERE role = 'leader' AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_organization_members_user ON organization_members(user_id, status);

CREATE TABLE IF NOT EXISTS organization_followers (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_organization_followers_user ON organization_followers(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS organization_relations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kind TEXT NOT NULL CHECK (kind IN ('roster', 'label')),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    band_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'ended')),
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    responded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    CHECK (organization_id <> band_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_relations_current ON organization_relations(kind, organization_id, band_id)
    WHERE status IN ('pending', 'accepted');
CREATE INDEX IF NOT EXISTS idx_organization_relations_band ON organization_relations(band_id, status);

CREATE TABLE IF NOT EXISTS organization_similar (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    similar_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    position SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(organization_id, similar_id),
    CHECK (organization_id <> similar_id)
);

CREATE TABLE IF NOT EXISTS organization_releases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL CHECK (length(btrim(title)) > 0),
    release_type TEXT NOT NULL CHECK (release_type IN ('single', 'ep', 'lp', 'album')),
    release_date DATE,
    links JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(links) = 'array'),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_organization_releases_owner ON organization_releases(organization_id, release_date DESC NULLS LAST, id);

CREATE TABLE IF NOT EXISTS organization_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('manual', 'youtube', 'release')),
    external_id VARCHAR(64),
    title VARCHAR(255),
    body TEXT CHECK (length(body) <= 4000),
    url TEXT CHECK (length(url) <= 2048),
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (source = 'manual' OR external_id IS NOT NULL),
    CHECK (title IS NOT NULL OR body IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_posts_external ON organization_posts(organization_id, source, external_id)
    WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organization_posts_page ON organization_posts(organization_id, published_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS organization_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL CHECK (length(message) BETWEEN 10 AND 2000),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    review_note TEXT CHECK (length(review_note) <= 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_claims_pending ON organization_claims(organization_id, user_id)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_organization_claims_queue ON organization_claims(status, created_at, id);

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_organization ON announcements(organization_id, created_at DESC)
    WHERE organization_id IS NOT NULL;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_kind TEXT NOT NULL DEFAULT 'artist'
    CHECK (account_kind IN ('artist', 'music_lover'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS follows_visible BOOLEAN NOT NULL DEFAULT TRUE;
