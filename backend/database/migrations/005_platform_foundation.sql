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
