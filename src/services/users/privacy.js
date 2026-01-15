const { getUserById, updateUser } = require('../auth/user-storage');
const { logger } = require('../logger');

/**
 * Check if location consent needs renewal
 * @param {string} userId - User ID
 * @param {number} expiryMonths - Number of months before consent expires (default: 12)
 * @returns {Promise<boolean>} True if consent needs renewal
 */
async function checkLocationConsentExpiry(userId, expiryMonths = 12) {
  try {
    const user = await getUserById(userId);
    if (!user || !user.locationConsent || !user.locationConsentTimestamp) {
      return false; // No consent to expire
    }

    const consentDate = new Date(user.locationConsentTimestamp);
    const expiryDate = new Date(consentDate);
    expiryDate.setMonth(expiryDate.getMonth() + expiryMonths);
    const now = new Date();

    return now > expiryDate;
  } catch (error) {
    logger.error('Location consent expiry check failed', {
      userId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Revoke location consent and remove geolocation data
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if successful
 */
async function revokeLocationConsent(userId) {
  try {
    await updateUser(userId, {
      geolocation: null,
      locationConsent: false,
      locationConsentTimestamp: null,
      // Optionally remove province/city if they came from geolocation
      // Keep them if user manually set them
    });

    logger.info('Location consent revoked', { userId });
    return true;
  } catch (error) {
    logger.error('Location consent revocation failed', {
      userId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Anonymize user data for GDPR compliance
 * Removes personally identifiable information while keeping analytics data
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if successful
 */
async function anonymizeUserData(userId) {
  try {
    const user = await getUserById(userId);
    if (!user) {
      return false;
    }

    // Anonymize PII while keeping analytics data
    await updateUser(userId, {
      email: null,
      username: `anonymous_${userId.substring(0, 8)}`,
      phone: null,
      whatsappNumber: null,
      telegramUsername: null,
      avatar: null,
      geolocation: null,
      locationConsent: false,
      locationConsentTimestamp: null,
      province: null,
      city: null,
      // Keep: deviceId, deviceModel, osModel, customerType, createdAt, analytics data
    });

    logger.info('User data anonymized', { userId });
    return true;
  } catch (error) {
    logger.error('User data anonymization failed', {
      userId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Export all user data (GDPR right to access)
 * @param {string} userId - User ID
 * @returns {Promise<object|null>} User data object or null
 */
async function exportUserData(userId) {
  try {
    const user = await getUserById(userId);
    if (!user) {
      return null;
    }

    // Return all user data (excluding sensitive fields like passwordHash)
    const exportData = {
      id: user.id,
      isRegistered: user.isRegistered,
      username: user.username,
      email: user.email,
      phone: user.phone,
      province: user.province,
      city: user.city,
      whatsappNumber: user.whatsappNumber,
      telegramUsername: user.telegramUsername,
      deviceModel: user.deviceModel,
      osModel: user.osModel,
      geolocation: user.geolocation,
      locationConsent: user.locationConsent,
      locationConsentTimestamp: user.locationConsentTimestamp,
      customerType: user.customerType,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      groups: user.groups,
      region: user.region,
      // Exclude: passwordHash, deleted, deletedAt
    };

    logger.info('User data exported', { userId });
    return exportData;
  } catch (error) {
    logger.error('User data export failed', {
      userId,
      error: error.message,
    });
    return null;
  }
}

module.exports = {
  checkLocationConsentExpiry,
  revokeLocationConsent,
  anonymizeUserData,
  exportUserData,
};
