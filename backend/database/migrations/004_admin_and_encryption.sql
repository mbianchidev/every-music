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
