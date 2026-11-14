import { createHash } from 'node:crypto';
import { realmConnector } from './realm-connector.js';
import { publishEvent, publishAdminEvent } from './event-publisher.js';
import { twoFactorRepository, throwOutcome, MAX_CODE_ATTEMPTS } from './two-factor-repository.js';
import { cipherEngine } from '../engines/cipher-engine.js';
import { secretBox } from '../engines/secret-box.js';
import { requestError } from '../engines/request-error.js';
import { exportSections } from '../engines/export-sections.js';
import { organizationRepository } from './organization-repository.js';
import { eventRepository } from './event-repository.js';

async function exportFeatureSections(all) {
  const sections = {};
  for (const section of exportSections) {
    const rows = await all(section.sql);
    sections[section.key] = section.single ? rows[0] ?? null : rows;
  }
  return sections;
}

export const MAX_REAUTH_FAILURES = 5;

export const normalizeContactEmail = email => String(email ?? '').normalize('NFC').trim().toLowerCase();
export const contactHash = email => createHash('sha256').update(normalizeContactEmail(email)).digest('hex');
const fail = (status, code, message) => ({ error: [status, code, message] });

function profileSummary(row) {
  return {
    id: row.profile_id, userId: row.user_id, artistName: row.artist_name, firstName: row.first_name, lastName: row.last_name,
    city: row.city, state: row.state, country: row.country, bio: row.bio, profilePictureUrl: row.profile_picture_url,
    verifiedAt: row.verified_at, createdAt: row.created_at, instruments: [], genres: [],
  };
}

class AccountRepository {
  async recentCount(executor, userId, action, minutes) {
    const { rows } = await executor.execute(`
      SELECT COUNT(*)::int AS count FROM account_rate_events
      WHERE user_id = $1 AND action = $2 AND created_at > NOW() - make_interval(mins => $3)`, [userId, action, minutes]);
    return rows[0].count;
  }

  // Serializes per account and records the action, or throws 429.
  async throttle(executor, userId, action, { max, minutes, message }) {
    await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (await this.recentCount(executor, userId, action, minutes) >= max) {
      throw requestError(429, 'ACCOUNT_RATE_LIMIT', message);
    }
    await executor.execute('INSERT INTO account_rate_events (user_id, action) VALUES ($1, $2)', [userId, action]);
  }

  async identity(executor, userId, lock = false) {
    const { rows } = await executor.execute(`
      SELECT id, email, password_hash IS NOT NULL AS has_password, password_hash, google_id IS NOT NULL AS google_linked
      FROM users WHERE id = $1 AND is_deleted = FALSE ${lock ? 'FOR UPDATE' : ''}`, [userId]);
    if (!rows.length) throw requestError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
    return rows[0];
  }

  async issueReauthenticationCode(userId) {
    return realmConnector.transaction(async executor => {
      const user = await this.identity(executor, userId, true);
      if (user.has_password) throw requestError(400, 'PASSWORD_REAUTHENTICATION', 'Confirm changes with your password.');
      await this.throttle(executor, userId, 'reauth_code', { max: 5, minutes: 60, message: 'Too many confirmation codes were requested. Try again in an hour.' });
      const code = cipherEngine.generateNumericCode(6);
      const { rows } = await executor.execute(`
        INSERT INTO account_codes (user_id, purpose, code_hash, expires_at) VALUES ($1, 'reauthenticate', $2, NOW() + INTERVAL '10 minutes')
        ON CONFLICT (user_id, purpose) DO UPDATE SET code_hash = EXCLUDED.code_hash, attempts = 0,
          expires_at = EXCLUDED.expires_at, created_at = NOW()
        RETURNING expires_at AS "expiresAt"`, [userId, secretBox.digest(`reauth:${userId}`, code)]);
      return { code, email: user.email, expiresAt: rows[0].expiresAt };
    });
  }

