ALTER TABLE users
  ADD COLUMN IF NOT EXISTS verification_token_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS reset_password_token_hash VARCHAR(64);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'verification_token'
  ) THEN
    EXECUTE '
      UPDATE users
      SET verification_token = NULL,
          verification_token_expires = NULL,
          reset_password_token = NULL,
          reset_password_expires = NULL
      WHERE verification_token IS NOT NULL
         OR reset_password_token IS NOT NULL
    ';
  END IF;
END
$$;

ALTER TABLE users
  DROP COLUMN IF EXISTS verification_token,
  DROP COLUMN IF EXISTS reset_password_token;

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS token_hash VARCHAR(64);

DELETE FROM refresh_tokens WHERE token_hash IS NULL;

ALTER TABLE refresh_tokens
  ALTER COLUMN token_hash SET NOT NULL,
  DROP COLUMN IF EXISTS token;

CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash
  ON refresh_tokens(token_hash);
