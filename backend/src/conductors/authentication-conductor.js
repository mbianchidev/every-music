import { identityRepository } from '../repositories/identity-repository.js';
import { musicianRepository } from '../repositories/musician-repository.js';
import { cipherEngine } from '../engines/cipher-engine.js';
import { mailDispatcher } from '../engines/mail-dispatcher.js';
import { googleIdentityBridge } from '../engines/google-identity-bridge.js';
import { InputValidator } from '../validators/input-validator.js';

export class AuthenticationConductor {
  async registerWithEmail(request, reply) {
    const { email, password } = request.body;

    const validations = InputValidator.gatherValidationErrors(
      InputValidator.validateEmail(email),
      InputValidator.validatePassword(password)
    );

    if (validations) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: validations,
        },
      });
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

      const newIdentity = await identityRepository.createEmailIdentity(
        email,
        passwordHash,
        verificationToken
      );

      await mailDispatcher.dispatchVerification(email, verificationToken);

      await musicianRepository.createProfile(newIdentity.id, {});

      return reply.code(201).send({
        success: true,
        data: {
          userId: newIdentity.id,
          email: newIdentity.email,
          emailVerified: newIdentity.email_verified,
          message: 'Registration successful. Please check your email to verify your account.',
        },
      });
    } catch (err) {
      request.log.error('Registration failed:', err);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'REGISTRATION_FAILED',
          message: 'Failed to create account',
        },
      });
    }
  }

  async loginWithEmail(request, reply) {
    const { email, password } = request.body;

    const validations = InputValidator.gatherValidationErrors(
      InputValidator.validateEmail(email),
      InputValidator.validateRequired(password, 'Password')
    );

    if (validations) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: validations,
        },
      });
    }

    try {
      const identity = await identityRepository.findByEmail(email);
      
      if (!identity || identity.auth_provider !== 'email') {
        return reply.code(401).send({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        });
      }

      const isPasswordValid = await cipherEngine.validatePassword(
        password,
        identity.password_hash
      );

      if (!isPasswordValid) {
        return reply.code(401).send({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        });
      }

      if (!identity.is_active) {
        return reply.code(403).send({
          success: false,
          error: {
            code: 'ACCOUNT_DISABLED',
            message: 'Your account has been disabled',
          },
        });
      }

      await identityRepository.updateLastLogin(identity.id);

      const accessToken = cipherEngine.createAccessToken(identity.id, identity.email);
      const refreshTokenData = cipherEngine.createRefreshToken(identity.id);

      await identityRepository.storeRefreshToken(
        identity.id,
        refreshTokenData.token,
        refreshTokenData.expiresAt
      );

      return reply.code(200).send({
        success: true,
        data: {
          accessToken,
          refreshToken: refreshTokenData.token,
          user: {
            userId: identity.id,
            email: identity.email,
            emailVerified: identity.email_verified,
          },
        },
      });
    } catch (err) {
      request.log.error('Login failed:', err);
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
    const { idToken } = request.body;

    if (!idToken) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Google ID token is required',
        },
      });
    }

    try {
      const googleUser = await googleIdentityBridge.verifyCredential(idToken);

      let identity = await identityRepository.findByGoogleId(googleUser.googleId);

      if (!identity) {
        identity = await identityRepository.findByEmail(googleUser.email);
        
        if (identity && identity.auth_provider === 'email') {
          return reply.code(409).send({
            success: false,
            error: {
              code: 'EMAIL_EXISTS',
              message: 'An account with this email already exists. Please login with email and password.',
            },
          });
        }

        if (!identity) {
          identity = await identityRepository.createGoogleIdentity(
            googleUser.email,
            googleUser.googleId
          );

          await musicianRepository.createProfile(identity.id, {
            firstName: googleUser.givenName,
            lastName: googleUser.familyName,
            profilePictureUrl: googleUser.picture,
          });
        }
      }

      await identityRepository.updateLastLogin(identity.id);

      const accessToken = cipherEngine.createAccessToken(identity.id, identity.email);
      const refreshTokenData = cipherEngine.createRefreshToken(identity.id);

      await identityRepository.storeRefreshToken(
        identity.id,
        refreshTokenData.token,
        refreshTokenData.expiresAt
      );

      return reply.code(200).send({
        success: true,
        data: {
          accessToken,
          refreshToken: refreshTokenData.token,
          user: {
            userId: identity.id,
            email: identity.email,
            emailVerified: identity.email_verified,
          },
        },
      });
    } catch (err) {
      request.log.error('Google login failed:', err);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'GOOGLE_LOGIN_FAILED',
          message: err.message || 'Failed to authenticate with Google',
        },
      });
    }
  }

  async verifyEmail(request, reply) {
    const { token } = request.query;

    if (!token) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Verification token is required',
        },
      });
    }

    try {
      const verifiedIdentity = await identityRepository.verifyEmailWithToken(token);

      if (!verifiedIdentity) {
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
          email: verifiedIdentity.email,
        },
      });
    } catch (err) {
      request.log.error('Email verification failed:', err);
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
    const { refreshToken } = request.body;

    if (!refreshToken) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Refresh token is required',
        },
      });
    }

    try {
      const tokenData = await identityRepository.findRefreshToken(refreshToken);

      if (!tokenData || tokenData.revoked || new Date(tokenData.expires_at) < new Date()) {
        return reply.code(401).send({
          success: false,
          error: {
            code: 'INVALID_REFRESH_TOKEN',
            message: 'Refresh token is invalid or expired',
          },
        });
      }

      const identity = await identityRepository.findById(tokenData.user_id);

      if (!identity || !identity.is_active) {
        return reply.code(401).send({
          success: false,
          error: {
            code: 'INVALID_USER',
            message: 'User not found or inactive',
          },
        });
      }

      await identityRepository.revokeRefreshToken(refreshToken);

      const newAccessToken = cipherEngine.createAccessToken(identity.id, identity.email);
      const newRefreshTokenData = cipherEngine.createRefreshToken(identity.id);

      await identityRepository.storeRefreshToken(
        identity.id,
        newRefreshTokenData.token,
        newRefreshTokenData.expiresAt
      );

      return reply.code(200).send({
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshTokenData.token,
        },
      });
    } catch (err) {
      request.log.error('Token refresh failed:', err);
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
    const { email } = request.body;

    const validation = InputValidator.validateEmail(email);
    if (!validation.valid) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.message,
        },
      });
    }

    try {
      const resetToken = cipherEngine.generateToken(48);
      const result = await identityRepository.createPasswordResetToken(email, resetToken);

      if (result) {
        await mailDispatcher.dispatchPasswordReset(email, resetToken);
      }

      return reply.code(200).send({
        success: true,
        data: {
          message: 'If the email exists, a password reset link has been sent.',
        },
      });
    } catch (err) {
      request.log.error('Password reset initiation failed:', err);
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
    const { token, newPassword } = request.body;

    const validations = InputValidator.gatherValidationErrors(
      InputValidator.validateRequired(token, 'Token'),
      InputValidator.validatePassword(newPassword)
    );

    if (validations) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: validations,
        },
      });
    }

    try {
      const passwordHash = await cipherEngine.hashPassword(newPassword);
      const result = await identityRepository.resetPasswordWithToken(token, passwordHash);

      if (!result) {
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
        data: {
          message: 'Password reset successfully',
        },
      });
    } catch (err) {
      request.log.error('Password reset completion failed:', err);
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
    const { refreshToken } = request.body;

    if (refreshToken) {
      try {
        await identityRepository.revokeRefreshToken(refreshToken);
      } catch (err) {
        request.log.error('Failed to revoke refresh token:', err);
      }
    }

    return reply.code(200).send({
      success: true,
      data: {
        message: 'Logged out successfully',
      },
    });
  }
}

export const authenticationConductor = new AuthenticationConductor();
