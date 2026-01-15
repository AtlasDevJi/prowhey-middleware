const { getUserByDeviceId, getUserByPhone, addFraudFlag, updateTrustScore } = require('../auth/user-storage');
const { logger } = require('../logger');

/**
 * Check for multiple accounts with same device or phone
 * @param {string} userId - Current user ID
 * @param {string} deviceId - Device ID
 * @param {string} phone - Phone number
 * @returns {Promise<object>} Detection result with flags
 */
async function detectMultipleAccounts(userId, deviceId, phone) {
  try {
    const flags = [];
    let deviceAccountCount = 0;
    let phoneAccountCount = 0;

    // Check device ID
    if (deviceId) {
      const deviceUser = await getUserByDeviceId(deviceId);
      if (deviceUser && deviceUser.id !== userId) {
        deviceAccountCount = 1;
        flags.push('multiple_accounts_device');
      }
    }

    // Check phone number
    if (phone) {
      const phoneUser = await getUserByPhone(phone);
      if (phoneUser && phoneUser.id !== userId) {
        phoneAccountCount = 1;
        flags.push('multiple_accounts_phone');
      }
    }

    return {
      hasMultipleAccounts: flags.length > 0,
      flags,
      deviceAccountCount,
      phoneAccountCount,
    };
  } catch (error) {
    logger.error('Multiple account detection failed', { userId, error: error.message });
    return { hasMultipleAccounts: false, flags: [] };
  }
}

/**
 * Check for suspicious activity patterns
 * @param {string} userId - User ID
 * @param {object} activity - Activity data (type, timestamp, etc.)
 * @returns {Promise<boolean>} True if suspicious
 */
async function detectSuspiciousActivity(userId, activity) {
  try {
    // Patterns to detect:
    // - Rapid account creation/deletion cycles
    // - Unusual location changes
    // - High frequency of failed transactions
    // - Chargeback patterns
    
    const suspiciousPatterns = [];
    
    // Add your suspicious activity detection logic here
    // For example:
    // - Check account age vs activity level
    // - Check for rapid location changes
    // - Check transaction patterns
    
    return suspiciousPatterns.length > 0;
  } catch (error) {
    logger.error('Suspicious activity detection failed', { userId, error: error.message });
    return false;
  }
}

/**
 * Calculate trust score based on various factors
 * @param {object} user - User object
 * @returns {number} Trust score (0-100)
 */
function calculateTrustScore(user) {
  let score = 100;

  // Reduce score for fraud flags
  const fraudFlags = user.fraudFlags || [];
  score -= fraudFlags.length * 20;

  // Reduce score for suspicious activity
  score -= (user.suspiciousActivityCount || 0) * 5;

  // Increase score for verified accounts
  if (user.idVerified) {
    score += 10;
  }
  if (user.phoneVerified) {
    score += 5;
  }
  if (user.isVerified) {
    score += 5;
  }

  // Reduce score for new accounts (less than 30 days)
  if (user.createdAt) {
    const accountAge = Date.now() - new Date(user.createdAt).getTime();
    const daysOld = accountAge / (1000 * 60 * 60 * 24);
    if (daysOld < 30) {
      score -= 10;
    }
  }

  // Ensure score is within bounds
  return Math.max(0, Math.min(100, score));
}

/**
 * Monitor and flag suspicious behavior
 * @param {string} userId - User ID
 * @param {string} activityType - Type of activity (e.g., 'transaction', 'login', 'signup')
 * @param {object} metadata - Additional metadata
 * @returns {Promise<void>}
 */
async function monitorUserActivity(userId, activityType, metadata = {}) {
  try {
    // Check for multiple accounts
    if (metadata.deviceId || metadata.phone) {
      const multipleAccounts = await detectMultipleAccounts(
        userId,
        metadata.deviceId,
        metadata.phone
      );

      if (multipleAccounts.hasMultipleAccounts) {
        for (const flag of multipleAccounts.flags) {
          await addFraudFlag(userId, flag);
        }
        logger.warn('Multiple accounts detected', {
          userId,
          flags: multipleAccounts.flags,
        });
      }
    }

    // Check for suspicious activity
    const isSuspicious = await detectSuspiciousActivity(userId, {
      type: activityType,
      ...metadata,
    });

    if (isSuspicious) {
      await addFraudFlag(userId, 'suspicious_activity');
      logger.warn('Suspicious activity detected', { userId, activityType });
    }
  } catch (error) {
    logger.error('User activity monitoring failed', {
      userId,
      activityType,
      error: error.message,
    });
  }
}

/**
 * Check if user is eligible for credit based on trust score and verification
 * @param {object} user - User object
 * @param {number} minTrustScore - Minimum trust score required (default: 50)
 * @returns {boolean} True if eligible
 */
function isEligibleForCredit(user, minTrustScore = 50) {
  // Must have ID verified
  if (!user.idVerified) {
    return false;
  }

  // Must have minimum trust score
  if ((user.trustScore || 0) < minTrustScore) {
    return false;
  }

  // Must not be disabled or suspended
  if (user.accountStatus === 'disabled' || user.accountStatus === 'suspended') {
    return false;
  }

  // Must not have critical fraud flags
  const criticalFlags = ['chargeback', 'fraud', 'theft'];
  const fraudFlags = user.fraudFlags || [];
  const hasCriticalFlag = criticalFlags.some((flag) => fraudFlags.includes(flag));
  if (hasCriticalFlag) {
    return false;
  }

  return true;
}

module.exports = {
  detectMultipleAccounts,
  detectSuspiciousActivity,
  calculateTrustScore,
  monitorUserActivity,
  isEligibleForCredit,
};
