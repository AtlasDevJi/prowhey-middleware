const { getRedisClient } = require('../redis/client');
const { logger } = require('../logger');
const crypto = require('crypto');

/**
 * Generate unique user ID
 * @returns {string} User ID in format usr_<hex>
 */
function generateUserId() {
  return `usr_${crypto.randomBytes(12).toString('hex')}`;
}

/**
 * Normalize email (lowercase, trim)
 * @param {string} email - Email address
 * @returns {string} Normalized email
 */
function normalizeEmail(email) {
  if (!email) return null;
  return email.trim().toLowerCase();
}

/**
 * Normalize username (lowercase, trim)
 * @param {string} username - Username
 * @returns {string} Normalized username
 */
function normalizeUsername(username) {
  if (!username) return null;
  return username.trim().toLowerCase();
}

/**
 * Create user in Redis
 * @param {object} userData - User data
 * @returns {Promise<object>} Created user object
 */
async function createUser(userData) {
  try {
    const redis = getRedisClient();
    const userId = generateUserId();
    const user = {
      id: userId,
      email: normalizeEmail(userData.email),
      username: normalizeUsername(userData.username),
      passwordHash: userData.passwordHash || null,
      phone: userData.phone || null,
      googleId: userData.googleId || null,
      isVerified: userData.isVerified || false,
      verificationMethod: userData.verificationMethod || null,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      status: userData.isVerified ? 'active' : 'pending_verification',
      deleted: false,
      deletedAt: null,
      erpnextCustomerId: userData.erpnextCustomerId || null,
      deviceId: userData.deviceId || null,
      groups: userData.groups || [], // User groups for notification targeting
      region: userData.region || null, // User region for notification targeting
    };

    // Store user
    await redis.set(`user:${userId}`, JSON.stringify(user));

    // Create indexes
    if (user.email) {
      await redis.set(`email:${user.email}`, userId);
    }
    if (user.username) {
      await redis.set(`username:${user.username}`, userId);
    }
    if (user.googleId) {
      await redis.set(`google:${user.googleId}`, userId);
    }

    logger.info('User created', { userId, email: user.email, username: user.username });
    return user;
  } catch (error) {
    logger.error('User creation failed', { error: error.message });
    throw error;
  }
}

/**
 * Get user by ID
 * @param {string} userId - User ID
 * @returns {Promise<object|null>} User object or null
 */
async function getUserById(userId) {
  try {
    const redis = getRedisClient();
    const data = await redis.get(`user:${userId}`);
    if (!data) {
      return null;
    }
    const user = JSON.parse(data);
    // Don't return deleted users (unless explicitly requested)
    if (user.deleted) {
      return null;
    }
    return user;
  } catch (error) {
    logger.error('Get user failed', { userId, error: error.message });
    return null;
  }
}

/**
 * Get user by ID (including deleted users)
 * @param {string} userId - User ID
 * @returns {Promise<object|null>} User object or null
 */
async function getUserByIdIncludingDeleted(userId) {
  try {
    const redis = getRedisClient();
    const data = await redis.get(`user:${userId}`);
    if (!data) {
      return null;
    }
    return JSON.parse(data);
  } catch (error) {
    logger.error('Get user failed', { userId, error: error.message });
    return null;
  }
}

/**
 * Get user by email
 * @param {string} email - Email address
 * @returns {Promise<object|null>} User object or null
 */
async function getUserByEmail(email) {
  try {
    const redis = getRedisClient();
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return null;
    }
    const userId = await redis.get(`email:${normalizedEmail}`);
    if (!userId) {
      return null;
    }
    return await getUserById(userId);
  } catch (error) {
    logger.error('Get user by email failed', { email, error: error.message });
    return null;
  }
}

/**
 * Get user by username
 * @param {string} username - Username
 * @returns {Promise<object|null>} User object or null
 */
async function getUserByUsername(username) {
  try {
    const redis = getRedisClient();
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) {
      return null;
    }
    const userId = await redis.get(`username:${normalizedUsername}`);
    if (!userId) {
      return null;
    }
    return await getUserById(userId);
  } catch (error) {
    logger.error('Get user by username failed', { username, error: error.message });
    return null;
  }
}

/**
 * Get user by Google ID
 * @param {string} googleId - Google ID
 * @returns {Promise<object|null>} User object or null
 */
