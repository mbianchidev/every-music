-- w0b-notifications: per-kind notification channel choices, an email outbox on
-- notifications, and cross-process leases for scheduled notification jobs.

CREATE TABLE IF NOT EXISTS notification_channel_preferences (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_]{1,63}$'),
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
