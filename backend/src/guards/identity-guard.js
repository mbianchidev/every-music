export async function identityGuard(request, reply) {
  const authHeader = request.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({
      success: false,
      error: {
        code: 'MISSING_CREDENTIALS',
        message: 'Authentication required - missing or invalid token',
      },
    });
  }

  const token = authHeader.substring(7);
  
  try {
    const { cipherEngine } = await import('../engines/cipher-engine.js');
    const payload = cipherEngine.verifyPayloadToken(token);
    
    if (!payload || payload.typ !== 'access') {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token is invalid or expired',
        },
      });
    }

    request.authenticatedUser = {
      userId: payload.sub,
      email: payload.email,
    };
  } catch (err) {
    return reply.code(401).send({
      success: false,
      error: {
        code: 'TOKEN_VERIFICATION_FAILED',
        message: 'Failed to verify authentication token',
      },
    });
  }
}

export async function optionalIdentityGuard(request, reply) {
  const authHeader = request.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    request.authenticatedUser = null;
    return;
  }

  const token = authHeader.substring(7);
  
  try {
    const { cipherEngine } = await import('../engines/cipher-engine.js');
    const payload = cipherEngine.verifyPayloadToken(token);
    
    if (payload && payload.typ === 'access') {
      request.authenticatedUser = {
        userId: payload.sub,
        email: payload.email,
      };
    } else {
      request.authenticatedUser = null;
    }
  } catch {
    request.authenticatedUser = null;
  }
}
