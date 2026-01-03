const bcrypt = require('bcrypt');
const { BCRYPT_ROUNDS } = require('../../config/auth');
const { logger } = require('../logger');

/**
 * Hash password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(password) {
  try {
    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    const hash = await bcrypt.hash(password, salt);
    return hash;
  } catch (error) {
    logger.error('Password hashing failed', { error: error.message });
    throw new Error('Failed to hash password');
  }
}

/**
 * Verify password against hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} True if password matches
 */
async function verifyPassword(password, hash) {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    logger.error('Password verification failed', { error: error.message });
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };

