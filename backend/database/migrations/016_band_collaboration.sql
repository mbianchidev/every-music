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
