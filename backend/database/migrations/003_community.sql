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
