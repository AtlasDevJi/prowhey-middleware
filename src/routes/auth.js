const express = require('express');
const router = express.Router();
const { hashPassword, verifyPassword } = require('../services/auth/password');
const {
  createUser,
  createAnonymousUser,
  getUserByEmail,
  getUserByUsername,
  getUserByGoogleId,
  getUserByDeviceId,
  getUserByPhone,
  checkDisabledAccount,
  updateUser,
  updateDeviceInfo,
  updateGeolocation,
  updateIdVerification,
  updatePhoneVerification,
  addFraudFlag,
  updateTrustScore,
  softDeleteUser,
  emailExists,
  usernameExists,
  normalizeUsername,
  normalizeEmail,
  generateUserId,
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
  anonymousUserRequestSchema,
  deviceInfoRequestSchema,
  geolocationUpdateRequestSchema,
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
const { SecurityLogger } = require('../services/security-logger');
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
    const { 
      username, 
      email, 
      password, 
      phone, 
      verificationMethod, 
      deviceId, 
      googleId,
      province,
      city,
      whatsapp_number,
      telegram_username,
      avatar,
      geolocation,
      location_consent,
      customer_type,
      device_model,
      os_model,
      erpnext_customer_id,
      approved_customer,
    } = req.validatedBody;

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

    // Check for disabled account with same device/phone (prevent re-registration)
    const disabledAccount = await checkDisabledAccount(deviceId, phone);
    if (disabledAccount) {
      SecurityLogger.logAuthAttempt(
        disabledAccount.id,
        disabledAccount.email,
        false,
        'Attempted re-registration with disabled account'
      );
      throw new ConflictError('An account with this device or phone number was previously disabled. Please contact support.');
    }

    // Check if deviceId has an existing anonymous user
    let existingAnonymousUser = null;
    if (deviceId) {
      existingAnonymousUser = await getUserByDeviceId(deviceId);
      if (existingAnonymousUser && existingAnonymousUser.isRegistered) {
        // Device already has a registered user - this shouldn't happen, but handle gracefully
        throw new ConflictError('Device already associated with a registered account');
      }
      // Check if anonymous user is disabled
      if (existingAnonymousUser && existingAnonymousUser.accountStatus === 'disabled') {
        throw new ConflictError('This device is associated with a disabled account. Please contact support.');
      }
    }
    
    // Check if phone number is already registered (including disabled accounts)
    if (phone) {
      const existingUserByPhone = await getUserByPhone(phone);
      if (existingUserByPhone) {
        if (existingUserByPhone.accountStatus === 'disabled') {
          throw new ConflictError('This phone number is associated with a disabled account. Please contact support.');
        }
        if (existingUserByPhone.isRegistered && existingUserByPhone.id !== existingAnonymousUser?.id) {
          throw new ConflictError('Phone number already registered');
        }
      }
    }

    // Hash password (if not Google OAuth)
    let passwordHash = null;
    if (!googleId && password) {
      passwordHash = await hashPassword(password);
    }

    // Determine verification method
    const method = verificationMethod || (phone ? 'sms' : null);
    const needsVerification = !googleId && (phone || email);

    let user;
    
    // If anonymous user exists, convert to registered
    if (existingAnonymousUser) {
      // Update existing user to registered status
      user = await updateUser(existingAnonymousUser.id, {
        isRegistered: true,
        username: normalizeUsername(username),
        email: normalizeEmail(email),
        passwordHash,
        phone: phone || null,
        googleId: googleId || null,
        isVerified: !needsVerification,
        verificationMethod: method,
        accountStatus: !needsVerification ? 'active' : 'pending_verification',
        // userStatus will be auto-transitioned to 'registered' by updateUser() logic
        // Preserve existing device info and geolocation
        deviceModel: device_model || existingAnonymousUser.deviceModel,
        osModel: os_model || existingAnonymousUser.osModel,
        geolocation: (location_consent && geolocation) ? geolocation : existingAnonymousUser.geolocation,
        locationConsent: location_consent !== undefined ? location_consent : existingAnonymousUser.locationConsent,
        locationConsentTimestamp: location_consent ? new Date().toISOString() : existingAnonymousUser.locationConsentTimestamp,
        // Add new profile fields
        firstName: first_name || existingAnonymousUser.firstName,
        surname: surname || existingAnonymousUser.surname,
        age: age !== undefined ? age : existingAnonymousUser.age,
        occupation: occupation || existingAnonymousUser.occupation,
        fitnessLevel: fitness_level || existingAnonymousUser.fitnessLevel,
        gender: gender || existingAnonymousUser.gender,
        fitnessGoal: fitness_goal || existingAnonymousUser.fitnessGoal,
        province: province || existingAnonymousUser.province,
        city: city || existingAnonymousUser.city,
        whatsappNumber: whatsapp_number || existingAnonymousUser.whatsappNumber,
        telegramUsername: telegram_username || existingAnonymousUser.telegramUsername,
        avatar: avatar || existingAnonymousUser.avatar,
        customerType: customer_type || existingAnonymousUser.customerType || 'retail',
        erpnextCustomerId: erpnext_customer_id || existingAnonymousUser.erpnextCustomerId,
        approvedCustomer: approved_customer !== undefined ? approved_customer : (existingAnonymousUser.approvedCustomer || false),
        region: geolocation?.province || geolocation?.city || province || city || existingAnonymousUser.region,
      });
    } else {
      // Create new registered user
      user = await createUser({
        username,
        email: email || null,
        passwordHash,
        phone: phone || null,
        googleId: googleId || null,
        isVerified: !needsVerification,
        verificationMethod: method,
        deviceId,
        firstName: first_name,
        surname,
        age,
        occupation,
        fitnessLevel: fitness_level,
        gender,
        fitnessGoal: fitness_goal,
        province,
        city,
        whatsappNumber: whatsapp_number,
        telegramUsername: telegram_username,
        avatar,
        geolocation: location_consent && geolocation ? geolocation : null,
        locationConsent: location_consent || false,
        customerType: customer_type || 'retail',
        erpnextCustomerId: erpnext_customer_id,
        approvedCustomer: approved_customer || false,
        deviceModel: device_model,
        osModel: os_model,
      });
    }

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
      accountStatus: 'active',
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
        // Log failed authentication attempt
        SecurityLogger.logAuthAttempt(user.id, user.email, false, 'Invalid password');
        throw new UnauthorizedError('Invalid credentials');
      }
    }

    // Check if account is disabled or suspended
    if (user.accountStatus === 'disabled' || user.accountStatus === 'suspended') {
      SecurityLogger.logAuthAttempt(user.id, user.email, false, `Login attempt on ${user.accountStatus} account`);
      throw new UnauthorizedError(`Account is ${user.accountStatus}. Please contact support.`);
    }

    // Check if verified
    if (!user.isVerified) {
      SecurityLogger.logAuthAttempt(user.id, user.email, false, 'Account not verified');
      throw new UnauthorizedError('Account not verified. Please verify your account first.');
    }

    // Log successful authentication
    SecurityLogger.logAuthAttempt(user.id, user.email, true);

    // Update last login and device info if provided in headers
    const deviceModel = req.headers['x-device-model'];
    const osModel = req.headers['x-os-model'];
    const updates = { lastLogin: new Date().toISOString() };
    if (deviceModel) updates.deviceModel = deviceModel;
    if (osModel) updates.osModel = osModel;
    await updateUser(user.id, updates);

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
    const { email, googleId, deviceId, name } = req.validatedBody;
    const deviceModel = req.headers['x-device-model'];
    const osModel = req.headers['x-os-model'];

    // Check if user exists
    let user = await getUserByGoogleId(googleId);
    if (!user) {
      user = await getUserByEmail(email);
    }

    // Create user if new
    if (!user) {
      // Check if deviceId has an existing anonymous user
      let existingAnonymousUser = null;
      if (deviceId) {
        existingAnonymousUser = await getUserByDeviceId(deviceId);
        if (existingAnonymousUser && existingAnonymousUser.isRegistered) {
          // Device already has a registered user - shouldn't happen, but handle gracefully
          throw new ConflictError('Device already associated with a registered account');
        }
      }

      // If anonymous user exists, convert to registered
      if (existingAnonymousUser) {
        user = await updateUser(existingAnonymousUser.id, {
          isRegistered: true,
          username: normalizeUsername(name || email?.split('@')[0] || `user_${existingAnonymousUser.id.substring(0, 8)}`),
          email: normalizeEmail(email),
          passwordHash: null,
          googleId,
          isVerified: true,
          verificationMethod: 'google',
          status: 'active',
          deviceModel: deviceModel || existingAnonymousUser.deviceModel,
          osModel: osModel || existingAnonymousUser.osModel,
          // Preserve existing geolocation and other data
        });
      } else {
        // Create new user
        user = await createUser({
          username: normalizeUsername(name || email?.split('@')[0] || `user_${generateUserId().substring(0, 8)}`),
          email,
          passwordHash: null, // No password for Google OAuth
          googleId,
          isVerified: true, // Google OAuth users are auto-verified
          verificationMethod: 'google',
          deviceId,
          deviceModel,
          osModel,
        });
      }
    } else if (!user.googleId) {
      // Link Google ID to existing user
      user = await updateUser(user.id, { googleId });
    }

    // Update last login and device info if provided
    const updates = { lastLogin: new Date().toISOString() };
    if (deviceModel) updates.deviceModel = deviceModel;
    if (osModel) updates.osModel = osModel;
    if (deviceId && deviceId !== user.deviceId) {
      updates.deviceId = deviceId;
    }
    if (deviceId && deviceId !== user.deviceId) {
      updates.deviceId = deviceId;
    }
    await updateUser(user.id, updates);

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
 * Refresh access token and issue new refresh token (token rotation)
 * This enables indefinite login sessions as long as the user uses the app regularly
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

    // Generate new tokens (both access and refresh for token rotation)
    const payload = {
      userId: decoded.userId,
      email: decoded.email,
      username: decoded.username,
    };

    return res.json({
      success: true,
      data: {
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload), // New refresh token (rotation)
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
          firstName: req.user.firstName,
          surname: req.user.surname,
          age: req.user.age,
          occupation: req.user.occupation,
          fitnessLevel: req.user.fitnessLevel,
          gender: req.user.gender,
          fitnessGoal: req.user.fitnessGoal,
          province: req.user.province,
          city: req.user.city,
          whatsappNumber: req.user.whatsappNumber,
          telegramUsername: req.user.telegramUsername,
          avatar: req.user.avatar,
          deviceModel: req.user.deviceModel,
          osModel: req.user.osModel,
          geolocation: req.user.geolocation,
          locationConsent: req.user.locationConsent,
          customerType: req.user.customerType,
          erpnextCustomerId: req.user.erpnextCustomerId,
          approvedCustomer: req.user.approvedCustomer || false,
          isVerified: req.user.isVerified,
          idVerified: req.user.idVerified || false,
          phoneVerified: req.user.phoneVerified || false,
          accountStatus: req.user.accountStatus || 'active',
          userStatus: req.user.userStatus || 'unregistered',
          trustScore: req.user.trustScore || 100,
          createdAt: req.user.createdAt,
          lastLogin: req.user.lastLogin,
          isRegistered: req.user.isRegistered,
        },
      },
    });
  })
);

