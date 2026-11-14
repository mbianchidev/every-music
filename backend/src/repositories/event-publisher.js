export async function publishEvent(executor, type, { userId, id } = {}) {
  await executor.execute("SELECT pg_notify('everymusic_events', $1)", [
    JSON.stringify({ type, userId, id }),
  ]);
}

export async function publishAdminEvent(executor) {
  await executor.execute(`
    SELECT pg_notify('everymusic_events', json_build_object('type', 'admin.changed', 'userId', id)::text)
    FROM users WHERE role = 'admin' AND is_active = TRUE AND is_deleted = FALSE`);
}
