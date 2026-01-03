const { v4: uuidv4 } = require('uuid');
const { logger } = require('../services/logger');

/**
 * Extract device ID from request headers
 * Checks X-Device-ID first, then X-Client-ID as fallback
 * If neither exists, generates a new client ID
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next middleware
 */
function extractDeviceId(req, res, next) {
  // Check X-Device-ID header first (preferred)
  let deviceId = req.headers['x-device-id'] || req.headers['X-Device-ID'];

  // Fallback to X-Client-ID if device ID not found
  if (!deviceId) {
    deviceId = req.headers['x-client-id'] || req.headers['X-Client-ID'];
  }

  // If still missing, generate a new client ID
  if (!deviceId || deviceId.trim() === '') {
    deviceId = `client-${uuidv4()}`;
    
    // Set response header so client can store and reuse it
    res.setHeader('X-Client-ID', deviceId);
    
    logger.warn('Device ID missing, generated client ID', {
      path: req.path,
      generatedId: deviceId,
    });
  }

  // Sanitize device ID (remove whitespace, limit length)
  deviceId = deviceId.trim().substring(0, 200);

  // Attach to request for use in rate limiting
  req.deviceId = deviceId;

  next();
}

module.exports = {
  extractDeviceId,
};

