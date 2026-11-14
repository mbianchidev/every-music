// Hourly cleanup for account-trust records, run by the notification worker.
export async function maintainAccountTrust(connector) {
  await connector.execute('DELETE FROM two_factor_challenges WHERE expires_at < NOW()');
  await connector.execute('DELETE FROM account_codes WHERE expires_at < NOW()');
  await connector.execute("DELETE FROM user_two_factor WHERE enabled_at IS NULL AND created_at < NOW() - INTERVAL '1 hour'");
  await connector.execute(`
    UPDATE user_two_factor SET pending_code_hash = NULL, pending_expires_at = NULL, pending_attempts = 0
    WHERE enabled_at IS NOT NULL AND pending_expires_at < NOW()`);
  await connector.execute("DELETE FROM account_rate_events WHERE created_at < NOW() - INTERVAL '2 days'");
  await connector.execute(`
    DELETE FROM media WHERE id IN (
      SELECT unnest(ARRAY[selfie_media_id, document_media_id]) FROM verification_requests WHERE media_purge_after < NOW())`);
  await connector.execute('UPDATE verification_requests SET media_purge_after = NULL WHERE media_purge_after < NOW()');
}
