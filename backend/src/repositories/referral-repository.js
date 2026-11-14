import { randomInt } from 'node:crypto';
import { realmConnector } from './realm-connector.js';
import { pointsRepository } from './points-repository.js';
import { notificationRepository } from './notification-repository.js';
import { requestError } from '../engines/request-error.js';
import { realmConfig } from '../../config/realm.js';

// Unambiguous characters only (no 0/O, 1/I/L), so codes survive being read aloud.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const REFERRAL_CODE = /^[A-Z2-9]{8,16}$/;

export function generateReferralCode(length = 10) {
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

export const normalizeReferralCode = value => (typeof value === 'string' ? value.trim().toUpperCase() : '');

// Invite codes, referrals and their rewards. Both sides are rewarded only
// after the invited account verifies its email; the inviter's rewards are
// capped per calendar month, after which referrals are recorded as capped.
class ReferralRepository {
  constructor(points) {
    this.points = points;
  }

  async codeFor(executor, userId) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { rows } = await executor.execute(`
        WITH created AS (
          INSERT INTO referral_codes (user_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING code
        ) SELECT code FROM created UNION ALL SELECT code FROM referral_codes WHERE user_id = $1`, [userId, generateReferralCode()]);
      if (rows.length) return rows[0].code;
    }
    throw new Error('Could not allocate a unique invite code');
  }

  async inviterFor(executor, code) {
    const normalized = normalizeReferralCode(code);
    if (!REFERRAL_CODE.test(normalized)) return null;
    const { rows } = await executor.execute(`
      SELECT c.user_id FROM referral_codes c JOIN users u ON u.id = c.user_id
      WHERE c.code = $1 AND u.is_active = TRUE AND u.is_deleted = FALSE`, [normalized]);
    return rows[0]?.user_id ?? null;
  }

  // Called inside the registration transaction. Unknown codes are ignored so
  // a stale invite link never blocks sign-up; returns whether it was recorded.
  async recordSignup(executor, inviteeId, code) {
    if (!code) return false;
    const inviterId = await this.inviterFor(executor, code);
    if (!inviterId || inviterId === inviteeId) return false;
    const { rowCount } = await executor.execute(`
      INSERT INTO referrals (invitee_id, inviter_id, source) VALUES ($1, $2, 'registration') ON CONFLICT DO NOTHING`,
    [inviteeId, inviterId]);
    return rowCount === 1;
  }

  async claim(inviteeId, code, points = this.points) {
    return realmConnector.transaction(async (executor) => {
      const { rows: [invitee] } = await executor.execute(`
        SELECT created_at, email_verified FROM users WHERE id = $1 FOR UPDATE`, [inviteeId]);
      const age = (Date.now() - new Date(invitee.created_at).getTime()) / 86400000;
      if (age > points.referralClaimDays) {
        throw requestError(409, 'REFERRAL_CLAIM_CLOSED', `Invite codes can only be used within ${points.referralClaimDays} days of creating an account`);
      }
      const existing = await executor.execute('SELECT 1 FROM referrals WHERE invitee_id = $1', [inviteeId]);
      if (existing.rowCount) throw requestError(409, 'REFERRAL_EXISTS', 'Your account already used an invite code');
      const inviterId = await this.inviterFor(executor, code);
      if (!inviterId) throw requestError(404, 'REFERRAL_CODE_NOT_FOUND', 'This invite code does not exist. Check it and try again.');
      if (inviterId === inviteeId) throw requestError(400, 'REFERRAL_SELF', 'You cannot use your own invite code');
      const reverse = await executor.execute('SELECT 1 FROM referrals WHERE invitee_id = $1 AND inviter_id = $2', [inviterId, inviteeId]);
      if (reverse.rowCount) throw requestError(400, 'REFERRAL_RECIPROCAL', 'You invited this person, so you cannot use their code');
      await executor.execute(`INSERT INTO referrals (invitee_id, inviter_id, source) VALUES ($1, $2, 'claim')`, [inviteeId, inviterId]);
      return invitee.email_verified ? this.reward(executor, inviteeId, points) : { status: 'pending' };
    });
  }

  // Rewards one pending referral whose invitee has verified their email.
  async reward(executor, inviteeId, points = this.points) {
    const { rows: [referral] } = await executor.execute(`
      SELECT r.inviter_id FROM referrals r JOIN users u ON u.id = r.invitee_id
      WHERE r.invitee_id = $1 AND r.status = 'pending' AND u.email_verified = TRUE AND u.is_active AND NOT u.is_deleted
      FOR UPDATE OF r`, [inviteeId]);
    if (!referral) return { status: 'not_pending' };
    const inviterId = referral.inviter_id;
    await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [inviterId]);
    const { rows: [month] } = await executor.execute(`
      SELECT COUNT(*)::int AS count FROM referrals WHERE inviter_id = $1 AND status = 'rewarded'
        AND rewarded_at >= date_trunc('month', NOW())`, [inviterId]);
    const capped = month.count >= points.referralMonthlyCap;
    const status = capped ? 'capped' : 'rewarded';
    await executor.execute(`UPDATE referrals SET status = $2, rewarded_at = NOW() WHERE invitee_id = $1`, [inviteeId, status]);
    const grant = async (userId, amount, reason) => {
      if (!amount) return;
      const result = await pointsRepository.credit(executor, { userId, delta: amount, reason, reference: `${reason}:${inviteeId}` });
      if (!result.duplicate) {
        await notificationRepository.create(executor, {
          userId, kind: 'points_earned', title: `You earned ${amount} points`, link: '#wallet',
          key: `points:${reason}:${inviteeId}`, params: { points: amount, reason },
        });
      }
    };
    await grant(inviteeId, points.referralInvitee, 'referral_invitee');
    if (!capped) await grant(inviterId, points.referralInviter, 'referral_inviter');
    return { status };
  }

  async rewardVerified(inviteeId, points = this.points) {
    return realmConnector.transaction(executor => this.reward(executor, inviteeId, points));
  }

  // Safety net for the email verification hook: rewards pending referrals of
  // verified accounts. Each referral commits on its own.
  async rewardPending(points = this.points, limit = 100) {
    const { rows } = await realmConnector.execute(`
      SELECT r.invitee_id FROM referrals r JOIN users u ON u.id = r.invitee_id
      WHERE r.status = 'pending' AND u.email_verified = TRUE ORDER BY r.created_at LIMIT $1`, [limit]);
    let rewarded = 0;
    for (const row of rows) {
      const result = await this.rewardVerified(row.invitee_id, points);
      if (result.status !== 'not_pending') rewarded += 1;
    }
    return rewarded;
  }

  async overview(userId, origin, points = this.points) {
    return realmConnector.transaction(async (executor) => {
      const code = await this.codeFor(executor, userId);
      const { rows: counts } = await executor.execute(`
        SELECT status, COUNT(*)::int AS count FROM referrals WHERE inviter_id = $1 GROUP BY status`, [userId]);
      const { rows: recent } = await executor.execute(`
        SELECT status, created_at, rewarded_at FROM referrals WHERE inviter_id = $1 ORDER BY created_at DESC LIMIT 20`, [userId]);
      const { rows: [month] } = await executor.execute(`
        SELECT COUNT(*)::int AS count FROM referrals WHERE inviter_id = $1 AND status = 'rewarded'
          AND rewarded_at >= date_trunc('month', NOW())`, [userId]);
      const { rows: [self] } = await executor.execute(`
        SELECT u.created_at, r.status, r.inviter_id IS NOT NULL AS referred FROM users u
        LEFT JOIN referrals r ON r.invitee_id = u.id WHERE u.id = $1`, [userId]);
      const claimOpen = !self.referred
        && (Date.now() - new Date(self.created_at).getTime()) / 86400000 <= points.referralClaimDays;
      const count = status => counts.find(row => row.status === status)?.count ?? 0;
      return {
        code,
        link: `${origin.replace(/\/$/, '')}/#register?invite=${code}`,
        counts: { pending: count('pending'), rewarded: count('rewarded'), capped: count('capped') },
        recent: recent.map(row => ({ status: row.status, joinedAt: row.created_at, rewardedAt: row.rewarded_at })),
        rewards: {
          inviter: points.referralInviter, invitee: points.referralInvitee,
          monthlyCap: points.referralMonthlyCap, rewardedThisMonth: month.count,
        },
        claim: { open: claimOpen, used: Boolean(self.referred), status: self.status ?? null, days: points.referralClaimDays },
      };
    });
  }

  async stats(executor) {
    const { rows } = await executor.execute(`
      SELECT COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'rewarded' AND rewarded_at > NOW() - INTERVAL '30 days')::int AS rewarded,
        COUNT(*) FILTER (WHERE status = 'capped' AND rewarded_at > NOW() - INTERVAL '30 days')::int AS capped
      FROM referrals`);
    return rows[0];
  }
}

export const referralRepository = new ReferralRepository(realmConfig.monetization.points);