async function getUserByGoogleId(googleId) {
  try {
    const redis = getRedisClient();
    const userId = await redis.get(`google:${googleId}`);
    if (!userId) {
      return null;
    }
    return await getUserById(userId);
  } catch (error) {
    logger.error('Get user by Google ID failed', { googleId, error: error.message });
    return null;
  }
}

/**
 * Update user
 * @param {string} userId - User ID
 * @param {object} updates - Fields to update
 * @returns {Promise<object|null>} Updated user object or null
 */
async function updateUser(userId, updates) {
  try {
    const redis = getRedisClient();
    const user = await getUserByIdIncludingDeleted(userId);
    if (!user) {
      return null;
    }

    const updated = { ...user, ...updates, id: userId }; // Preserve ID

    // Update indexes if email/username changed
    if (updates.email && updates.email !== user.email) {
      // Delete old email index
      if (user.email) {
        await redis.del(`email:${user.email}`);
      }
      // Create new email index
      const normalizedEmail = normalizeEmail(updates.email);
      if (normalizedEmail) {
        await redis.set(`email:${normalizedEmail}`, userId);
      }
      updated.email = normalizedEmail;
    }

    if (updates.username && updates.username !== user.username) {
      // Delete old username index
      if (user.username) {
        await redis.del(`username:${user.username}`);
      }
      // Create new username index
      const normalizedUsername = normalizeUsername(updates.username);
      if (normalizedUsername) {
        await redis.set(`username:${normalizedUsername}`, userId);
      }
      updated.username = normalizedUsername;
    }

    if (updates.googleId && updates.googleId !== user.googleId) {
      // Delete old Google ID index
      if (user.googleId) {
        await redis.del(`google:${user.googleId}`);
      }
      // Create new Google ID index
      if (updates.googleId) {
        await redis.set(`google:${updates.googleId}`, userId);
      }
    }

    await redis.set(`user:${userId}`, JSON.stringify(updated));
    logger.info('User updated', { userId });
    return updated;
  } catch (error) {
    logger.error('User update failed', { userId, error: error.message });
    throw error;
  }
}

/**
 * Soft delete user (mark as deleted)
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if successful
 */
async function softDeleteUser(userId) {
  try {
    const redis = getRedisClient();
    const user = await getUserByIdIncludingDeleted(userId);
    if (!user) {
      return false;
    }

    const deletedAt = new Date().toISOString();
    await updateUser(userId, {
      deleted: true,
      deletedAt,
      status: 'deleted',
    });

    // Remove indexes (but keep user data)
    if (user.email) {
      await redis.del(`email:${user.email}`);
    }
    if (user.username) {
      await redis.del(`username:${user.username}`);
    }
    if (user.googleId) {
      await redis.del(`google:${user.googleId}`);
    }

    logger.info('User soft deleted', { userId, deletedAt });
    return true;
  } catch (error) {
    logger.error('Soft delete user failed', { userId, error: error.message });
    return false;
  }
}

/**
 * Hard delete user (permanently remove)
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if successful
 */
async function hardDeleteUser(userId) {
  try {
    const redis = getRedisClient();
    const user = await getUserByIdIncludingDeleted(userId);
    if (!user) {
      return false;
    }

    // Delete user data
    await redis.del(`user:${userId}`);

    // Delete indexes
    if (user.email) {
      await redis.del(`email:${user.email}`);
    }
    if (user.username) {
      await redis.del(`username:${user.username}`);
    }
    if (user.googleId) {
      await redis.del(`google:${user.googleId}`);
    }

    logger.info('User hard deleted', { userId });
    return true;
  } catch (error) {
    logger.error('Hard delete user failed', { userId, error: error.message });
    return false;
  }
}

/**
 * Check if email exists
 * @param {string} email - Email address
 * @returns {Promise<boolean>} True if email exists
 */
async function emailExists(email) {
  const user = await getUserByEmail(email);
  return user !== null;
}

/**
 * Check if username exists
 * @param {string} username - Username
 * @returns {Promise<boolean>} True if username exists
 */
async function usernameExists(username) {
  const user = await getUserByUsername(username);
  return user !== null;
}

module.exports = {
  generateUserId,
  createUser,
  getUserById,
  getUserByIdIncludingDeleted,
  getUserByEmail,
  getUserByUsername,
  getUserByGoogleId,
  updateUser,
  softDeleteUser,
  hardDeleteUser,
  emailExists,
  usernameExists,
  normalizeEmail,
  normalizeUsername,
};

