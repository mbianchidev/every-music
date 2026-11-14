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

-- w0b-notifications: per-kind notification channel choices, an email outbox on
-- notifications, and cross-process leases for scheduled notification jobs.

CREATE TABLE IF NOT EXISTS notification_channel_preferences (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 64),
    in_app BOOLEAN,
    push BOOLEAN,
    email BOOLEAN,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, kind)
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_email_status_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_email_status_check
    CHECK (email_status IN ('none', 'pending', 'sent', 'failed', 'skipped', 'expired'));
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS next_email_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_notifications_email ON notifications(next_email_at) WHERE email_status = 'pending';

CREATE TABLE IF NOT EXISTS notification_job_runs (
    name TEXT PRIMARY KEY CHECK (name ~ '^[a-z][a-z0-9_]{2,63}$'),
    last_run_at TIMESTAMPTZ NOT NULL
);

-- w0c-infra: object storage metadata for media, encrypted attachment blobs,
-- a durable queue for deleting stored objects, and native mobile push devices.
-- Existing rows keep their PostgreSQL bytes; new rows store either bytes or an
-- object key, never both.

ALTER TABLE media ADD COLUMN IF NOT EXISTS storage_key TEXT;
ALTER TABLE media ADD COLUMN IF NOT EXISTS mime_type TEXT NOT NULL DEFAULT 'image/webp';
ALTER TABLE media ADD COLUMN IF NOT EXISTS byte_size INTEGER;
UPDATE media SET byte_size = octet_length(content) WHERE byte_size IS NULL AND content IS NOT NULL;
ALTER TABLE media ALTER COLUMN byte_size SET NOT NULL;
ALTER TABLE media ALTER COLUMN content DROP NOT NULL;
ALTER TABLE media DROP CONSTRAINT IF EXISTS media_content_check;
ALTER TABLE media ADD CONSTRAINT media_content_check CHECK (octet_length(content) <= 52428800);
ALTER TABLE media DROP CONSTRAINT IF EXISTS media_storage_check;
ALTER TABLE media ADD CONSTRAINT media_storage_check CHECK ((content IS NULL) <> (storage_key IS NULL));
ALTER TABLE media DROP CONSTRAINT IF EXISTS media_storage_key_check;
ALTER TABLE media ADD CONSTRAINT media_storage_key_check CHECK (
    length(storage_key) <= 512 AND storage_key ~ '^[a-z0-9][a-z0-9/._-]*$'
);
ALTER TABLE media DROP CONSTRAINT IF EXISTS media_mime_type_check;
ALTER TABLE media ADD CONSTRAINT media_mime_type_check CHECK (mime_type ~ '^[a-z]+/[a-z0-9.+-]{1,100}$');
ALTER TABLE media DROP CONSTRAINT IF EXISTS media_byte_size_check;
ALTER TABLE media ADD CONSTRAINT media_byte_size_check CHECK (
    byte_size BETWEEN 0 AND 52428800 AND (content IS NULL OR byte_size = octet_length(content))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_storage_key ON media(storage_key) WHERE storage_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_created ON media(created_at);

-- Rows written with PostgreSQL bytes record their size automatically, so
-- existing insert paths that only provide content keep working.
CREATE OR REPLACE FUNCTION set_media_byte_size() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.content IS NOT NULL THEN
        NEW.byte_size := octet_length(NEW.content);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_media_byte_size ON media;
CREATE TRIGGER set_media_byte_size BEFORE INSERT OR UPDATE OF content ON media
    FOR EACH ROW EXECUTE FUNCTION set_media_byte_size();

CREATE TABLE IF NOT EXISTS media_object_deletions (
    storage_key TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_object_deletions_due ON media_object_deletions(next_attempt_at);

-- Every deletion path (orphan cleanup, account deletion cascades, manual SQL)
-- queues the stored object so the background worker can remove it.
CREATE OR REPLACE FUNCTION queue_media_object_deletion() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO media_object_deletions (storage_key) VALUES (OLD.storage_key)
    ON CONFLICT (storage_key) DO NOTHING;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS queue_media_object_deletion ON media;
CREATE TRIGGER queue_media_object_deletion AFTER DELETE ON media
    FOR EACH ROW WHEN (OLD.storage_key IS NOT NULL) EXECUTE FUNCTION queue_media_object_deletion();

CREATE TABLE IF NOT EXISTS push_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
    token TEXT NOT NULL CHECK (length(token) BETWEEN 32 AND 4096),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (platform, token)
);
CREATE INDEX IF NOT EXISTS idx_push_devices_user ON push_devices(user_id, updated_at DESC);

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

-- w2-account-trust: two-factor authentication, re-authentication codes,
-- session revocation, per-account throttles, opt-in contact discovery, and
-- profile verification requests.

ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_revoked_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- One row per account. enabled_at IS NULL means an unfinished enrollment.
-- totp_secret and phone_number are sealed with the two-factor key.
CREATE TABLE IF NOT EXISTS user_two_factor (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    method TEXT NOT NULL CHECK (method IN ('totp', 'email', 'sms')),
    totp_secret TEXT CHECK (length(totp_secret) <= 512),
    phone_number TEXT CHECK (length(phone_number) <= 512),
    totp_last_step BIGINT,
    enabled_at TIMESTAMPTZ,
    pending_code_hash VARCHAR(64),
    pending_expires_at TIMESTAMPTZ,
    pending_attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (method <> 'totp' OR totp_secret IS NOT NULL),
    CHECK (method <> 'sms' OR phone_number IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_user_two_factor_pending ON user_two_factor(created_at) WHERE enabled_at IS NULL;

CREATE TABLE IF NOT EXISTS two_factor_recovery_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash VARCHAR(64) NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, code_hash)
);

CREATE TABLE IF NOT EXISTS two_factor_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    method TEXT NOT NULL CHECK (method IN ('totp', 'email', 'sms')),
    code_hash VARCHAR(64),
    attempts INTEGER NOT NULL DEFAULT 0,
    sends INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_two_factor_challenges_user ON two_factor_challenges(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_two_factor_challenges_expiration ON two_factor_challenges(expires_at);

-- Emailed one-time codes that re-authenticate accounts without a password.
CREATE TABLE IF NOT EXISTS account_codes (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('reauthenticate')),
    code_hash VARCHAR(64) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, purpose)
);

