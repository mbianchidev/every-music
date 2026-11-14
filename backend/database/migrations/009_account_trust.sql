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
