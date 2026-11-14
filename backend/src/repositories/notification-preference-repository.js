import { realmConnector } from './realm-connector.js';
import { publishEvent } from './event-publisher.js';
import { entitlementRepository } from './entitlement-repository.js';
import { requestError } from '../engines/request-error.js';
import { NOTIFICATION_CHANNELS } from '../engines/notification-catalog.js';
import {
  CATEGORY_DEFAULTS, CHANNEL_COLUMNS, PLAN_FEATURES, catalogKinds, categoryOf, channelAvailability, defaultChoice, resolveChannel,
} from '../engines/notification-channels.js';

class NotificationPreferenceRepository {
  async overview(userId, executor = realmConnector) {
    const { rows } = await executor.execute(`
      SELECT u.email, COALESCE(u.email_verified, FALSE) AS "emailVerified",
             COALESCE(p.messages, TRUE) AS messages,
             COALESCE(p.announcements, TRUE) AS announcements,
             COALESCE(p.engagements, TRUE) AS engagements,
             COALESCE(p.profile_views, FALSE) AS "profileViews",
             COALESCE(p.push, FALSE) AS push
      FROM users u LEFT JOIN user_preferences p ON p.user_id = u.id
      WHERE u.id = $1 AND u.is_deleted = FALSE`, [userId]);
    if (!rows.length) throw requestError(404, 'USER_NOT_FOUND', 'User not found');
    const account = rows[0];
    const { rows: stored } = await executor.execute(
      'SELECT kind, in_app, push, email FROM notification_channel_preferences WHERE user_id = $1', [userId],
    );
    const overrides = new Map(stored.map(row => [row.kind, row]));
    const { plan, limits } = await entitlementRepository.limitsFor(userId, executor);
    const categories = Object.fromEntries(Object.keys(CATEGORY_DEFAULTS).map(key => [key, account[key]]));
    return {
      categories,
      push: account.push,
      email: { address: account.email, verified: account.emailVerified },
      plan,
      kinds: catalogKinds().map((kind) => {
        const category = categoryOf(kind);
        const planFeature = PLAN_FEATURES[kind] ?? null;
        const override = overrides.get(kind);
        return {
          kind,
          category,
          categoryEnabled: category ? categories[category] : true,
          planFeature,
          planAllowed: planFeature ? Boolean(limits[planFeature]) : true,
          channels: Object.fromEntries(NOTIFICATION_CHANNELS.map(channel => [channel, {
            availability: channelAvailability(kind, channel),
            default: defaultChoice(kind, channel),
            enabled: resolveChannel(kind, channel, override?.[CHANNEL_COLUMNS[channel]]),
          }])),
        };
      }),
    };
  }

  // `changes` maps kind -> { inApp?, push?, email? }; omitted channels stay
  // unchanged, booleans store a choice, and null restores the catalog default.
  async update(userId, changes) {
    for (const [kind, channels] of Object.entries(changes)) {
      for (const [channel, value] of Object.entries(channels)) {
        if (value === true && channelAvailability(kind, channel) === 'off') {
          throw requestError(400, 'CHANNEL_UNAVAILABLE', `The ${channel} channel is not available for ${kind} notifications`);
        }
      }
    }
    return realmConnector.transaction(async (executor) => {
      for (const [kind, channels] of Object.entries(changes)) {
        const provided = NOTIFICATION_CHANNELS.filter(channel => Object.hasOwn(channels, channel));
        if (!provided.length) continue;
        const values = NOTIFICATION_CHANNELS.map(channel => (
          Object.hasOwn(channels, channel) && channelAvailability(kind, channel) !== 'off' ? channels[channel] : null
        ));
        const touched = NOTIFICATION_CHANNELS.map(channel => provided.includes(channel));
        await executor.execute(`
          INSERT INTO notification_channel_preferences (user_id, kind, in_app, push, email)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id, kind) DO UPDATE SET
            in_app = CASE WHEN $6 THEN EXCLUDED.in_app ELSE notification_channel_preferences.in_app END,
            push = CASE WHEN $7 THEN EXCLUDED.push ELSE notification_channel_preferences.push END,
            email = CASE WHEN $8 THEN EXCLUDED.email ELSE notification_channel_preferences.email END,
            updated_at = NOW()`, [userId, kind, ...values, ...touched]);
      }
      await executor.execute(`
        DELETE FROM notification_channel_preferences
        WHERE user_id = $1 AND in_app IS NULL AND push IS NULL AND email IS NULL`, [userId]);
      await publishEvent(executor, 'preferences.changed', { userId });
      return this.overview(userId, executor);
    });
  }
}

export const notificationPreferenceRepository = new NotificationPreferenceRepository();