  async consumeReauthenticationCode(executor, userId, emailCode) {
    const { rows } = await executor.execute(
      "SELECT * FROM account_codes WHERE user_id = $1 AND purpose = 'reauthenticate' FOR UPDATE", [userId]);
    const stored = rows[0];
    if (!stored) return false;
    const code = String(emailCode).replace(/\s/g, '');
    if (new Date(stored.expires_at) > new Date() && secretBox.matches(stored.code_hash, `reauth:${userId}`, code)) {
      await executor.execute("DELETE FROM account_codes WHERE user_id = $1 AND purpose = 'reauthenticate'", [userId]);
      return true;
    }
    if (stored.attempts + 1 >= MAX_CODE_ATTEMPTS || new Date(stored.expires_at) <= new Date()) {
      await executor.execute("DELETE FROM account_codes WHERE user_id = $1 AND purpose = 'reauthenticate'", [userId]);
    } else {
      await executor.execute("UPDATE account_codes SET attempts = attempts + 1 WHERE user_id = $1 AND purpose = 'reauthenticate'", [userId]);
    }
    return false;
  }

  // Confirms the account holder with a password (or emailed code for accounts
  // without one) plus the second factor when enabled. Failed attempts are
  // committed before the error is thrown so attempt limits hold.
  async reauthenticate(userId, { password, emailCode, code } = {}) {
    return throwOutcome(await realmConnector.transaction(async executor => {
      const user = await this.identity(executor, userId, true);
      if (await this.recentCount(executor, userId, 'reauth_failure', 15) >= MAX_REAUTH_FAILURES) {
        return fail(429, 'REAUTHENTICATION_LOCKED', 'Too many incorrect confirmations. Wait 15 minutes and try again.');
      }
      const recordFailure = () => executor.execute("INSERT INTO account_rate_events (user_id, action) VALUES ($1, 'reauth_failure')", [userId]);
      if (user.has_password) {
        if (!password) return fail(400, 'PASSWORD_REQUIRED', 'Enter your current password.');
        if (!await cipherEngine.validatePassword(password, user.password_hash)) {
          await recordFailure();
          return fail(403, 'REAUTHENTICATION_FAILED', 'The password is not correct.');
        }
      } else {
        if (!emailCode) return fail(400, 'EMAIL_CODE_REQUIRED', 'Request a confirmation code by email and enter it.');
        if (!await this.consumeReauthenticationCode(executor, userId, emailCode)) {
          await recordFailure();
          return fail(403, 'REAUTHENTICATION_FAILED', 'The emailed code is not correct or has expired.');
        }
      }
      const twoFactor = await twoFactorRepository.enabled(executor, userId, true);
      if (twoFactor) {
        const failure = await twoFactorRepository.checkStepUp(executor, twoFactor, code);
        if (failure) return failure;
      }
      return { email: user.email, hasPassword: user.has_password, twoFactor: Boolean(twoFactor) };
    }));
  }

  async security(userId) {
    const user = await this.identity(realmConnector, userId);
    return {
      email: user.email, hasPassword: user.has_password, googleLinked: user.google_linked,
      twoFactor: await twoFactorRepository.status(userId),
    };
  }

  async revokeSessions(userId) {
    await realmConnector.transaction(async executor => {
      await executor.execute('UPDATE users SET sessions_revoked_at = NOW() WHERE id = $1', [userId]);
      await executor.execute('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE', [userId]);
      await executor.execute('DELETE FROM two_factor_challenges WHERE user_id = $1', [userId]);
      await executor.execute('DELETE FROM push_subscriptions WHERE user_id = $1', [userId]);
      await executor.execute('UPDATE user_preferences SET push = FALSE WHERE user_id = $1', [userId]);
      await twoFactorRepository.securityAlert(executor, userId, 'sessions_revoked', 'You were signed out of all devices');
      await publishEvent(executor, 'account.changed', { userId });
    });
  }

  async privacy(userId, executor = realmConnector) {
    const { rows } = await executor.execute('SELECT 1 FROM contact_discovery WHERE user_id = $1', [userId]);
    return { discoverableByEmail: rows.length > 0 };
  }

  async updatePrivacy(userId, { discoverableByEmail }) {
    return realmConnector.transaction(async executor => {
      const user = await this.identity(executor, userId, true);
      if (discoverableByEmail) {
        await executor.execute(`
          INSERT INTO contact_discovery (user_id, email_hash) VALUES ($1, $2)
          ON CONFLICT (user_id) DO UPDATE SET email_hash = EXCLUDED.email_hash`, [userId, contactHash(user.email)]);
      } else {
        await executor.execute('DELETE FROM contact_discovery WHERE user_id = $1', [userId]);
      }
      await publishEvent(executor, 'privacy.changed', { userId });
      return this.privacy(userId, executor);
    });
  }