-- Per-account throttles that hold across API processes.
CREATE TABLE IF NOT EXISTS account_rate_events (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action ~ '^[a-z][a-z_]{2,63}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_account_rate_events_lookup ON account_rate_events(user_id, action, created_at DESC);

-- Present only for accounts that opted in to being found by email address.
CREATE TABLE IF NOT EXISTS contact_discovery (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email_hash VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- subject_type/subject_id let other subject kinds reuse this queue later.
CREATE TABLE IF NOT EXISTS verification_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_type TEXT NOT NULL DEFAULT 'user' CHECK (subject_type IN ('user')),
    subject_id UUID NOT NULL,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_code TEXT NOT NULL CHECK (length(challenge_code) <= 32),
    selfie_media_id UUID REFERENCES media(id) ON DELETE SET NULL,
    document_media_id UUID REFERENCES media(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    review_note TEXT CHECK (length(review_note) <= 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    media_purge_after TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_requests_pending ON verification_requests(subject_type, subject_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_verification_requests_queue ON verification_requests(status, created_at, id);
CREATE INDEX IF NOT EXISTS idx_verification_requests_requester ON verification_requests(requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_requests_purge ON verification_requests(media_purge_after) WHERE media_purge_after IS NOT NULL;

-- w3-help-onboarding: support requests, terms acceptance, onboarding tour,
-- recorded application releases and in-app ratings.

CREATE TABLE IF NOT EXISTS support_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kind TEXT NOT NULL CHECK (kind IN ('bug', 'contact', 'work')),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    contact_name TEXT CHECK (length(contact_name) <= 120),
    contact_email TEXT CHECK (length(contact_email) <= 255),
    subject TEXT NOT NULL CHECK (length(subject) BETWEEN 3 AND 200),
    message TEXT NOT NULL CHECK (length(message) BETWEEN 10 AND 5000),
    steps TEXT CHECK (length(steps) <= 5000),
    link TEXT CHECK (length(link) <= 2048),
    diagnostics JSONB CHECK (diagnostics IS NULL OR jsonb_typeof(diagnostics) = 'object'),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'answered', 'closed')),
    reply_note TEXT CHECK (length(reply_note) <= 5000),
    handled_by UUID REFERENCES users(id) ON DELETE SET NULL,
    answered_at TIMESTAMPTZ,
    forwarded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_requests_queue ON support_requests(status, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_support_requests_user ON support_requests(user_id, created_at DESC, id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS terms_acceptances (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    terms_version TEXT NOT NULL CHECK (terms_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'),
    source TEXT NOT NULL CHECK (source IN ('registration', 'prompt')),
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, terms_version)
);

CREATE TABLE IF NOT EXISTS user_onboarding (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    tour_status TEXT NOT NULL DEFAULT 'pending' CHECK (tour_status IN ('pending', 'completed', 'skipped')),
    tour_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_releases (
    version TEXT PRIMARY KEY CHECK (version ~ '^[0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6}([-+][0-9A-Za-z.-]{1,40})?$'),
    major INTEGER NOT NULL CHECK (major >= 0),
    minor INTEGER NOT NULL CHECK (minor >= 0),
    patch INTEGER NOT NULL CHECK (patch >= 0),
    notified_kind TEXT CHECK (notified_kind IN ('app_update_minor', 'app_update_major')),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    app_version TEXT NOT NULL CHECK (app_version ~ '^[0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6}$'),
    stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
    comment TEXT CHECK (length(comment) <= 1000),
    platform TEXT CHECK (platform IN ('web', 'pwa', 'desktop', 'android', 'ios')),
    rewarded_at TIMESTAMPTZ,
    reward_reference TEXT CHECK (length(reward_reference) <= 255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, app_version)
);
CREATE INDEX IF NOT EXISTS idx_app_ratings_version ON app_ratings(app_version, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_ratings_unrewarded ON app_ratings(created_at, id) WHERE rewarded_at IS NULL;

-- w4-applications: in-app replies to announcements with an owner dashboard.
-- Withdrawn rows keep only routing metadata; the partial unique index allows
-- one active application per applicant and announcement. closed_at records
-- when the announcement stopped accepting replies and drives retention.

CREATE TABLE IF NOT EXISTS announcement_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL CHECK (length(message) <= 4000),
    links JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(links) = 'array'),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'shortlisted', 'accepted', 'declined', 'withdrawn')),
    owner_note TEXT CHECK (length(owner_note) <= 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status_changed_at TIMESTAMPTZ,
    withdrawn_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    CHECK (status = 'withdrawn' OR length(message) >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_active
    ON announcement_applications(announcement_id, applicant_id) WHERE status <> 'withdrawn';
CREATE INDEX IF NOT EXISTS idx_applications_announcement
    ON announcement_applications(announcement_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_applications_applicant
    ON announcement_applications(applicant_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_applications_closed
    ON announcement_applications(closed_at) WHERE closed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS application_instruments (
    application_id UUID NOT NULL REFERENCES announcement_applications(id) ON DELETE CASCADE,
    instrument_id UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    PRIMARY KEY (application_id, instrument_id)
);
CREATE INDEX IF NOT EXISTS idx_application_instruments_instrument ON application_instruments(instrument_id);

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

-- w8-events: concerts and festivals with lineups, organizers, venues, tickets,
-- capacity, attendance, reminders, attendee discussion, official
-- communications, event reports and organization verification requests.

CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(160) NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 160),
    description TEXT CHECK (length(description) <= 10000),
    event_type TEXT NOT NULL DEFAULT 'concert' CHECK (event_type IN ('concert', 'festival', 'other')),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'postponed', 'cancelled')),
    visibility TEXT NOT NULL DEFAULT 'draft' CHECK (visibility IN ('draft', 'published')),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    doors_open_at TIMESTAMPTZ,
    timezone TEXT NOT NULL CHECK (length(timezone) BETWEEN 1 AND 64),
    venue_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
    address TEXT CHECK (length(address) <= 300),
    latitude DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
    capacity INTEGER CHECK (capacity BETWEEN 1 AND 10000000),
    tickets_sold INTEGER NOT NULL DEFAULT 0 CHECK (tickets_sold >= 0),
    owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ,
    revision INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at IS NULL OR ends_at > starts_at),
    CHECK (doors_open_at IS NULL OR doors_open_at <= starts_at),
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CHECK (capacity IS NULL OR tickets_sold <= capacity),
    CHECK (capacity IS NOT NULL OR tickets_sold = 0)
);
CREATE INDEX IF NOT EXISTS idx_events_published_start ON events(starts_at, id) WHERE visibility = 'published';
CREATE INDEX IF NOT EXISTS idx_events_owner ON events(owner_user_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_events_creator ON events(created_by);
CREATE INDEX IF NOT EXISTS idx_events_venue ON events(venue_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_events_place ON events(place_id);
CREATE INDEX IF NOT EXISTS idx_events_location ON events(latitude, longitude) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_title_search ON events USING gin (title gin_trgm_ops);

CREATE TABLE IF NOT EXISTS event_organizers (
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    position SMALLINT NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 9),
    PRIMARY KEY (event_id, organization_id)
);
CREATE INDEX IF NOT EXISTS idx_event_organizers_organization ON event_organizers(organization_id);

CREATE TABLE IF NOT EXISTS event_lineup (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 99),
    role TEXT NOT NULL CHECK (role IN ('headliner', 'opener', 'support', 'other')),
    band_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    artist_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(160) CHECK (length(btrim(name)) BETWEEN 1 AND 160),
    set_starts_at TIMESTAMPTZ,
    set_ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (num_nonnulls(band_id, artist_user_id, name) = 1),
    CHECK (set_ends_at IS NULL OR set_starts_at IS NULL OR set_ends_at > set_starts_at)
);
CREATE INDEX IF NOT EXISTS idx_event_lineup_event ON event_lineup(event_id, position);
CREATE INDEX IF NOT EXISTS idx_event_lineup_band ON event_lineup(band_id) WHERE band_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_lineup_artist ON event_lineup(artist_user_id) WHERE artist_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS event_genres (
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    genre_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, genre_id)
);
CREATE INDEX IF NOT EXISTS idx_event_genres_genre ON event_genres(genre_id);

CREATE TABLE IF NOT EXISTS event_images (
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 5),
    PRIMARY KEY (event_id, media_id),
    UNIQUE (event_id, position)
);
CREATE INDEX IF NOT EXISTS idx_event_images_url ON event_images(('/realm/media/' || media_id::text));

CREATE TABLE IF NOT EXISTS event_ticket_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    label VARCHAR(80) NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
    url TEXT NOT NULL CHECK (length(url) <= 2048 AND url ~ '^https://'),
    position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 4)
);
CREATE INDEX IF NOT EXISTS idx_event_ticket_links_event ON event_ticket_links(event_id, position);

CREATE TABLE IF NOT EXISTS event_attendees (
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('going', 'interested')),
    show_on_profile BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user ON event_attendees(user_id, status);

CREATE TABLE IF NOT EXISTS event_reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    offset_minutes INTEGER NOT NULL CHECK (offset_minutes BETWEEN 5 AND 20160),
    remind_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, user_id, offset_minutes)
);
CREATE INDEX IF NOT EXISTS idx_event_reminders_due ON event_reminders(remind_at) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_reminders_user ON event_reminders(user_id);

CREATE TABLE IF NOT EXISTS event_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_posts_page ON event_posts(event_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_event_posts_author ON event_posts(author_id);

CREATE TABLE IF NOT EXISTS event_communications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('door_open', 'cancellation', 'refund', 'lineup_change', 'postponement', 'general')),
    body TEXT CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
    automatic BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (automatic OR body IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_event_communications_event ON event_communications(event_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_event_communications_author ON event_communications(author_id);

ALTER TABLE user_reports ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE user_reports ADD COLUMN IF NOT EXISTS event_post_id UUID REFERENCES event_posts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_user_reports_event ON user_reports(event_id, status) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_reports_event_post ON user_reports(event_post_id) WHERE event_post_id IS NOT NULL;

ALTER TABLE verification_requests DROP CONSTRAINT IF EXISTS verification_requests_subject_type_check;
ALTER TABLE verification_requests ADD CONSTRAINT verification_requests_subject_type_check CHECK (subject_type IN ('user', 'organization'));
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS request_note TEXT CHECK (length(request_note) <= 2000);

-- w10-band-collab: band and personal calendars with invitees, RSVPs, per-user
-- reminders and private ICS feeds; end-to-end encrypted band group chat with
-- encrypted attachments; profile reviews and anonymous star ratings.

CREATE TABLE IF NOT EXISTS calendar_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('rehearsal', 'gig', 'recording', 'meeting', 'other')),
    title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    time_zone TEXT NOT NULL CHECK (time_zone ~ '^[A-Za-z][A-Za-z0-9_+/-]{0,63}$'),
    place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
    address TEXT CHECK (length(address) <= 500),
    notes TEXT CHECK (length(notes) <= 4000),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
    sequence INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((organization_id IS NULL) <> (owner_id IS NULL)),
    CHECK (ends_at > starts_at AND ends_at <= starts_at + INTERVAL '14 days')
);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_organization ON calendar_entries(organization_id, starts_at)
    WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_entries_owner ON calendar_entries(owner_id, starts_at) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_entries_creator ON calendar_entries(created_by);

