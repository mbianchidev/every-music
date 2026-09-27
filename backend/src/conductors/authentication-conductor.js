import { identityRepository } from '../repositories/identity-repository.js';
import { musicianRepository } from '../repositories/musician-repository.js';
import { realmConnector } from '../repositories/realm-connector.js';
import { cipherEngine } from '../engines/cipher-engine.js';
import { mailDispatcher } from '../engines/mail-dispatcher.js';
import { googleIdentityBridge } from '../engines/google-identity-bridge.js';
import { InputValidator } from '../validators/input-validator.js';

function sendValidationError(reply, details) {
  return reply.code(400).send({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input data',
      details,
    },
  });
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : email;
}

export class AuthenticationConductor {
  async issueSession(identity, executor = realmConnector) {
    const accessToken = cipherEngine.createAccessToken(identity.id, identity.email);
    const refreshTokenData = cipherEngine.createRefreshToken(identity.id);

    await identityRepository.storeRefreshToken(
      identity.id,
      refreshTokenData.tokenHash,
      refreshTokenData.expiresAt,
      executor,
    );

    return {
      accessToken,
      refreshToken: refreshTokenData.token,
      user: {
        userId: identity.id,
        email: identity.email,
        emailVerified: identity.email_verified,
      },
    };
  }

  async registerWithEmail(request, reply) {
    const body = request.body ?? {};
    const email = normalizeEmail(body.email);
    const { password } = body;
    const validations = InputValidator.gatherValidationErrors(
      InputValidator.validateEmail(email),
      InputValidator.validatePassword(password),
    );

    if (validations) {
      return sendValidationError(reply, validations);
    }

    try {
      const existingIdentity = await identityRepository.findByEmail(email);
      if (existingIdentity) {
        return reply.code(409).send({
          success: false,
          error: {
            code: 'EMAIL_TAKEN',
            message: 'An account with this email already exists',
          },
        });
      }

      const passwordHash = await cipherEngine.hashPassword(password);
      const verificationToken = cipherEngine.generateToken(48);
      const verificationTokenHash = cipherEngine.hashToken(verificationToken);
      const newIdentity = await realmConnector.transaction(async (executor) => {
        const identity = await identityRepository.createEmailIdentity(
          email,
          passwordHash,
          verificationTokenHash,
          executor,
        );
        await musicianRepository.createProfile(identity.id, {}, executor);
        return identity;
      });
      const verificationEmailSent = await mailDispatcher.dispatchVerification(
        email,
        verificationToken,
      );

      return reply.code(201).send({
        success: true,
        data: {
          userId: newIdentity.id,
          email: newIdentity.email,
          emailVerified: newIdentity.email_verified,
          verificationEmailSent,
          message: verificationEmailSent
            ? 'Registration successful. Check your email to verify your account.'
            : 'Registration successful, but verification email delivery is unavailable. Request a new verification email before signing in.',
        },
      });
    } catch (error) {
      request.log.error({ err: error }, 'Registration failed');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'REGISTRATION_FAILED',
          message: 'Failed to create account',
        },
      });
    }
  }

  async resendVerification(request, reply) {
    const email = normalizeEmail(request.body?.email);
    const validation = InputValidator.validateEmail(email);

    if (!validation.valid) {
      return sendValidationError(reply, [validation.message]);
    }

    try {
      const verificationToken = cipherEngine.generateToken(48);
      const identity = await identityRepository.rotateVerificationToken(
        email,
        cipherEngine.hashToken(verificationToken),
      );

      if (identity) {
        await mailDispatcher.dispatchVerification(identity.email, verificationToken);
      }

      return reply.code(200).send({
        success: true,
        data: {
          message: 'If the account needs verification, a new email has been sent.',
        },
      });
    } catch (error) {
      request.log.error({ err: error }, 'Verification email resend failed');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'VERIFICATION_RESEND_FAILED',
          message: 'Failed to request a verification email',
        },
      });
    }
  }

  async loginWithEmail(request, reply) {
    const body = request.body ?? {};
    const email = normalizeEmail(body.email);
    const { password } = body;
    const validations = InputValidator.gatherValidationErrors(
      InputValidator.validateEmail(email),
      InputValidator.validateRequired(password, 'Password'),
    );

    if (validations) {
      return sendValidationError(reply, validations);
    }

    try {
      const identity = await identityRepository.findByEmail(email);
      const passwordMatches = identity?.auth_provider === 'email'
        && await cipherEngine.validatePassword(password, identity.password_hash);

      if (!passwordMatches) {
        return reply.code(401).send({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        });
      }

      if (identity.is_active === false) {
        return reply.code(403).send({
          success: false,
          error: {
            code: 'ACCOUNT_DISABLED',
            message: 'Your account has been disabled',
          },
        });
      }

      if (!identity.email_verified) {
        return reply.code(403).send({
          success: false,
          error: {
            code: 'EMAIL_NOT_VERIFIED',
            message: 'Verify your email before signing in',
          },
        });
      }

      const session = await realmConnector.transaction(async (executor) => {
        await identityRepository.updateLastLogin(identity.id, executor);
        return this.issueSession(identity, executor);
      });

      return reply.code(200).send({ success: true, data: session });
    } catch (error) {
      request.log.error({ err: error }, 'Login failed');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'LOGIN_FAILED',
          message: 'Failed to authenticate',
        },
      });
    }
  }

  async loginWithGoogle(request, reply) {
    const idToken = request.body?.idToken;

    if (!idToken) {
      return sendValidationError(reply, ['Google ID token is required']);
    }

    try {
      const googleUser = await googleIdentityBridge.verifyCredential(idToken);
      if (!googleUser.emailVerified) {
        return reply.code(403).send({
          success: false,
          error: {
            code: 'GOOGLE_EMAIL_NOT_VERIFIED',
            message: 'Google account email is not verified',
          },
        });
      }

      let identity = await identityRepository.findByGoogleId(googleUser.googleId);

      if (!identity) {
        const emailIdentity = await identityRepository.findByEmail(googleUser.email);
        if (emailIdentity) {
          return reply.code(409).send({
            success: false,
            error: {
              code: 'EMAIL_EXISTS',
              message: 'An account with this email already exists. Sign in with email and password.',
            },
          });
        }

        identity = await realmConnector.transaction(async (executor) => {
          const createdIdentity = await identityRepository.createGoogleIdentity(
            googleUser.email,
            googleUser.googleId,
            executor,
          );
          await musicianRepository.createProfile(createdIdentity.id, {
            firstName: googleUser.givenName,
            lastName: googleUser.familyName,
            profilePictureUrl: googleUser.picture,
          }, executor);
          return createdIdentity;
        });
      }

      if (identity.is_active === false) {
        return reply.code(403).send({
          success: false,
          error: {
            code: 'ACCOUNT_DISABLED',
            message: 'Your account has been disabled',
          },
        });
      }

      const session = await realmConnector.transaction(async (executor) => {
        await identityRepository.updateLastLogin(identity.id, executor);
        return this.issueSession(identity, executor);
      });

      return reply.code(200).send({ success: true, data: session });
    } catch (error) {
      request.log.error({ err: error }, 'Google login failed');
      return reply.code(502).send({
        success: false,
        error: {
          code: 'GOOGLE_LOGIN_FAILED',
          message: 'Failed to authenticate with Google',
        },
      });
    }
  }

  async verifyEmail(request, reply) {
    const token = request.query?.token;
    if (!token) {
      return sendValidationError(reply, ['Verification token is required']);
    }

    try {
      const identity = await identityRepository.verifyEmailWithTokenHash(
        cipherEngine.hashToken(token),
      );

      if (!identity) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Verification token is invalid or expired',
          },
        });
      }

      return reply.code(200).send({
        success: true,
        data: {
          message: 'Email verified successfully',
          email: identity.email,
        },
      });
    } catch (error) {
      request.log.error({ err: error }, 'Email verification failed');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'VERIFICATION_FAILED',
          message: 'Failed to verify email',
        },
      });
    }
  }

  async refreshAccessToken(request, reply) {
    const refreshToken = request.body?.refreshToken;
    if (!refreshToken) {
      return sendValidationError(reply, ['Refresh token is required']);
    }

    try {
      const payload = cipherEngine.verifyRefreshToken(refreshToken);
      if (!payload) {
        return reply.code(401).send({
          success: false,
          error: {
            code: 'INVALID_REFRESH_TOKEN',
            message: 'Refresh token is invalid or expired',
          },
        });
      }

      const outcome = await realmConnector.transaction(async (executor) => {
        const tokenData = await identityRepository.findRefreshToken(
          cipherEngine.hashToken(refreshToken),
          executor,
          { forUpdate: true },
        );

        if (!tokenData
          || tokenData.user_id !== payload.sub
          || new Date(tokenData.expires_at) <= new Date()) {
          return null;
        }

        const identity = await identityRepository.findById(tokenData.user_id, executor);
        if (!identity?.is_active) {
          return null;
        }

        if (tokenData.revoked) {
          const rotatedAt = tokenData.rotated_at
            ? new Date(tokenData.rotated_at)
            : null;
          const withinGrace = rotatedAt
            && Date.now() - rotatedAt.getTime()
              <= cipherEngine.config.cipher.rotationGraceSeconds * 1000;

          if (!withinGrace
            || !tokenData.replacement_jti
            || !tokenData.replacement_expires_at
            || tokenData.replacement_revoked) {
            await identityRepository.revokeAllRefreshTokens(identity.id, executor);
            return null;
          }

          const replacement = cipherEngine.createRefreshToken(identity.id, {
            issuedAt: Math.floor(rotatedAt.getTime() / 1000),
            expiresAt: Math.floor(new Date(tokenData.replacement_expires_at).getTime() / 1000),
            jti: tokenData.replacement_jti,
          });

          if (replacement.tokenHash !== tokenData.replacement_token_hash) {
            await identityRepository.revokeAllRefreshTokens(identity.id, executor);
            return null;
          }

          return {
            accessToken: cipherEngine.createAccessToken(identity.id, identity.email),
            refreshToken: replacement.token,
          };
        }

        const replacement = cipherEngine.createRefreshToken(identity.id);
        await identityRepository.rotateRefreshToken(
          tokenData.id,
          identity.id,
          {
            ...replacement,
            rotatedAt: new Date(replacement.issuedAt * 1000),
          },
          executor,
        );

        return {
          accessToken: cipherEngine.createAccessToken(identity.id, identity.email),
          refreshToken: replacement.token,
        };
      });

      if (!outcome) {
        return reply.code(401).send({
          success: false,
          error: {
            code: 'INVALID_REFRESH_TOKEN',
            message: 'Refresh token is invalid or expired',
          },
        });
      }

      return reply.code(200).send({
        success: true,
        data: outcome,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Token refresh failed');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'REFRESH_FAILED',
          message: 'Failed to refresh token',
        },
      });
    }
  }

  async initiatePasswordReset(request, reply) {
    const email = normalizeEmail(request.body?.email);
    const validation = InputValidator.validateEmail(email);

    if (!validation.valid) {
      return sendValidationError(reply, [validation.message]);
    }

    try {
      const resetToken = cipherEngine.generateToken(48);
      const identity = await identityRepository.createPasswordResetToken(
        email,
        cipherEngine.hashToken(resetToken),
      );

      if (identity) {
        await mailDispatcher.dispatchPasswordReset(identity.email, resetToken);
      }

      return reply.code(200).send({
        success: true,
        data: {
          message: 'If the email exists, a password reset link has been sent.',
        },
      });
    } catch (error) {
      request.log.error({ err: error }, 'Password reset initiation failed');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'RESET_FAILED',
          message: 'Failed to initiate password reset',
        },
      });
    }
  }

  async completePasswordReset(request, reply) {
    const body = request.body ?? {};
    const validations = InputValidator.gatherValidationErrors(
      InputValidator.validateRequired(body.token, 'Token'),
      InputValidator.validatePassword(body.newPassword),
    );

    if (validations) {
      return sendValidationError(reply, validations);
    }

    try {
      const passwordHash = await cipherEngine.hashPassword(body.newPassword);
      const identity = await realmConnector.transaction(async (executor) => {
        const updatedIdentity = await identityRepository.resetPasswordWithTokenHash(
          cipherEngine.hashToken(body.token),
          passwordHash,
          executor,
        );

        if (updatedIdentity) {
          await identityRepository.revokeAllRefreshTokens(updatedIdentity.id, executor);
        }

        return updatedIdentity;
      });

      if (!identity) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Reset token is invalid or expired',
          },
        });
      }

      return reply.code(200).send({
        success: true,
        data: { message: 'Password reset successfully' },
      });
    } catch (error) {
      request.log.error({ err: error }, 'Password reset completion failed');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'RESET_FAILED',
          message: 'Failed to reset password',
        },
      });
    }
  }

  async logout(request, reply) {
    const refreshToken = request.body?.refreshToken;

    if (refreshToken) {
      try {
        await identityRepository.revokeRefreshToken(cipherEngine.hashToken(refreshToken));
      } catch (error) {
        request.log.error({ err: error }, 'Failed to revoke refresh token');
        return reply.code(500).send({
          success: false,
          error: {
            code: 'LOGOUT_FAILED',
            message: 'Failed to end the session',
          },
        });
      }
    }

    return reply.code(200).send({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  }
}

export const authenticationConductor = new AuthenticationConductor();
