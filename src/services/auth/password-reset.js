const crypto = require('crypto');
const { getRedisClient } = require('../redis/client');
const { logger } = require('../logger');
const { RESET_TOKEN_EXPIRY_HOURS } = require('../../config/auth');
const { sendOTP } = require('./messaging');

/**
 * Generate secure reset token
 * @returns {string} Random hex token
 */
function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Store reset token
 * @param {string} userId - User ID
 * @param {string} phoneNumber - Phone number in E.164 format
 * @param {string} method - Verification method ('sms' or 'whatsapp')
 * @returns {Promise<string>} Reset token
 */
async function storeResetToken(userId, phoneNumber, method = 'sms') {
  try {
    const redis = getRedisClient();
    const token = generateResetToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + RESET_TOKEN_EXPIRY_HOURS);

    const data = JSON.stringify({ userId, expiresAt: expiresAt.toISOString() });
    const key = `reset:${token}`;
    const ttl = RESET_TOKEN_EXPIRY_HOURS * 3600; // Convert to seconds

    await redis.setex(key, ttl, data);

    // Send reset code via SMS/WhatsApp (first 6 chars as code)
    const code = token.substring(0, 6).toUpperCase();
    await sendOTP(phoneNumber, code, method);

    logger.info('Reset token stored', { userId });
    return token;
  } catch (error) {
    logger.error('Store reset token failed', { userId, error: error.message });
    throw error;
  }
}

/**
 * Validate reset token
 * @param {string} token - Reset token
 * @returns {Promise<{valid: boolean, userId?: string, error?: string}>} Validation result
 */
async function validateResetToken(token) {
  try {
    const redis = getRedisClient();
    const key = `reset:${token}`;
    const data = await redis.get(key);

    if (!data) {
      return { valid: false, error: 'Token expired or invalid' };
    }

    const { userId, expiresAt } = JSON.parse(data);
    const now = new Date();

    if (new Date(expiresAt) < now) {
      await redis.del(key);
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, userId };
  } catch (error) {
    logger.error('Validate reset token failed', { error: error.message });
    return { valid: false, error: 'Token validation failed' };
  }
}

/**
 * Invalidate reset token
 * @param {string} token - Reset token
 * @returns {Promise<void>}
 */
async function invalidateResetToken(token) {
  try {
    const redis = getRedisClient();
    await redis.del(`reset:${token}`);
  } catch (error) {
    logger.error('Invalidate reset token failed', { error: error.message });
  }
}

module.exports = {
  storeResetToken,
  validateResetToken,
  invalidateResetToken,
};

