import { adminGuard, identityGuard } from '../guards/identity-guard.js';
import { realmConfig } from '../../config/realm.js';
import { supportRepository, normalizeSupportRequest, SUPPORT_KINDS, SUPPORT_STATUSES } from '../repositories/support-repository.js';
import { onboardingRepository } from '../repositories/onboarding-repository.js';
import { ratingRepository } from '../repositories/rating-repository.js';
import { forwardSupportRequest } from '../engines/support-mailer.js';
import { ratableVersion } from '../engines/app-version.js';
import { HelpJobs } from '../engines/help-jobs.js';
import { requestError } from '../engines/request-error.js';
import { ok, pagination, pageOf } from '../conductors/response-helpers.js';
import { text, object, params, paging } from '../validators/http-schemas.js';

const optionalText = maxLength => text(maxLength, 0);

// Anonymous requests are welcome, but a stale token must still return 401 so
// signed-in clients refresh instead of silently posting anonymously.
async function supportIdentity(request, reply) {
  if (request.headers.authorization) return identityGuard(request, reply);
  request.authenticatedUser = null;
}

// Help center, legal templates, onboarding tour, client versions and ratings.
export async function helpOrchestrator(fastify, { config = realmConfig, backgroundJobs = true } = {}) {
  if (backgroundJobs) {
    const jobs = new HelpJobs({ config, logger: fastify.log });
    fastify.addHook('onListen', async () => { jobs.start(); });
    fastify.addHook('preClose', async () => { await jobs.stop(); });
  }

  fastify.get('/legal', async (_request, reply) => {
    const { legal } = config;
    return ok(reply, {
      operator: { name: legal.operatorName, contactEmail: legal.operatorContactEmail, jurisdiction: legal.operatorJurisdiction },
      effectiveDate: legal.effectiveDate,
      termsVersion: legal.termsVersion,
      configured: Boolean(legal.operatorName && legal.operatorContactEmail && legal.operatorJurisdiction && legal.effectiveDate),
      template: true,
    });
  });

  fastify.get('/app/version', async (_request, reply) => ok(reply, {
    serverVersion: config.application.version,
    minimumClientVersion: config.clientVersions.minimum,
    latestClientVersion: config.clientVersions.latest,
    updateUrl: config.clientVersions.updateUrl,
  }));

  fastify.get('/legal/acceptance', { preHandler: identityGuard }, async (request, reply) =>
    ok(reply, await onboardingRepository.termsState(request.authenticatedUser.userId, config.legal.termsVersion)));

  fastify.post('/legal/acceptance', {
    preHandler: identityGuard,
    config: { rateLimit: { max: 20, timeWindow: '15 minutes' } },
    schema: { body: object({ termsVersion: text(32) }, ['termsVersion']) },
  }, async (request, reply) => ok(reply, await onboardingRepository.accept(
    request.authenticatedUser.userId, request.body.termsVersion, config.legal.termsVersion,
  )));

  fastify.get('/onboarding', { preHandler: identityGuard }, async (request, reply) =>
    ok(reply, await onboardingRepository.tour(request.authenticatedUser.userId)));

  fastify.put('/onboarding/tour', {
    preHandler: identityGuard,
    config: { rateLimit: { max: 30, timeWindow: '15 minutes' } },
    schema: { body: object({ status: { enum: ['completed', 'skipped'] } }, ['status']) },
  }, async (request, reply) => ok(reply, await onboardingRepository.setTour(request.authenticatedUser.userId, request.body.status)));

  fastify.post('/support', {
    preHandler: supportIdentity,
    config: { rateLimit: { max: 6, timeWindow: '1 hour' } },
    schema: { body: object({
      kind: { enum: SUPPORT_KINDS }, name: optionalText(120), email: optionalText(255), subject: text(200),
      message: text(5000), steps: optionalText(5000), link: optionalText(2048),
      diagnosticsConsent: { type: 'boolean' },
      diagnostics: object({ appVersion: optionalText(40), platform: optionalText(40), userAgent: optionalText(512), locale: optionalText(16) }),
      website: optionalText(200),
    }, ['kind', 'subject', 'message']) },
  }, async (request, reply) => {
    const userId = request.authenticatedUser?.userId ?? null;
    if (request.body.website) {
      request.log.info('Support honeypot field was filled; request discarded');
      return ok(reply, { received: true, id: null }, 201);
    }
    const normalized = normalizeSupportRequest(request.body, { signedIn: Boolean(userId) });
    const created = await supportRepository.create(userId, normalized);
    forwardSupportRequest({ config, logger: request.log, id: created.id, userId, request: normalized })
      .then(forwarded => (forwarded ? supportRepository.markForwarded(created.id) : null))
      .catch(error => request.log.error({ err: error, supportRequestId: created.id }, 'Support request forwarding failed'));
    return ok(reply, { received: true, id: userId ? created.id : null }, 201);
  });

  fastify.get('/support/me', {
    preHandler: identityGuard, schema: { querystring: object(paging) },
  }, async (request, reply) => {
    const page = pagination(request);
    return ok(reply, pageOf(await supportRepository.own(request.authenticatedUser.userId, page), 'requests', page));
  });

  fastify.get('/admin/support', {
    preHandler: adminGuard,
    schema: { querystring: object({ ...paging, status: { enum: ['', ...SUPPORT_STATUSES] }, kind: { enum: ['', ...SUPPORT_KINDS] } }) },
  }, async (request, reply) => {
    const page = pagination(request);
    const { rows, counts } = await supportRepository.inbox(request.authenticatedUser.userId, page, request.query);
    return ok(reply, { ...pageOf(rows, 'requests', page), counts });
  });

  fastify.get('/admin/support/:requestId', {
    preHandler: adminGuard, schema: { params: params('requestId') },
  }, async (request, reply) => ok(reply, await supportRepository.detail(request.authenticatedUser.userId, request.params.requestId)));

  fastify.patch('/admin/support/:requestId', {
    preHandler: adminGuard,
    schema: { params: params('requestId'), body: object({ status: { enum: SUPPORT_STATUSES }, replyNote: optionalText(5000) }, ['status']) },
  }, async (request, reply) => ok(reply, await supportRepository.update(request.authenticatedUser.userId, request.params.requestId, request.body)));

  fastify.get('/ratings/me', { preHandler: identityGuard }, async (request, reply) =>
    ok(reply, await ratingRepository.own(request.authenticatedUser.userId)));

  fastify.post('/ratings', {
    preHandler: identityGuard,
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    schema: { body: object({
      appVersion: text(20), stars: { type: 'integer', minimum: 1, maximum: 5 }, comment: optionalText(1000),
      platform: { enum: ['web', 'pwa', 'desktop', 'android', 'ios'] },
    }, ['appVersion', 'stars']) },
  }, async (request, reply) => {
    const appVersion = ratableVersion(request.body.appVersion, {
      minimum: config.clientVersions.minimum, latest: config.clientVersions.latest, server: config.application.version,
    });
    if (!appVersion) throw requestError(400, 'INVALID_APP_VERSION', 'Ratings can only be given for a released app version');
    return ok(reply, await ratingRepository.create(request.authenticatedUser.userId, { ...request.body, appVersion }), 201);
  });

  fastify.get('/admin/ratings', { preHandler: adminGuard }, async (request, reply) =>
    ok(reply, await ratingRepository.summary(request.authenticatedUser.userId)));
}
