const express = require('express');
const router = express.Router();
const { hashPassword, verifyPassword } = require('../services/auth/password');
const {
  createUser,
  getUserByEmail,
  getUserByUsername,
  getUserByGoogleId,
  updateUser,
  softDeleteUser,
  emailExists,
  usernameExists,
} = require('../services/auth/user-storage');
const {
  sendVerificationCode,
  verifyCode,
  storeEmailVerificationCode,
  verifyEmailCode,
} = require('../services/auth/verification');
const {
  storeResetToken,
  validateResetToken,
  invalidateResetToken,
} = require('../services/auth/password-reset');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  authenticate,
  JWT_REFRESH_SECRET,
} = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');
const {
  signupRequestSchema,
  loginRequestSchema,
  verifyRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
  googleLoginRequestSchema,
  updateProfileRequestSchema,
  changePasswordRequestSchema,
  verifyEmailRequestSchema,
} = require('../config/validation');
const { handleAsyncErrors } = require('../utils/error-utils');
const {
  ValidationError,
  UnauthorizedError,
  ConflictError,
  NotFoundError,
  InternalServerError,
} = require('../utils/errors');
const { logger } = require('../services/logger');
const { getRateLimitConfig } = require('../config/rate-limit');
const { createRateLimiter } = require('../middleware/rate-limit');

// Create rate limiter for auth endpoints
const authRateLimiter = createRateLimiter(
  {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per window
  },
  'auth'
);

/**
 * POST /api/auth/signup
 * Register new user
 */
router.post(
  '/signup',
  authRateLimiter,
  validateRequest(signupRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { username, email, password, phone, verificationMethod, deviceId, googleId } =
      req.validatedBody;

    // Check if email or phone is provided
    if (!email && !phone) {
      throw new ValidationError('Email or phone number required');
    }

    // Check if username exists
    if (await usernameExists(username)) {
      throw new ConflictError('Username already taken');
    }

    // Check if email exists (if provided)
    if (email && (await emailExists(email))) {
      throw new ConflictError('Email already registered');
    }

    // Hash password (if not Google OAuth)
    let passwordHash = null;
    if (!googleId && password) {
      passwordHash = await hashPassword(password);
    }

    // Determine verification method
    const method = verificationMethod || (phone ? 'sms' : null);
    const needsVerification = !googleId && (phone || email);

    // Create user
    const user = await createUser({
      username,
      email: email || null,
      passwordHash,
      phone: phone || null,
      googleId: googleId || null,
      isVerified: !needsVerification, // Google OAuth users are auto-verified
      verificationMethod: method,
      deviceId,
    });

    // Send verification code if needed
    if (needsVerification && phone && method) {
      const result = await sendVerificationCode(user.id, phone, method);
      if (!result.success) {
        logger.warn('Verification code send failed', { userId: user.id });
      }
    }

    // Generate tokens if verified (Google OAuth)
    let tokens = null;
    if (user.isVerified) {
      const payload = {
        userId: user.id,
        email: user.email,
        username: user.username,
      };
      tokens = {
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
      };
    }

    return res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          isVerified: user.isVerified,
        },
        ...(tokens || {}),
        needsVerification: !user.isVerified,
      },
    });
  })
);

/**
 * POST /api/auth/verify
 * Verify user with OTP code
 */
router.post(
  '/verify',
  authRateLimiter,
  validateRequest(verifyRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { userId, code, method } = req.validatedBody;

    // Verify code
    const result = await verifyCode(userId, method, code);
    if (!result.valid) {
      throw new ValidationError(result.error || 'Invalid verification code');
    }

    // Update user as verified
    const user = await updateUser(userId, {
      isVerified: true,
      status: 'active',
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Generate tokens
    const payload = {
      userId: user.id,
      email: user.email,
      username: user.username,
    };

    return res.json({
      success: true,
      data: {
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          isVerified: true,
        },
      },
    });
  })
);

/**
 * POST /api/auth/login
 * Authenticate user
 */