  async matchContacts(userId, hashes) {
    return realmConnector.transaction(async executor => {
      await this.throttle(executor, userId, 'contact_match', { max: 20, minutes: 60, message: 'You can search your contacts 20 times per hour. Try again later.' });
      const { rows } = await executor.execute(`
        SELECT u.id AS user_id, u.email, d.email_hash, p.id AS profile_id, p.artist_name, p.first_name, p.last_name,
          p.city, p.state, p.country, p.bio, p.profile_picture_url, p.verified_at, p.created_at
        FROM contact_discovery d
        JOIN users u ON u.id = d.user_id AND u.is_active = TRUE AND u.is_deleted = FALSE
        JOIN profiles p ON p.user_id = u.id
        WHERE d.email_hash = ANY($2::text[]) AND u.id <> $1
          AND NOT EXISTS(SELECT 1 FROM blocked_users b
            WHERE (b.user_id = $1 AND b.blocked_user_id = u.id) OR (b.user_id = u.id AND b.blocked_user_id = $1))
        ORDER BY p.artist_name NULLS LAST, p.id LIMIT 500`, [userId, [...new Set(hashes.map(hash => hash.toLowerCase()))]]);
      return rows.filter(row => contactHash(row.email) === row.email_hash).map(profileSummary);
    });
  }

