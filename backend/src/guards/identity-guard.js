import { cipherEngine } from '../engines/cipher-engine.js';
import { identityRepository } from '../repositories/identity-repository.js';

function unauthorized(reply, code = 'INVALID_TOKEN') {
  return reply.code(401).send({
    success: false,
    error: {
      code,
      message: 'Authentication is required',
    },
  });
}

async function resolveIdentity(request) {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const payload = cipherEngine.verifyAccessToken(authHeader.slice(7));
  if (!payload) {
    return null;
  }

  const identity = await identityRepository.findById(payload.sub);
  if (!identity?.is_active) {
    return null;
  }

  return {
    userId: identity.id,
    email: identity.email,
  };
}

export async function identityGuard(request, reply) {
  try {
    const identity = await resolveIdentity(request);
    if (!identity) {
      return unauthorized(reply);
    }

    request.authenticatedUser = identity;
  } catch (error) {
    request.log.error({ err: error }, 'Authentication lookup failed');
    return unauthorized(reply, 'TOKEN_VERIFICATION_FAILED');
  }
}

export async function optionalIdentityGuard(request) {
  try {
    request.authenticatedUser = await resolveIdentity(request);
  } catch (error) {
    request.log.warn({ err: error }, 'Optional authentication lookup failed');
    request.authenticatedUser = null;
  }
}
