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
 * Compute user status based on user data
 * Status progression: unregistered → registered → erpnext_customer → verified
 * @param {object} user - User object
 * @returns {string} User status: 'unregistered' | 'registered' | 'erpnext_customer' | 'verified'
 */
function computeUserStatus(user) {
  // If user has verified ID and ERPNext customer ID, they are verified
  if (user.idVerified && user.erpnextCustomerId) {
    return 'verified';
  }
  
  // If user has ERPNext customer ID, they are erpnext_customer
  if (user.erpnextCustomerId) {
    return 'erpnext_customer';
  }
  
  // If user has email/username and password/googleId, they are registered
  if ((user.email || user.username) && (user.passwordHash || user.googleId)) {
    return 'registered';
  }
  
  // Otherwise, unregistered
  return 'unregistered';
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
    const now = new Date().toISOString();
    
    // Determine if user is registered (has email/username and password or googleId)
    const isRegistered = !!(userData.email || userData.username) && (userData.passwordHash || userData.googleId);
    
    // Build user object first to compute status
    const user = {
      id: userId,
      isRegistered: isRegistered,
      
      // Profile Information
      username: normalizeUsername(userData.username),
      email: normalizeEmail(userData.email),
      firstName: userData.firstName || null,
      surname: userData.surname || null,
      age: userData.age || null,
      occupation: userData.occupation || null,
      fitnessLevel: userData.fitnessLevel || null, // e.g., 'beginner', 'intermediate', 'advanced', 'professional'
      gender: userData.gender || null, // e.g., 'male', 'female', 'other', 'prefer_not_to_say'
      fitnessGoal: userData.fitnessGoal || null, // e.g., 'weight_loss', 'muscle_gain', 'endurance', 'general_fitness'
      province: userData.province || null,
      city: userData.city || null,
      whatsappNumber: userData.whatsappNumber || null,
      telegramUsername: userData.telegramUsername || null,
      avatar: userData.avatar || null, // Base64-encoded image
      
      // Authentication
      passwordHash: userData.passwordHash || null,
      phone: userData.phone || null,
      googleId: userData.googleId || null,
      isVerified: userData.isVerified || false,
      verificationMethod: userData.verificationMethod || null,
      
      // Device Information
      deviceId: userData.deviceId || null,
      deviceModel: userData.deviceModel || null,
      osModel: userData.osModel || null,
      
      // Geolocation (with consent)
      geolocation: userData.geolocation || null,
      locationConsent: userData.locationConsent || false,
      locationConsentTimestamp: userData.locationConsent ? now : null,
      
      // Customer Information
      customerType: userData.customerType || 'retail', // Default: retail
      
      // Security & Verification
      idVerified: userData.idVerified || false, // ID verification status (for credit/trust)
      idVerifiedAt: userData.idVerifiedAt || null, // Timestamp of ID verification
      phoneVerified: userData.phoneVerified || false, // Phone number verification status
      accountStatus: isRegistered ? (userData.isVerified ? 'active' : 'pending_verification') : (userData.accountStatus || 'active'), // active, pending_verification, disabled, suspended
      fraudFlags: [], // Array of fraud flags (e.g., 'suspicious_activity', 'multiple_accounts', 'chargeback')
      trustScore: 100, // Trust score (0-100, higher is better)
      trustScoreUpdatedAt: now,
      suspiciousActivityCount: 0, // Count of suspicious activities
      lastSuspiciousActivity: null,
      
      // Metadata
      createdAt: now,
      lastLogin: null,
      deleted: false,
      deletedAt: null,
      
      // Notification Targeting
      groups: userData.groups || [],
      region: userData.region || userData.geolocation?.province || userData.geolocation?.city || null,
      
      // ERPNext Integration
      erpnextCustomerId: userData.erpnextCustomerId || null,
      approvedCustomer: userData.approvedCustomer || false, // Boolean: whether customer is approved for orders/payments
    };
    
    // Compute userStatus based on user data
    // Allow explicit userStatus override, otherwise compute from data
    user.userStatus = userData.userStatus || computeUserStatus(user);

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
    if (user.deviceId) {
      await redis.set(`device:${user.deviceId}`, userId);
    }
    if (user.phone) {
      await redis.set(`phone:${user.phone}`, userId);
    }
    
    // Update province/city indexes (optional, for efficient queries)
    if (user.province) {
      await redis.sadd(`province:${user.province}:users`, userId);
    }
    if (user.city) {
      await redis.sadd(`city:${user.city}:users`, userId);
    }
    if (!isRegistered) {
      await redis.sadd('non_registered:users', userId);
    }

    logger.info('User created', { 
      userId, 
      email: user.email, 
      username: user.username,
      isRegistered,
      userStatus: user.userStatus,
      deviceId: user.deviceId 
    });
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
    // Ensure userStatus is set (for backward compatibility with existing users)
    if (!user.userStatus) {
      user.userStatus = computeUserStatus(user);
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
    
    // Automatic userStatus transitions based on data changes
    // Only progress forward, never downgrade (unless explicitly set)
    if (!updates.userStatus) {
      // Check if we should auto-transition status
      const currentStatus = user.userStatus || computeUserStatus(user);
      let newStatus = currentStatus;
      
      // Transition: unregistered → registered (when email/username + password added)
      if (currentStatus === 'unregistered') {
        const hasAuth = (updated.email || updated.username) && (updated.passwordHash || updated.googleId);
        if (hasAuth) {
          newStatus = 'registered';
        }
      }
      
      // Transition: registered → erpnext_customer (when erpnextCustomerId is set)
      if ((currentStatus === 'registered' || currentStatus === 'unregistered') && updated.erpnextCustomerId) {
        // Only transition if user has email/username (registered or ready to be)
        const hasAuth = (updated.email || updated.username) && (updated.passwordHash || updated.googleId);
        if (hasAuth || currentStatus === 'registered') {
          newStatus = 'erpnext_customer';
        }
      }
      
      // Transition: erpnext_customer → verified (when idVerified becomes true)
      if (currentStatus === 'erpnext_customer' && updated.idVerified && updated.erpnextCustomerId) {
        newStatus = 'verified';
      }
      
      // Only update if status actually changed
      if (newStatus !== currentStatus) {
        updated.userStatus = newStatus;
        logger.info('User status auto-transitioned', { userId, from: currentStatus, to: newStatus });
      } else {
        // Ensure userStatus is set (for backward compatibility)
        updated.userStatus = currentStatus;
      }
    } else {
      // Explicit userStatus update - validate it's a valid progression
      const currentStatus = user.userStatus || computeUserStatus(user);
      const requestedStatus = updates.userStatus;
      
      // Status hierarchy: unregistered < registered < erpnext_customer < verified
      const statusHierarchy = { 'unregistered': 0, 'registered': 1, 'erpnext_customer': 2, 'verified': 3 };
      const currentLevel = statusHierarchy[currentStatus] || 0;
      const requestedLevel = statusHierarchy[requestedStatus] || 0;
      
      // Only allow progression forward (or same level)
      if (requestedLevel < currentLevel) {
        logger.warn('Attempted to downgrade user status', { userId, currentStatus, requestedStatus });
        // Reject downgrade - keep current status
        updated.userStatus = currentStatus;
      } else {
        updated.userStatus = requestedStatus;
      }
    }

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
    
    // Update phone index if changed
    if (updates.phone && updates.phone !== user.phone) {
      if (user.phone) {
        await redis.del(`phone:${user.phone}`);
      }
      if (updates.phone) {
        await redis.set(`phone:${updates.phone}`, userId);
      }
    }
    
    // Update deviceId index if changed
    if (updates.deviceId && updates.deviceId !== user.deviceId) {
      if (user.deviceId) {
        await redis.del(`device:${user.deviceId}`);
      }
      if (updates.deviceId) {
        await redis.set(`device:${updates.deviceId}`, userId);
      }
    }
    
    // Update province/city indexes if changed
    if (updates.province && updates.province !== user.province) {
      if (user.province) {
        await redis.srem(`province:${user.province}:users`, userId);
      }
      if (updates.province) {
        await redis.sadd(`province:${updates.province}:users`, userId);
      }
    }
    
    if (updates.city && updates.city !== user.city) {
      if (user.city) {
        await redis.srem(`city:${user.city}:users`, userId);
      }
      if (updates.city) {
        await redis.sadd(`city:${updates.city}:users`, userId);
      }
    }
    
    // Update isRegistered status and non_registered index
    if (updates.isRegistered !== undefined && updates.isRegistered !== user.isRegistered) {
      if (!user.isRegistered && updates.isRegistered) {
        // Converting from anonymous to registered
        await redis.srem('non_registered:users', userId);
      } else if (user.isRegistered && !updates.isRegistered) {
        // Converting from registered to anonymous (unlikely, but handle it)
        await redis.sadd('non_registered:users', userId);
      }
    }
    
    // Update region from geolocation if provided
    if (updates.geolocation && updates.geolocation.province) {
      updated.region = updates.geolocation.province || updates.geolocation.city || updated.region;
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
 * Get user by phone number
 * @param {string} phone - Phone number
 * @returns {Promise<object|null>} User object or null
 */
async function getUserByPhone(phone) {
  try {
    const redis = getRedisClient();
    if (!phone) {
      return null;
    }
    const userId = await redis.get(`phone:${phone}`);
    if (!userId) {
      return null;
    }
    return await getUserByIdIncludingDeleted(userId);
  } catch (error) {
    logger.error('Get user by phone failed', { phone, error: error.message });
    return null;
  }
}

/**
 * Check if account is disabled (for duplicate detection)
 * @param {string} deviceId - Device ID
 * @param {string} phone - Phone number
 * @returns {Promise<object|null>} Disabled user object or null
 */
async function checkDisabledAccount(deviceId, phone) {
  try {
    // Check by device ID
    if (deviceId) {
      const userByDevice = await getUserByDeviceId(deviceId);
      if (userByDevice && userByDevice.accountStatus === 'disabled') {
        return userByDevice;
      }
    }
    
    // Check by phone number
    if (phone) {
      const userByPhone = await getUserByPhone(phone);
      if (userByPhone && userByPhone.accountStatus === 'disabled') {
        return userByPhone;
      }
    }
    
    return null;
  } catch (error) {
    logger.error('Check disabled account failed', { deviceId, phone, error: error.message });
    return null;
  }
}

/**
 * Soft delete user (mark as disabled, not deleted)
 * Keeps device/phone indexes for duplicate detection
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

    const disabledAt = new Date().toISOString();
    await updateUser(userId, {
      deleted: true,
      deletedAt: disabledAt,
      accountStatus: 'disabled', // Mark as disabled (not deleted)
      // Keep deviceId and phone indexes for duplicate detection
    });

    // Remove email/username indexes (but keep device/phone for duplicate detection)
    if (user.email) {
      await redis.del(`email:${user.email}`);
    }
    if (user.username) {
      await redis.del(`username:${user.username}`);
    }
    if (user.googleId) {
      await redis.del(`google:${user.googleId}`);
    }
    
    // Keep device and phone indexes for duplicate detection
    // These will be checked during signup to prevent re-registration

    logger.info('User account disabled', { userId, disabledAt, deviceId: user.deviceId, phone: user.phone });
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
    if (user.deviceId) {
      await redis.del(`device:${user.deviceId}`);
    }
    if (user.phone) {
      await redis.del(`phone:${user.phone}`);
    }
    
    // Remove from province/city indexes
    if (user.province) {
      await redis.srem(`province:${user.province}:users`, userId);
    }
    if (user.city) {
      await redis.srem(`city:${user.city}:users`, userId);
    }
    if (!user.isRegistered) {
      await redis.srem('non_registered:users', userId);
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

/**
 * Get user by device ID
 * @param {string} deviceId - Device ID
 * @returns {Promise<object|null>} User object or null
 */
async function getUserByDeviceId(deviceId) {
  try {
    const redis = getRedisClient();
    if (!deviceId) {
      return null;
    }
    const userId = await redis.get(`device:${deviceId}`);
    if (!userId) {
      return null;
    }
    return await getUserById(userId);
  } catch (error) {
    logger.error('Get user by device ID failed', { deviceId, error: error.message });
    return null;
  }
}

/**
 * Create anonymous user (non-registered)
 * @param {string} deviceId - Device ID (required)
 * @param {string} deviceModel - Device model (optional)
 * @param {string} osModel - OS model (optional)
 * @param {object} geolocation - Geolocation object with lat/lng (optional)
 * @param {boolean} locationConsent - Location consent flag
 * @returns {Promise<object>} Created anonymous user object
 */
async function createAnonymousUser(deviceId, deviceModel = null, osModel = null, geolocation = null, locationConsent = false) {
  try {
    // Check if deviceId already has a user
    const existingUser = await getUserByDeviceId(deviceId);
    if (existingUser) {
      // Update device info if provided
      if (deviceModel || osModel) {
        const updates = {};
        if (deviceModel) updates.deviceModel = deviceModel;
        if (osModel) updates.osModel = osModel;
        await updateUser(existingUser.id, updates);
      }
      return existingUser;
    }
    
    // Create new anonymous user
    const userData = {
      deviceId,
      deviceModel,
      osModel,
      geolocation: locationConsent && geolocation ? geolocation : null,
      locationConsent,
      isRegistered: false,
      userStatus: 'unregistered', // Explicitly set to unregistered
      accountStatus: 'active', // Active account, just not registered yet
    };
    
    return await createUser(userData);
  } catch (error) {
    logger.error('Anonymous user creation failed', { deviceId, error: error.message });
    throw error;
  }
}

/**
 * Update device information
 * @param {string} userId - User ID
 * @param {string} deviceModel - Device model
 * @param {string} osModel - OS model
 * @returns {Promise<object|null>} Updated user object or null
 */
async function updateDeviceInfo(userId, deviceModel, osModel) {
  try {
    const updates = {};
    if (deviceModel) updates.deviceModel = deviceModel;
    if (osModel) updates.osModel = osModel;
    return await updateUser(userId, updates);
  } catch (error) {
    logger.error('Device info update failed', { userId, error: error.message });
    throw error;
  }
}

/**
 * Update ID verification status
 * @param {string} userId - User ID
 * @param {boolean} verified - Verification status
 * @returns {Promise<object|null>} Updated user object or null
 */
async function updateIdVerification(userId, verified) {
  try {
    const now = new Date().toISOString();
    const updates = {
      idVerified: verified,
      idVerifiedAt: verified ? now : null,
    };
    
    // Increase trust score when ID is verified
    if (verified) {
      const user = await getUserById(userId);
      if (user) {
        const currentTrustScore = user.trustScore || 100;
        updates.trustScore = Math.min(100, currentTrustScore + 10); // Add 10 points
        updates.trustScoreUpdatedAt = now;
      }
    }
    
    return await updateUser(userId, updates);
  } catch (error) {
    logger.error('ID verification update failed', { userId, error: error.message });
    throw error;
  }
}

/**
 * Update phone verification status
 * @param {string} userId - User ID
 * @param {boolean} verified - Verification status
 * @returns {Promise<object|null>} Updated user object or null
 */
async function updatePhoneVerification(userId, verified) {
  try {
    const updates = {
      phoneVerified: verified,
    };
    
    // Increase trust score when phone is verified
    if (verified) {
      const user = await getUserById(userId);
      if (user) {
        const currentTrustScore = user.trustScore || 100;
        updates.trustScore = Math.min(100, currentTrustScore + 5); // Add 5 points
        updates.trustScoreUpdatedAt = new Date().toISOString();
      }
    }
    
    return await updateUser(userId, updates);
  } catch (error) {
    logger.error('Phone verification update failed', { userId, error: error.message });
    throw error;
  }
}

/**
 * Add fraud flag to user
 * @param {string} userId - User ID
 * @param {string} flag - Fraud flag (e.g., 'suspicious_activity', 'multiple_accounts', 'chargeback')
 * @returns {Promise<object|null>} Updated user object or null
 */
async function addFraudFlag(userId, flag) {
  try {
    const user = await getUserById(userId);
    if (!user) {
      return null;
    }
    
    const fraudFlags = user.fraudFlags || [];
    if (!fraudFlags.includes(flag)) {
      fraudFlags.push(flag);
    }
    
    const now = new Date().toISOString();
    const updates = {
      fraudFlags,
      suspiciousActivityCount: (user.suspiciousActivityCount || 0) + 1,
      lastSuspiciousActivity: now,
      trustScore: Math.max(0, (user.trustScore || 100) - 20), // Reduce trust score by 20
      trustScoreUpdatedAt: now,
    };
    
    // Auto-suspend if trust score drops too low or too many flags
    if (updates.trustScore < 30 || fraudFlags.length >= 3) {
      updates.accountStatus = 'suspended';
    }
    
    return await updateUser(userId, updates);
  } catch (error) {
    logger.error('Add fraud flag failed', { userId, flag, error: error.message });
    throw error;
  }
}

/**
 * Update trust score
 * @param {string} userId - User ID
 * @param {number} scoreChange - Change in trust score (positive or negative)
 * @returns {Promise<object|null>} Updated user object or null
 */
async function updateTrustScore(userId, scoreChange) {
  try {
    const user = await getUserById(userId);
    if (!user) {
      return null;
    }
    
    const currentScore = user.trustScore || 100;
    const newScore = Math.max(0, Math.min(100, currentScore + scoreChange));
    
    return await updateUser(userId, {
      trustScore: newScore,
      trustScoreUpdatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Update trust score failed', { userId, error: error.message });
    throw error;
  }
}

/**
 * Update geolocation with consent
 * @param {string} userId - User ID
 * @param {object} geolocation - Geolocation object with lat/lng
 * @param {boolean} consent - Location consent flag
 * @returns {Promise<object|null>} Updated user object or null
 */
async function updateGeolocation(userId, geolocation, consent) {
  try {
    const now = new Date().toISOString();
    const updates = {
      geolocation: consent && geolocation ? geolocation : null,
      locationConsent: consent,
      locationConsentTimestamp: consent ? now : null,
    };
    
    // Update region from geolocation if provided
    if (consent && geolocation) {
      updates.region = geolocation.province || geolocation.city || null;
      updates.province = geolocation.province || null;
      updates.city = geolocation.city || null;
    } else if (!consent) {
      // Remove geolocation data if consent revoked
      updates.geolocation = null;
      updates.locationConsentTimestamp = null;
    }
    
    return await updateUser(userId, updates);
  } catch (error) {
    logger.error('Geolocation update failed', { userId, error: error.message });
    throw error;
  }
}

/**
 * Get users by province
 * @param {string} province - Province name
 * @returns {Promise<Array<object>>} Array of user objects
 */
async function getUsersByProvince(province) {
  try {
    const redis = getRedisClient();
    const userIds = await redis.smembers(`province:${province}:users`);
    if (!userIds || userIds.length === 0) {
      return [];
    }
    
    const users = [];
    for (const userId of userIds) {
      const user = await getUserById(userId);
      if (user && user.province === province) {
        users.push(user);
      }
    }
    
    return users;
  } catch (error) {
    logger.error('Get users by province failed', { province, error: error.message });
    return [];
  }
}

/**
 * Get users by city
 * @param {string} city - City name
 * @returns {Promise<Array<object>>} Array of user objects
 */
async function getUsersByCity(city) {
  try {
    const redis = getRedisClient();
    const userIds = await redis.smembers(`city:${city}:users`);
    if (!userIds || userIds.length === 0) {
      return [];
    }
    
    const users = [];
    for (const userId of userIds) {
      const user = await getUserById(userId);
      if (user && user.city === city) {
        users.push(user);
      }
    }
    
    return users;
  } catch (error) {
    logger.error('Get users by city failed', { city, error: error.message });
    return [];
  }
}

/**
 * Get all non-registered users
 * @returns {Promise<Array<object>>} Array of anonymous user objects
 */
async function getNonRegisteredUsers() {
  try {
    const redis = getRedisClient();
    const userIds = await redis.smembers('non_registered:users');
    if (!userIds || userIds.length === 0) {
      return [];
    }
    
    const users = [];
    for (const userId of userIds) {
      const user = await getUserById(userId);
      if (user && !user.isRegistered) {
        users.push(user);
      }
    }
    
    return users;
  } catch (error) {
    logger.error('Get non-registered users failed', { error: error.message });
    return [];
  }
}

/**
 * Get users by device IDs
 * @param {Array<string>} deviceIds - Array of device IDs
 * @returns {Promise<Array<object>>} Array of user objects
 */
async function getUsersByDeviceIds(deviceIds) {
  try {
    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      return [];
    }
    
    const users = [];
    for (const deviceId of deviceIds) {
      const user = await getUserByDeviceId(deviceId);
      if (user) {
        users.push(user);
      }
    }
    
    return users;
  } catch (error) {
    logger.error('Get users by device IDs failed', { error: error.message });
    return [];
  }
}

/**
 * Get all users with optional filters
 * @param {object} filters - Filter options (isRegistered, province, city, customerType)
 * @returns {Promise<Array<object>>} Array of user objects
 */
async function getAllUsers(filters = {}) {
  try {
    const redis = getRedisClient();
    let userIds = [];
    
    // Use indexes if available for efficient filtering
    if (filters.province) {
      userIds = await redis.smembers(`province:${filters.province}:users`);
    } else if (filters.city) {
      userIds = await redis.smembers(`city:${filters.city}:users`);
    } else if (filters.isRegistered === false) {
      userIds = await redis.smembers('non_registered:users');
    } else {
      // No index available, need to scan (less efficient)
      // For now, return empty array - can implement scanning if needed
      logger.warn('getAllUsers called without index filter - returning empty array');
      return [];
    }
    
    if (!userIds || userIds.length === 0) {
      return [];
    }
    
    const users = [];
    for (const userId of userIds) {
      const user = await getUserById(userId);
      if (user) {
        // Apply additional filters
        if (filters.isRegistered !== undefined && user.isRegistered !== filters.isRegistered) {
          continue;
        }
        if (filters.customerType && user.customerType !== filters.customerType) {
          continue;
        }
        users.push(user);
      }
    }
    
    return users;
  } catch (error) {
    logger.error('Get all users failed', { filters, error: error.message });
    return [];
  }
}

module.exports = {
  generateUserId,
  createUser,
  createAnonymousUser,
  getUserById,
  getUserByIdIncludingDeleted,
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
  hardDeleteUser,
  emailExists,
  usernameExists,
  getUsersByProvince,
  getUsersByCity,
  getNonRegisteredUsers,
  getUsersByDeviceIds,
  getAllUsers,
  normalizeEmail,
  normalizeUsername,
  computeUserStatus,
};