  async exportData(userId) {
    return realmConnector.transaction(async executor => {
      await executor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ WRITE');
      await this.throttle(executor, userId, 'data_export', { max: 3, minutes: 60, message: 'You can download your data three times per hour. Try again later.' });
      const all = async (sql, values = [userId]) => (await executor.execute(sql, values)).rows;
      const one = async (sql, values) => (await all(sql, values))[0] ?? null;
      const account = await one(`
        SELECT id AS "userId", email, auth_provider AS "authProvider", password_hash IS NOT NULL AS "hasPassword",
          google_id IS NOT NULL AS "googleLinked", email_verified AS "emailVerified", role, is_active AS "isActive",
          created_at AS "createdAt", last_login AS "lastLogin" FROM users WHERE id = $1 AND is_deleted = FALSE`);
      if (!account) throw requestError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
      const profile = await one(`
        SELECT id, artist_name AS "artistName", first_name AS "firstName", last_name AS "lastName", age, city, state, country,
          latitude, longitude, bio, profile_picture_url AS "profilePictureUrl", phone, telegram_id AS "telegramId", whatsapp,
          signal, website_url AS "websiteUrl", verified_at AS "verifiedAt", created_at AS "createdAt", updated_at AS "updatedAt"
        FROM profiles WHERE user_id = $1`);
      if (profile) {
        profile.instruments = await all(`
          SELECT i.name, ui.skill_level AS "skillLevel", ui.years_experience AS "yearsExperience"
          FROM user_instruments ui JOIN instruments i ON i.id = ui.instrument_id WHERE ui.profile_id = $1 ORDER BY i.name`, [profile.id]);
        profile.genres = (await all('SELECT g.name FROM user_genres ug JOIN genres g ON g.id = ug.genre_id WHERE ug.profile_id = $1 ORDER BY g.name', [profile.id])).map(row => row.name);
        profile.projects = await all(`
          SELECT id, name, role, years_active AS "yearsActive", description, spotify_link AS "spotifyLink", youtube_link AS "youtubeLink",
            bandcamp_link AS "bandcampLink", soundcloud_link AS "soundcloudLink", website_link AS "websiteLink", collaborators,
            created_at AS "createdAt", updated_at AS "updatedAt"
          FROM projects WHERE profile_id = $1 ORDER BY created_at, id`, [profile.id]);
      }
      const twoFactor = await twoFactorRepository.enabled(executor, userId);
      let phoneNumber = null;
      if (twoFactor?.method === 'sms') {
        try { phoneNumber = secretBox.open(twoFactor.phone_number); } catch { phoneNumber = 'unreadable after a server key change'; }
      }
      const recoveryCodes = await one('SELECT COUNT(*)::int AS count FROM two_factor_recovery_codes WHERE user_id = $1 AND used_at IS NULL');
      return {
        format: 'every.music account export', version: 1, exportedAt: new Date().toISOString(),
        notes: [
          'This file contains data stored about your account. Other people\'s private data is not included.',
          'End-to-end encrypted message contents and private-key backups are not included: the server cannot read them. Read them in the app with your recovery key.',
          'Received messages are counted per conversation; their contents belong to their senders.',
          'Images are listed by address. Download them while signed in, before deleting your account.',
        ],
        account,
        preferences: await one('SELECT messages, announcements, engagements, profile_views AS "profileViews", push, analytics, platform_analytics AS "platformAnalytics", locale FROM user_preferences WHERE user_id = $1'),
        security: {
          twoFactor: twoFactor ? { method: twoFactor.method, enabledAt: twoFactor.enabled_at, phoneNumber, unusedRecoveryCodes: recoveryCodes.count } : null,
          discoverableByEmail: (await this.privacy(userId, executor)).discoverableByEmail,
        },
        profile,
        announcements: await all(`
          SELECT a.id, a.title, a.description, a.picture_url AS "pictureUrl", a.city, a.state, a.country, a.is_remote AS "isRemote",
            a.is_cover_band AS "isCoverBand", a.is_published AS "isPublished", a.is_deleted AS "isDeleted", a.expires_at AS "expiresAt",
            a.views_count AS views, a.likes_count AS likes, a.dislikes_count AS dislikes, a.created_at AS "createdAt", a.updated_at AS "updatedAt",
            COALESCE((SELECT jsonb_agg(jsonb_build_object('type', l.link_type, 'url', l.url) ORDER BY l.created_at) FROM announcement_links l WHERE l.announcement_id = a.id), '[]') AS links,
            COALESCE((SELECT jsonb_agg(i.name ORDER BY i.name) FROM announcement_instruments ai JOIN instruments i ON i.id = ai.instrument_id WHERE ai.announcement_id = a.id), '[]') AS instruments,
            COALESCE((SELECT jsonb_agg(g.name ORDER BY g.name) FROM announcement_genres ag JOIN genres g ON g.id = ag.genre_id WHERE ag.announcement_id = a.id), '[]') AS genres
          FROM announcements a WHERE a.user_id = $1 ORDER BY a.created_at, a.id`),
        comments: await all('SELECT id, announcement_id AS "announcementId", body, created_at AS "createdAt" FROM announcement_comments WHERE user_id = $1 ORDER BY created_at, id'),
        reactions: await all('SELECT announcement_id AS "announcementId", reaction_type AS "reaction", created_at AS "createdAt" FROM announcement_reactions WHERE user_id = $1 ORDER BY created_at'),
        savedAnnouncements: await all('SELECT announcement_id AS "announcementId", created_at AS "savedAt" FROM saved_announcements WHERE user_id = $1 ORDER BY created_at'),
        following: await all(`
          SELECT f.following_id AS "userId", p.artist_name AS "artistName", f.created_at AS "followedAt"
          FROM followers f LEFT JOIN profiles p ON p.user_id = f.following_id WHERE f.follower_id = $1 ORDER BY f.created_at`),
        followerCount: (await one('SELECT COUNT(*)::int AS count FROM followers WHERE following_id = $1')).count,
        blockedUserIds: (await all('SELECT blocked_user_id FROM blocked_users WHERE user_id = $1')).map(row => row.blocked_user_id),
        conversations: await all(`
          SELECT c.id, other.id AS "counterpartUserId", p.artist_name AS "counterpartName", c.created_at AS "createdAt",
            cm.archived, NULLIF(cm.read_at, '-infinity') AS "readAt",
            (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.sender_id = $1) AS "sentMessages",
            (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.sender_id <> $1) AS "receivedMessages"
          FROM conversation_members cm JOIN conversations c ON c.id = cm.conversation_id
          JOIN LATERAL (SELECT CASE WHEN c.first_user_id = $1 THEN c.second_user_id ELSE c.first_user_id END AS id) other ON TRUE
          LEFT JOIN profiles p ON p.user_id = other.id
          WHERE cm.user_id = $1 ORDER BY c.created_at, c.id`),
        sentMessages: await all(`
          SELECT id, conversation_id AS "conversationId", created_at AS "createdAt", encryption_version = 1 AS encrypted,
            is_deleted AS "isDeleted", removed_by_moderation AS "removedByModeration",
            CASE WHEN encryption_version = 0 AND NOT is_deleted THEN body END AS body
          FROM messages WHERE sender_id = $1 ORDER BY created_at, id`),
        messagingKeys: await all(`
          SELECT id, fingerprint, is_current AS "isCurrent", signing_key AS "signingKey", encryption_key AS "encryptionKey", created_at AS "createdAt"
          FROM messaging_keys WHERE user_id = $1 ORDER BY created_at, id`),
        notifications: await all(`
          SELECT kind, title, link, params, read_at AS "readAt", created_at AS "createdAt"
          FROM notifications WHERE user_id = $1 ORDER BY created_at, id`),
        reportsFiled: await all(`
          SELECT id, reported_user_id AS "reportedUserId", message_id AS "messageId", category, details, status,
            created_at AS "createdAt", reviewed_at AS "reviewedAt"
          FROM user_reports WHERE reporter_id = $1 ORDER BY created_at, id`),
        media: (await all(`
          SELECT id, purpose, byte_size AS bytes, created_at AS "createdAt" FROM media WHERE user_id = $1 ORDER BY created_at, id`))
          .map(row => ({ ...row, url: `/realm/media/${row.id}` })),
        analytics: await all(`
          SELECT to_char(day, 'YYYY-MM-DD') AS day, kind, resource_id AS "resourceId", count FROM analytics_daily
          WHERE user_id = $1 ORDER BY day, kind, resource_id`),
        entitlements: await all(`
          SELECT plan, source, starts_at AS "startsAt", ends_at AS "endsAt", revoked_at AS "revokedAt", created_at AS "createdAt"
          FROM user_entitlements WHERE user_id = $1 ORDER BY created_at`),
        pushSubscriptions: (await all('SELECT endpoint, created_at AS "createdAt" FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at'))
          .map(row => ({ service: new URL(row.endpoint).origin, createdAt: row.createdAt })),
        verificationRequests: await all(`
          SELECT id, status, challenge_code AS "challengeCode", selfie_media_id IS NOT NULL AS "selfieStored",
            document_media_id IS NOT NULL AS "documentStored", review_note AS "reviewNote", created_at AS "createdAt", reviewed_at AS "reviewedAt"
          FROM verification_requests WHERE requested_by = $1 ORDER BY created_at, id`),
        ...await exportFeatureSections(all),
      };
    });
  }