router.post(
  '/login',
  authRateLimiter,
  validateRequest(loginRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { email, username, password, phone, googleToken } = req.validatedBody;

    // Find user
    let user = null;
    if (email) {
      user = await getUserByEmail(email);
    } else if (username) {
      user = await getUserByUsername(username);
    } else if (phone) {
      // TODO: Implement phone-based lookup if needed
      throw new ValidationError('Email or username required');
    }

    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Verify password (if not Google OAuth)
    if (!googleToken && password) {
      if (!user.passwordHash) {
        throw new UnauthorizedError('Password not set for this account');
      }

      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        throw new UnauthorizedError('Invalid credentials');
      }
    }

    // Check if verified
    if (!user.isVerified) {
      throw new UnauthorizedError('Account not verified. Please verify your account first.');
    }

    // Update last login
    await updateUser(user.id, { lastLogin: new Date().toISOString() });

    // Generate tokens
    const payload = {
      userId: user.id,
      email: user.email,
      username: user.username,
    };

    return res.json({
      success: true,
      data: {
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          isVerified: user.isVerified,
        },
      },
    });
  })
);

/**
 * POST /api/auth/google-login
 * Authenticate with Google OAuth
 */
router.post(
  '/google-login',
  authRateLimiter,
  validateRequest(googleLoginRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { email, name, googleId, deviceId } = req.validatedBody;

    // Check if user exists
    let user = await getUserByGoogleId(googleId);
    if (!user) {
      user = await getUserByEmail(email);
    }

    // Create user if new
    if (!user) {
      user = await createUser({
        username: email.split('@')[0], // Use email prefix as username
        email,
        passwordHash: null, // No password for Google OAuth
        googleId,
        isVerified: true, // Google OAuth users are auto-verified
        verificationMethod: 'google',
        deviceId,
      });
    } else if (!user.googleId) {
      // Link Google ID to existing user
      user = await updateUser(user.id, { googleId });
    }

    // Update last login
    await updateUser(user.id, { lastLogin: new Date().toISOString() });

    // Generate tokens
    const payload = {
      userId: user.id,
      email: user.email,
      username: user.username,
    };

    return res.json({
      success: true,
      data: {
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          isVerified: user.isVerified,
        },
      },
    });
  })
);

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
router.post(
  '/forgot-password',
  authRateLimiter,
  validateRequest(forgotPasswordRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { email, phone, verificationMethod } = req.validatedBody;

    // Find user
    let user = null;
    if (email) {
      user = await getUserByEmail(email);
    } else if (phone) {
      // TODO: Implement phone-based lookup
      throw new ValidationError('Email lookup not yet implemented for phone');
    }

    if (!user) {
      // Don't reveal if user exists (security best practice)
      return res.json({
        success: true,
        message: 'If the account exists, a reset code has been sent',
      });
    }

    // Generate and send reset token
    const method = verificationMethod || (phone ? 'sms' : null);
    if (!phone || !method) {
      throw new ValidationError('Phone number and verification method required');
    }

    await storeResetToken(user.id, phone, method);

    return res.json({
      success: true,
      message: 'Reset code sent to your phone',
    });
  })
);

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post(
  '/reset-password',
  authRateLimiter,
  validateRequest(resetPasswordRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { token, newPassword } = req.validatedBody;

    // Validate token
    const result = await validateResetToken(token);
    if (!result.valid) {
      throw new ValidationError(result.error || 'Invalid or expired token');
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update user
    await updateUser(result.userId, { passwordHash });

    // Invalidate token
    await invalidateResetToken(token);

    return res.json({
      success: true,
      message: 'Password reset successfully',
    });
  })
);

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post(
  '/refresh',
  handleAsyncErrors(async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new ValidationError('Refresh token required');
    }

    const decoded = verifyToken(refreshToken, JWT_REFRESH_SECRET);
    if (!decoded) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    // Generate new access token
    const payload = {
      userId: decoded.userId,
      email: decoded.email,
      username: decoded.username,
    };

    return res.json({
      success: true,
      data: {
        accessToken: generateAccessToken(payload),
      },
    });
  })
);

/**
 * POST /api/auth/logout
 * Logout (client-side token removal)
 */
