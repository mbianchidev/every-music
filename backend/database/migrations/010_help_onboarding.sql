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