  // Permanently deletes the account. Rows that belong only to this account
  // cascade; shared records are handled as documented in docs/usage.md.
  async deleteAccount(userId) {
    return realmConnector.transaction(async executor => {
      const user = await this.identity(executor, userId, true);
      const counterparts = (await executor.execute(`
        SELECT CASE WHEN first_user_id = $1 THEN second_user_id ELSE first_user_id END AS id
        FROM conversations WHERE $1 IN (first_user_id, second_user_id)`, [userId])).rows.map(row => row.id);
      const reacted = (await executor.execute(`
        SELECT r.announcement_id FROM announcement_reactions r JOIN announcements a ON a.id = r.announcement_id
        WHERE r.user_id = $1 AND a.user_id <> $1`, [userId])).rows.map(row => row.announcement_id);
      const reports = (await executor.execute(
        'SELECT COUNT(*)::int AS count FROM user_reports WHERE $1 IN (reporter_id, reported_user_id)', [userId])).rows[0].count;
      await executor.execute(`
        UPDATE projects SET collaborators = COALESCE((
          SELECT jsonb_agg(entry) FROM jsonb_array_elements(collaborators) entry WHERE entry->>'userId' <> $1::text), '[]'::jsonb)
        WHERE collaborators @> jsonb_build_array(jsonb_build_object('userId', $1::text))`, [userId]);
      await organizationRepository.handOverOnAccountDeletion(executor, userId);
      await eventRepository.detachOnAccountDeletion(executor, userId);
      await executor.execute('DELETE FROM users WHERE id = $1', [userId]);
      if (reacted.length) {
        await executor.execute(`
          UPDATE announcements a SET
            likes_count = (SELECT COUNT(*) FROM announcement_reactions r WHERE r.announcement_id = a.id AND r.reaction_type = 'like'),
            dislikes_count = (SELECT COUNT(*) FROM announcement_reactions r WHERE r.announcement_id = a.id AND r.reaction_type = 'dislike')
          WHERE a.id = ANY($1::uuid[])`, [reacted]);
      }
      await publishEvent(executor, 'account.changed', { userId });
      for (const id of counterparts) await publishEvent(executor, 'conversations.changed', { userId: id });
      await publishEvent(executor, 'profiles.changed', { id: userId });
      await publishEvent(executor, 'announcements.changed', { id: userId });
      if (reports) await publishAdminEvent(executor);
      return { email: user.email };
    });
  }
}

export const accountRepository = new AccountRepository();
