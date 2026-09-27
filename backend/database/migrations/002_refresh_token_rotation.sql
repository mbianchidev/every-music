ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replacement_jti VARCHAR(64),
  ADD COLUMN IF NOT EXISTS replaced_by UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expiration
  ON refresh_tokens(expires_at)
  WHERE revoked = false;