-- Explicit invitees (invited = TRUE) and RSVPs of band members (invited = FALSE).
CREATE TABLE IF NOT EXISTS calendar_participants (
    entry_id UUID NOT NULL REFERENCES calendar_entries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited BOOLEAN NOT NULL DEFAULT FALSE,
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    response TEXT NOT NULL DEFAULT 'pending' CHECK (response IN ('pending', 'yes', 'no', 'maybe')),
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (entry_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_participants_user ON calendar_participants(user_id, entry_id);

CREATE TABLE IF NOT EXISTS calendar_reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_id UUID NOT NULL REFERENCES calendar_entries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    offset_minutes INTEGER NOT NULL CHECK (offset_minutes BETWEEN 0 AND 40320),
    remind_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    UNIQUE (entry_id, user_id, offset_minutes)
);
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_due ON calendar_reminders(remind_at) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_user ON calendar_reminders(user_id);

-- One private subscription feed per account; only a SHA-256 hash of the token is stored.
CREATE TABLE IF NOT EXISTS calendar_feed_tokens (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

-- Chat membership periods follow active band membership; a new period starts
-- whenever someone (re)joins, and messages before it stay out of reach.
CREATE TABLE IF NOT EXISTS band_chat_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_id UUID REFERENCES organization_members(id) ON DELETE SET NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    left_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ NOT NULL DEFAULT '-infinity',
    CHECK (left_at IS NULL OR left_at >= joined_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_band_chat_members_current ON band_chat_members(organization_id, user_id)
    WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_band_chat_members_user ON band_chat_members(user_id, organization_id);

CREATE TABLE IF NOT EXISTS band_chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID NOT NULL,
    ciphertext TEXT CHECK (length(ciphertext) <= 262144),
    sender_key_id UUID REFERENCES messaging_keys(id),
    recipient_key_ids UUID[] NOT NULL DEFAULT '{}',
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    removed_by_moderation BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (sender_id, client_id),
    CHECK ((is_deleted AND ciphertext IS NULL) OR (NOT is_deleted AND ciphertext IS NOT NULL
        AND sender_key_id IS NOT NULL AND cardinality(recipient_key_ids) BETWEEN 1 AND 100))
);
CREATE INDEX IF NOT EXISTS idx_band_chat_messages_page ON band_chat_messages(organization_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS band_chat_attachments (
    message_id UUID NOT NULL REFERENCES band_chat_messages(id) ON DELETE CASCADE,
    media_id UUID NOT NULL UNIQUE REFERENCES media(id) ON DELETE CASCADE,
    PRIMARY KEY (message_id, media_id)
);
CREATE INDEX IF NOT EXISTS idx_band_chat_attachments_url ON band_chat_attachments(('/realm/media/' || media_id::text));

ALTER TABLE user_reports ADD COLUMN IF NOT EXISTS band_message_id UUID REFERENCES band_chat_messages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_user_reports_band_message ON user_reports(band_message_id) WHERE band_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS profile_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
    body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    UNIQUE (author_id, subject_id),
    CHECK (author_id <> subject_id)
);
CREATE INDEX IF NOT EXISTS idx_profile_reviews_subject ON profile_reviews(subject_id, status, updated_at DESC, id);

-- Individual ratings are readable only by their rater. Others only ever see
-- the aggregate in profile_rating_stats, republished by a daily job.
CREATE TABLE IF NOT EXISTS profile_ratings (
    rater_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (rater_id, subject_id),
    CHECK (rater_id <> subject_id)
);
CREATE INDEX IF NOT EXISTS idx_profile_ratings_subject ON profile_ratings(subject_id);

CREATE TABLE IF NOT EXISTS profile_rating_stats (
    subject_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    rating_count INTEGER NOT NULL CHECK (rating_count >= 0),
    star_total INTEGER NOT NULL CHECK (star_total >= 0),
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- i18n-polish: instruments played in each musical project, chosen from the
-- instrument catalog. Rows follow their project and instrument on deletion.
CREATE TABLE IF NOT EXISTS project_instruments (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    instrument_id UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, instrument_id)
);
CREATE INDEX IF NOT EXISTS idx_project_instruments_instrument ON project_instruments(instrument_id);
