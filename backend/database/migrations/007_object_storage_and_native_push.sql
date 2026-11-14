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
