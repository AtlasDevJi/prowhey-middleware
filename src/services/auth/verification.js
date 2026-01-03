const { getRedisClient } = require('../redis/client');
const { generateOTP, getOTPExpiry } = require('./otp');
const { sendOTP } = require('./messaging');
const { logger } = require('../logger');
const { OTP_EXPIRY_MINUTES } = require('../../config/auth');

/**
 * Store verification code
 * @param {string} userId - User ID
 * @param {string} method - Verification method ('sms' or 'whatsapp')
 * @returns {Promise<string>} Generated OTP code
 */
async function storeVerificationCode(userId, method) {
  try {
    const redis = getRedisClient();
    const code = generateOTP();
    const expiresAt = getOTPExpiry();

    const data = JSON.stringify({ code, expiresAt });
    const key = `verify:${userId}:${method}`;
    const ttl = OTP_EXPIRY_MINUTES * 60; // Convert to seconds

    await redis.setex(key, ttl, data);
    logger.info('Verification code stored', { userId, method });
    return code;
  } catch (error) {
    logger.error('Store verification code failed', { userId, method, error: error.message });
    throw error;
  }
}

/**
 * Verify code
 * @param {string} userId - User ID
 * @param {string} method - Verification method
 * @param {string} inputCode - Code to verify
 * @returns {Promise<{valid: boolean, error?: string}>} Verification result
 */
async function verifyCode(userId, method, inputCode) {
  try {
    const redis = getRedisClient();
    const key = `verify:${userId}:${method}`;
    const data = await redis.get(key);

    if (!data) {
      return { valid: false, error: 'Code expired or not found' };
    }

    const { code, expiresAt } = JSON.parse(data);
    const now = new Date();

    if (new Date(expiresAt) < now) {
      await redis.del(key);
      return { valid: false, error: 'Code expired' };
    }

    if (code !== inputCode) {
      return { valid: false, error: 'Invalid code' };
    }

    // Code is valid - delete it
    await redis.del(key);
    return { valid: true };
  } catch (error) {
    logger.error('Verify code failed', { userId, method, error: error.message });
    return { valid: false, error: 'Verification failed' };
  }
}

/**
 * Send verification code
 * @param {string} userId - User ID
 * @param {string} phoneNumber - Phone number in E.164 format
 * @param {string} method - Verification method ('sms' or 'whatsapp')
 * @returns {Promise<{success: boolean, code?: string, error?: string}>} Send result
 */
async function sendVerificationCode(userId, phoneNumber, method = 'sms') {
  try {
    const code = await storeVerificationCode(userId, method);
    const sent = await sendOTP(phoneNumber, code, method);

    if (!sent) {
      logger.warn('Failed to send verification code', { userId, method });
      return { success: false, error: 'Failed to send code' };
    }

    // Return code for testing (remove in production or use environment flag)
    return { success: true, code: process.env.NODE_ENV === 'development' ? code : undefined };
  } catch (error) {
    logger.error('Send verification code failed', { userId, method, error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Store email verification code (for email changes)
 * @param {string} userId - User ID
 * @param {string} newEmail - New email address
 * @returns {Promise<string>} Generated OTP code
 */
async function storeEmailVerificationCode(userId, newEmail) {
  try {
    const redis = getRedisClient();
    const code = generateOTP();
    const expiresAt = getOTPExpiry();

    const data = JSON.stringify({ code, newEmail, expiresAt });
    const key = `email-verify:${userId}`;
    const ttl = OTP_EXPIRY_MINUTES * 60; // Convert to seconds

    await redis.setex(key, ttl, data);
    logger.info('Email verification code stored', { userId, newEmail });
    return code;
  } catch (error) {
    logger.error('Store email verification code failed', { userId, newEmail, error: error.message });
    throw error;
  }
}

/**
 * Verify email change code
 * @param {string} userId - User ID
 * @param {string} inputCode - Code to verify
 * @returns {Promise<{valid: boolean, newEmail?: string, error?: string}>} Verification result
 */
async function verifyEmailCode(userId, inputCode) {
  try {
    const redis = getRedisClient();
    const key = `email-verify:${userId}`;
    const data = await redis.get(key);

    if (!data) {
      return { valid: false, error: 'Code expired or not found' };
    }

    const { code, newEmail, expiresAt } = JSON.parse(data);
    const now = new Date();

    if (new Date(expiresAt) < now) {
      await redis.del(key);
      return { valid: false, error: 'Code expired' };
    }

    if (code !== inputCode) {
      return { valid: false, error: 'Invalid code' };
    }

    // Code is valid - delete it and return new email
    await redis.del(key);
    return { valid: true, newEmail };
  } catch (error) {
    logger.error('Verify email code failed', { userId, error: error.message });
    return { valid: false, error: 'Verification failed' };
  }
}

module.exports = {
  storeVerificationCode,
  verifyCode,
  sendVerificationCode,
  storeEmailVerificationCode,
  verifyEmailCode,
};

