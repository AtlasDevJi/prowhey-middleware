const express = require('express');
const router = express.Router();
const {
  createAnonymousUser,
  getUserById,
  getUserByDeviceId,
  updateDeviceInfo,
  updateGeolocation,
} = require('../services/auth/user-storage');
const { validateRequest } = require('../middleware/validate');
const {
  anonymousUserRequestSchema,
  deviceInfoRequestSchema,
  geolocationUpdateRequestSchema,
} = require('../config/validation');
const { handleAsyncErrors } = require('../utils/error-utils');
const { ValidationError, NotFoundError } = require('../utils/errors');
const { extractDeviceId } = require('../middleware/device-id');
const { verifyToken, JWT_SECRET, generateAccessToken, generateRefreshToken } = require('../middleware/auth');
const { logger } = require('../services/logger');

// Apply device ID extraction middleware
router.use(extractDeviceId);

/**
 * Helper to extract userId from request (optional auth)
 * Tries to extract from req.user first (if authenticate middleware ran)
 * Otherwise, tries to extract from JWT token in Authorization header
 */
async function getUserIdFromRequest(req) {
  // If authenticate middleware already set req.user, use it
  if (req.user?.userId || req.user?.id) {
    return req.user.userId || req.user.id;
  }
  
  // Otherwise, try to extract from token manually (optional auth)
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token, JWT_SECRET);
      if (decoded && decoded.userId) {
        return decoded.userId;
      }
    }
  } catch (error) {
    // Silently fail - optional auth means we continue without userId
  }
  
  return null;
}

/**
 * POST /api/users/anonymous
 * Create anonymous user (non-registered)
 * Called when app first opens
 */
router.post(
  '/anonymous',
  validateRequest(anonymousUserRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { device_id, device_model, os_model, geolocation, location_consent } = req.validatedBody;
    
    // Use device_id from body if provided, otherwise use req.deviceId from middleware
    const finalDeviceId = device_id || req.deviceId;
    
    if (!finalDeviceId) {
      throw new ValidationError('Device ID required (provide in body or X-Device-ID header)');
    }
    
    // Create or get existing anonymous user
    const user = await createAnonymousUser(
      finalDeviceId,
      device_model || null,
      os_model || null,
      geolocation || null,
      location_consent || false
    );

    // Generate tokens for anonymous user (unregistered users can authenticate)
    const payload = {
      userId: user.id,
      email: user.email || null,
      username: user.username || null,
    };

    const tokens = {
      accessToken: generateAccessToken(payload),
      refreshToken: generateRefreshToken(payload),
    };

    return res.status(201).json({
      success: true,
      data: {
        userId: user.id,
        isRegistered: user.isRegistered,
        userStatus: user.userStatus || 'unregistered',
        ...tokens, // Add access and refresh tokens
      },
    });
  })
);

/**
 * POST /api/users/device-info
 * Update device information (works for both registered and anonymous users)
 */
router.post(
  '/device-info',
  validateRequest(deviceInfoRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { device_model, os_model } = req.validatedBody;
    const deviceId = req.deviceId || req.headers['x-device-id'];
    
    if (!deviceId) {
      throw new ValidationError('Device ID required (X-Device-ID header)');
    }
    
    // Try to get user by deviceId (works for both registered and anonymous)
    let user = await getUserByDeviceId(deviceId);
    
    // If no user found, create anonymous user
    if (!user) {
      user = await createAnonymousUser(deviceId, device_model, os_model, null, false);
    } else {
      // Update existing user's device info
      await updateDeviceInfo(user.id, device_model, os_model);
    }

    return res.json({
      success: true,
      message: 'Device info updated',
      data: {
        userId: user.id,
        isRegistered: user.isRegistered,
      },
    });
  })
);

/**
 * POST /api/users/geolocation
 * Update user geolocation (with consent)
 * Works for both registered and anonymous users
 */
router.post(
  '/geolocation',
  validateRequest(geolocationUpdateRequestSchema),
  handleAsyncErrors(async (req, res) => {
    logger.info('[GEOLOCATION] Request received', {
      path: req.path,
      deviceId: req.deviceId,
      hasAuthHeader: !!req.headers.authorization,
      body: req.validatedBody,
    });

    const { geolocation, location_consent } = req.validatedBody;
    const deviceId = req.deviceId || req.headers['x-device-id'];
    const userId = await getUserIdFromRequest(req);
    
    logger.info('[GEOLOCATION] Extracted identifiers', {
      deviceId,
      userId,
      geolocation,
      location_consent,
    });
    
    let user;
    
    // If authenticated, use userId
    if (userId) {
      logger.info('[GEOLOCATION] Using authenticated userId', { userId });
      user = await getUserById(userId);
      if (!user) {
        logger.error('[GEOLOCATION] User not found by userId', { userId });
        throw new NotFoundError('User not found');
      }
      logger.info('[GEOLOCATION] Found user by userId', {
        userId: user.id,
        hasGeolocation: !!user.geolocation,
        locationConsent: user.locationConsent,
      });
    } else if (deviceId) {
      // If not authenticated, use deviceId
      logger.info('[GEOLOCATION] Using deviceId (anonymous user)', { deviceId });
      user = await getUserByDeviceId(deviceId);
      
      if (!user) {
        logger.info('[GEOLOCATION] User not found by deviceId, creating anonymous user', {
          deviceId,
          geolocation,
          location_consent,
        });
        // Create anonymous user if doesn't exist
        user = await createAnonymousUser(deviceId, null, null, geolocation, location_consent);
        logger.info('[GEOLOCATION] Created anonymous user', {
          userId: user.id,
          geolocation: user.geolocation,
          locationConsent: user.locationConsent,
        });
      } else {
        logger.info('[GEOLOCATION] Found existing user by deviceId', {
          userId: user.id,
          currentGeolocation: user.geolocation,
          currentLocationConsent: user.locationConsent,
        });
        // Update geolocation
        logger.info('[GEOLOCATION] Updating geolocation', {
          userId: user.id,
          newGeolocation: geolocation,
          newLocationConsent: location_consent,
        });
        await updateGeolocation(user.id, geolocation, location_consent);
        logger.info('[GEOLOCATION] Geolocation update completed', { userId: user.id });
      }
    } else {
      logger.error('[GEOLOCATION] No deviceId or userId available', {
        deviceId,
        userId,
        headers: Object.keys(req.headers),
      });
      throw new ValidationError('Device ID required (X-Device-ID header) or authentication required');
    }
    
    // Get updated user
    logger.info('[GEOLOCATION] Fetching updated user', { userId: user.id });
    const updatedUser = await getUserById(user.id);
    
    logger.info('[GEOLOCATION] Returning response', {
      userId: updatedUser.id,
      geolocation: updatedUser.geolocation,
      locationConsent: updatedUser.locationConsent,
    });

    return res.json({
      success: true,
      message: 'Geolocation updated',
      data: {
        userId: updatedUser.id,
        geolocation: updatedUser.geolocation,
        locationConsent: updatedUser.locationConsent,
      },
    });
  })
);

module.exports = router;