router.post('/logout', (req, res) => {
  return res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * GET /api/auth/me
 * Get current user (requires authentication)
 */
router.get(
  '/me',
  authenticate,
  handleAsyncErrors(async (req, res) => {
    return res.json({
      success: true,
      data: {
        user: {
          id: req.user.id,
          email: req.user.email,
          username: req.user.username,
          phone: req.user.phone,
          isVerified: req.user.isVerified,
          createdAt: req.user.createdAt,
          lastLogin: req.user.lastLogin,
        },
      },
    });
  })
);

/**
 * PUT /api/auth/profile
 * Update profile (requires authentication, passwordConfirmed flag)
 */
router.put(
  '/profile',
  authenticate,
  validateRequest(updateProfileRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { username, email, phone } = req.validatedBody;
    const userId = req.userId;

    // Check if username is being changed and if it's available
    if (username && username !== req.user.username) {
      if (await usernameExists(username)) {
        throw new ConflictError('Username already taken');
      }
    }

    // Check if email is being changed and if it's available
    if (email && email !== req.user.email) {
      if (await emailExists(email)) {
        throw new ConflictError('Email already registered');
      }
    }

    // Prepare updates
    const updates = {};
    if (username) updates.username = username;
    if (phone) updates.phone = phone;

    // Handle email change (requires verification)
    if (email && email !== req.user.email) {
      // Store email verification code
      const code = await storeEmailVerificationCode(userId, email);

      // Send verification code via SMS/WhatsApp if phone is available
      if (req.user.phone) {
        const method = req.user.verificationMethod || 'sms';
        const result = await sendVerificationCode(userId, req.user.phone, method);
        if (!result.success) {
          logger.warn('Failed to send email verification code', { userId });
        }
      }

      return res.json({
        success: true,
        data: {
          needsEmailVerification: true,
          message: 'Email verification code sent',
          // Return code in development for testing
          ...(process.env.NODE_ENV === 'development' && { code }),
        },
      });
    }

    // Update profile (no email change)
    const updatedUser = await updateUser(userId, updates);

    return res.json({
      success: true,
      data: {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          username: updatedUser.username,
          phone: updatedUser.phone,
          isVerified: updatedUser.isVerified,
        },
      },
    });
  })
);

/**
 * POST /api/auth/verify-email
 * Verify email change OTP
 */
router.post(
  '/verify-email',
  authenticate,
  validateRequest(verifyEmailRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { code } = req.validatedBody;
    const userId = req.userId;

    // Verify email code
    const result = await verifyEmailCode(userId, code);
    if (!result.valid) {
      throw new ValidationError(result.error || 'Invalid verification code');
    }

    // Update email
    const updatedUser = await updateUser(userId, {
      email: result.newEmail,
      isVerified: true, // Email verified
    });

    return res.json({
      success: true,
      data: {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          username: updatedUser.username,
          phone: updatedUser.phone,
          isVerified: updatedUser.isVerified,
        },
      },
    });
  })
);

/**
 * PUT /api/auth/password
 * Change password (requires authentication)
 */
router.put(
  '/password',
  authenticate,
  validateRequest(changePasswordRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { currentPassword, newPassword } = req.validatedBody;
    const userId = req.userId;

    // Verify current password
    if (!req.user.passwordHash) {
      throw new UnauthorizedError('Password not set for this account');
    }

    const isValid = await verifyPassword(currentPassword, req.user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update password
    await updateUser(userId, { passwordHash });

    return res.json({
      success: true,
      message: 'Password changed successfully',
    });
  })
);

/**
 * DELETE /api/auth/account
 * Delete account (requires authentication, soft delete)
 */
router.delete(
  '/account',
  authenticate,
  handleAsyncErrors(async (req, res) => {
    const userId = req.userId;

    // Soft delete user
    const success = await softDeleteUser(userId);
    if (!success) {
      throw new InternalServerError('Failed to delete account');
    }

    return res.json({
      success: true,
      message: 'Account deleted successfully',
    });
  })
);

/**
 * GET /api/auth/check-username
 * Check username availability
 */
router.get(
  '/check-username',
  handleAsyncErrors(async (req, res) => {
    const { username } = req.query;
    if (!username) {
      throw new ValidationError('Username required');
    }

    const exists = await usernameExists(username);
    return res.json({
      success: true,
      data: { available: !exists },
    });
  })
);

module.exports = router;