/**
 * PUT /api/auth/profile
 * Update profile (requires authentication)
 * Supports progressive updates: unregistered users can update profile fields without password confirmation
 * Registered users require password confirmation for sensitive changes (email, username)
 */
router.put(
  '/profile',
  authenticate,
  validateRequest(updateProfileRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { 
      username, 
      email, 
      phone,
      province,
      city,
      whatsapp_number,
      telegram_username,
      avatar,
      geolocation,
      location_consent,
      customer_type,
      device_model,
      os_model,
      erpnext_customer_id,
      approved_customer,
      passwordConfirmed,
      userStatus,
      first_name,
      surname,
      age,
      occupation,
      fitness_level,
      gender,
      fitness_goal,
    } = req.validatedBody;
    const userId = req.userId;
    
    // Get current user status
    const currentUserStatus = req.user.userStatus || 'unregistered';
    const isUnregistered = currentUserStatus === 'unregistered';

    // For unregistered users: cannot update email/username (must use signup endpoint)
    if (isUnregistered && (username || email)) {
      throw new ValidationError('Email and username can only be set during registration. Please use the signup endpoint.');
    }

    // For registered users: password confirmation required for sensitive changes
    if (!isUnregistered && (username || email) && !passwordConfirmed) {
      throw new ValidationError('Password confirmation required for email/username changes');
    }

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
    
    // Prepare updates object
    const updates = {};
    if (username !== undefined) updates.username = username;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (first_name !== undefined) updates.firstName = first_name;
    if (surname !== undefined) updates.surname = surname;
    if (age !== undefined) updates.age = age;
    if (occupation !== undefined) updates.occupation = occupation;
    if (fitness_level !== undefined) updates.fitnessLevel = fitness_level;
    if (gender !== undefined) updates.gender = gender;
    if (fitness_goal !== undefined) updates.fitnessGoal = fitness_goal;
    if (province !== undefined) updates.province = province;
    if (city !== undefined) updates.city = city;
    if (whatsapp_number !== undefined) updates.whatsappNumber = whatsapp_number;
    if (telegram_username !== undefined) updates.telegramUsername = telegram_username;
    if (avatar !== undefined) updates.avatar = avatar;
    if (customer_type !== undefined) updates.customerType = customer_type;
    if (erpnext_customer_id !== undefined) updates.erpnextCustomerId = erpnext_customer_id;
    if (approved_customer !== undefined) updates.approvedCustomer = approved_customer;
    if (device_model !== undefined) updates.deviceModel = device_model;
    if (os_model !== undefined) updates.osModel = os_model;
    
    // Handle explicit userStatus update (if provided, validate it's a progression)
    if (userStatus !== undefined) {
      updates.userStatus = userStatus;
    }
    
    // Handle geolocation update separately (it has its own function)
    if (geolocation !== undefined || location_consent !== undefined) {
      const currentConsent = location_consent !== undefined ? location_consent : req.user.locationConsent;
      const currentGeolocation = geolocation || req.user.geolocation;
      await updateGeolocation(userId, currentGeolocation, currentConsent);
    }
    
    // Update other fields
    if (Object.keys(updates).length > 0) {
      await updateUser(userId, updates);
    }

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

    // Get updated user (after all updates)
    const updatedUser = await getUserById(userId);

    return res.json({
      success: true,
      data: {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          username: updatedUser.username,
          phone: updatedUser.phone,
          firstName: updatedUser.firstName,
          surname: updatedUser.surname,
          age: updatedUser.age,
          occupation: updatedUser.occupation,
          fitnessLevel: updatedUser.fitnessLevel,
          gender: updatedUser.gender,
          fitnessGoal: updatedUser.fitnessGoal,
          province: updatedUser.province,
          city: updatedUser.city,
          whatsappNumber: updatedUser.whatsappNumber,
          telegramUsername: updatedUser.telegramUsername,
          avatar: updatedUser.avatar,
          deviceModel: updatedUser.deviceModel,
          osModel: updatedUser.osModel,
          geolocation: updatedUser.geolocation,
          locationConsent: updatedUser.locationConsent,
          customerType: updatedUser.customerType,
          erpnextCustomerId: updatedUser.erpnextCustomerId,
          approvedCustomer: updatedUser.approvedCustomer || false,
          isVerified: updatedUser.isVerified,
          idVerified: updatedUser.idVerified || false,
          phoneVerified: updatedUser.phoneVerified || false,
          accountStatus: updatedUser.accountStatus || 'active',
          userStatus: updatedUser.userStatus || 'unregistered',
          trustScore: updatedUser.trustScore || 100,
          isRegistered: updatedUser.isRegistered,
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
 * Delete account (requires authentication, marks as disabled)
 * Account is marked as disabled but device/phone indexes are kept to prevent re-registration
 */
router.delete(
  '/account',
  authenticate,
  handleAsyncErrors(async (req, res) => {
    const userId = req.userId;
    const user = req.user;

    // Log account deletion
    SecurityLogger.logAuthAttempt(userId, user.email, false, 'Account deletion requested');

    // Soft delete user (marks as disabled)
    const success = await softDeleteUser(userId);
    if (!success) {
      throw new InternalServerError('Failed to delete account');
    }

    return res.json({
      success: true,
      message: 'Account deleted successfully. You will not be able to register again with the same device or phone number.',
    });
  })
);

/**
 * POST /api/auth/verify-id
 * Verify user ID (for credit/trust purposes)
 * Requires authentication
 */
router.post(
  '/verify-id',
  authenticate,
  handleAsyncErrors(async (req, res) => {
    const userId = req.userId;
    const { verified } = req.body; // Admin/verification system sets this

    if (typeof verified !== 'boolean') {
      throw new ValidationError('verified field must be a boolean');
    }

    const updatedUser = await updateIdVerification(userId, verified);

    return res.json({
      success: true,
      message: verified ? 'ID verified successfully' : 'ID verification removed',
      data: {
        user: {
          id: updatedUser.id,
          idVerified: updatedUser.idVerified,
          idVerifiedAt: updatedUser.idVerifiedAt,
          trustScore: updatedUser.trustScore,
        },
      },
    });
  })
);

/**
 * POST /api/auth/verify-phone
 * Mark phone as verified
 * Requires authentication
 */
router.post(
  '/verify-phone',
  authenticate,
  handleAsyncErrors(async (req, res) => {
    const userId = req.userId;

    const updatedUser = await updatePhoneVerification(userId, true);

    return res.json({
      success: true,
      message: 'Phone number verified',
      data: {
        user: {
          id: updatedUser.id,
          phoneVerified: updatedUser.phoneVerified,
          trustScore: updatedUser.trustScore,
        },
      },
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

