import { realmConnector } from './realm-connector.js';
import { requestError } from '../engines/request-error.js';

export const TOUR_STATUSES = ['pending', 'completed', 'skipped'];

class OnboardingRepository {
  constructor() {
    // Test fixtures seeded directly through SQL have no terms record; the
    // loopback browser server sets this so they are not interrupted.
    this.treatUntrackedAccountsAsAccepted = false;
  }

  async termsState(userId, termsVersion, executor = realmConnector) {
    const { rows } = await executor.execute(`
      SELECT terms_version, accepted_at FROM terms_acceptances WHERE user_id = $1
      ORDER BY (terms_version = $2) DESC, accepted_at DESC LIMIT 1`, [userId, termsVersion]);
    const latest = rows[0];
    const exempt = !latest && this.treatUntrackedAccountsAsAccepted;
    return {
      termsVersion,
      acceptedVersion: latest?.terms_version ?? null,
      acceptedAt: latest?.accepted_at ?? null,
      required: latest?.terms_version !== termsVersion && !exempt,
    };
  }

  // The first acceptance of any version also queues the welcome tour, so new
  // email and Google accounts see it once after they accept the terms.
  async acceptTerms(executor, userId, termsVersion, source) {
    const previous = await executor.execute('SELECT 1 FROM terms_acceptances WHERE user_id = $1 LIMIT 1', [userId]);
    await executor.execute(`
      INSERT INTO terms_acceptances (user_id, terms_version, source) VALUES ($1, $2, $3)
      ON CONFLICT (user_id, terms_version) DO NOTHING`, [userId, termsVersion, source]);
    if (!previous.rowCount) {
      await executor.execute('INSERT INTO user_onboarding (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    }
  }

  async accept(userId, termsVersion, currentVersion) {
    if (termsVersion !== currentVersion) {
      throw requestError(409, 'TERMS_VERSION_CHANGED', 'The Terms of Use changed while this page was open. Review the current version and accept again.');
    }
    return realmConnector.transaction(async executor => {
      await this.acceptTerms(executor, userId, currentVersion, 'prompt');
      return this.termsState(userId, currentVersion, executor);
    });
  }

  async tour(userId, executor = realmConnector) {
    const { rows } = await executor.execute(`
      SELECT tour_status AS status, tour_updated_at AS "updatedAt" FROM user_onboarding WHERE user_id = $1`, [userId]);
    return { tour: rows[0] ?? { status: null, updatedAt: null } };
  }

  async setTour(userId, status) {
    if (!TOUR_STATUSES.includes(status)) throw requestError(400, 'INVALID_TOUR_STATUS', 'Unsupported tour status');
    const { rows } = await realmConnector.execute(`
      INSERT INTO user_onboarding (user_id, tour_status) VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET tour_status = EXCLUDED.tour_status, tour_updated_at = NOW()
      RETURNING tour_status AS status, tour_updated_at AS "updatedAt"`, [userId, status]);
    return { tour: rows[0] };
  }
}

export const onboardingRepository = new OnboardingRepository();
