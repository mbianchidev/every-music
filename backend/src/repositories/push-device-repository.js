import { realmConnector } from './realm-connector.js';
import { requestError } from '../engines/request-error.js';
import { PUSH_DEVICE_LIMIT } from '../engines/native-push.js';

const deviceView = row => ({ id: row.id, platform: row.platform, createdAt: row.created_at, updatedAt: row.updated_at });

class PushDeviceRepository {
  async register(userId, platform, token) {
    return realmConnector.transaction(async (executor) => {
      await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const { rows: counts } = await executor.execute(
        'SELECT COUNT(*)::int AS count FROM push_devices WHERE user_id = $1 AND NOT (platform = $2 AND token = $3)',
        [userId, platform, token],
      );
      if (counts[0].count >= PUSH_DEVICE_LIMIT) {
        throw requestError(400, 'PUSH_DEVICE_LIMIT', `At most ${PUSH_DEVICE_LIMIT} mobile devices can receive push. Remove one to add another.`);
      }
      const { rows } = await executor.execute(`
        INSERT INTO push_devices (user_id, platform, token) VALUES ($1, $2, $3)
        ON CONFLICT (platform, token) DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = NOW()
        RETURNING id, platform, created_at, updated_at`, [userId, platform, token]);
      await executor.execute(`
        INSERT INTO user_preferences (user_id, push) VALUES ($1, TRUE)
        ON CONFLICT (user_id) DO UPDATE SET push = TRUE`, [userId]);
      return deviceView(rows[0]);
    });
  }

  async list(userId) {
    const { rows } = await realmConnector.execute(
      'SELECT id, platform, created_at, updated_at FROM push_devices WHERE user_id = $1 ORDER BY updated_at DESC, id',
      [userId],
    );
    return rows.map(deviceView);
  }

  async removeToken(userId, platform, token) {
    await realmConnector.execute('DELETE FROM push_devices WHERE user_id = $1 AND platform = $2 AND token = $3', [userId, platform, token]);
  }

  async remove(userId, deviceId) {
    const { rowCount } = await realmConnector.execute('DELETE FROM push_devices WHERE id = $1 AND user_id = $2', [deviceId, userId]);
    if (!rowCount) throw requestError(404, 'PUSH_DEVICE_NOT_FOUND', 'Device not found');
  }
}

export const pushDeviceRepository = new PushDeviceRepository();
