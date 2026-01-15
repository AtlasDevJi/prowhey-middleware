const { logger } = require('../logger');

/**
 * Check if notification should be included for user
 * @param {object} notificationEntry - Stream entry with notification fields
 * @param {string} userId - User ID
 * @param {Array<string>} userGroups - User groups
 * @param {string} userRegion - User region
 * @param {string} userProvince - User province
 * @param {string} userCity - User city
 * @param {string} userDeviceId - User device ID
 * @param {boolean} isRegistered - Whether user is registered
 * @returns {boolean} True if notification should be included
 */
function shouldIncludeNotification(
  notificationEntry, 
  userId, 
  userGroups = [], 
  userRegion = null,
  userProvince = null,
  userCity = null,
  userDeviceId = null,
  isRegistered = true
) {
  try {
    const { 
      target_groups, 
      target_regions, 
      target_users,
      target_devices,
      target_non_registered,
      target_provinces,
      target_cities,
    } = notificationEntry.fields;

    // Parse arrays from stream entry (they come as strings)
    const groups = Array.isArray(target_groups) ? target_groups : JSON.parse(target_groups || '[]');
    const regions = Array.isArray(target_regions) ? target_regions : JSON.parse(target_regions || '[]');
    const users = Array.isArray(target_users) ? target_users : JSON.parse(target_users || '[]');
    const devices = Array.isArray(target_devices) ? target_devices : JSON.parse(target_devices || '[]');
    const provinces = Array.isArray(target_provinces) ? target_provinces : JSON.parse(target_provinces || '[]');
    const cities = Array.isArray(target_cities) ? target_cities : JSON.parse(target_cities || '[]');
    const targetNonRegistered = target_non_registered === 'true' || target_non_registered === true;

    // Check non-registered user targeting
    if (targetNonRegistered && !isRegistered) {
      return true;
    }

    // Check device-specific targeting
    if (devices.length > 0 && userDeviceId && devices.includes(userDeviceId)) {
      return true;
    }

    // Check province targeting
    if (provinces.length > 0 && userProvince && provinces.includes(userProvince)) {
      return true;
    }

    // Check city targeting
    if (cities.length > 0 && userCity && cities.includes(userCity)) {
      return true;
    }

    // Check user-specific targeting
    if (users.length > 0 && users.includes(userId)) {
      return true;
    }

    // Check group targeting
    if (groups.length > 0) {
      // "all" means everyone
      if (groups.includes('all')) {
        return true;
      }
      // Check if user's groups overlap with target groups
      if (userGroups && userGroups.length > 0) {
        const hasMatchingGroup = userGroups.some((userGroup) => groups.includes(userGroup));
        if (hasMatchingGroup) {
          return true;
        }
      }
    }

    // Check region targeting (region can be province or city)
    if (regions.length > 0) {
      // "all" means all regions
      if (regions.includes('all')) {
        return true;
      }
      // Check if user's region/province/city matches
      if (userRegion && regions.includes(userRegion)) {
        return true;
      }
      if (userProvince && regions.includes(userProvince)) {
        return true;
      }
      if (userCity && regions.includes(userCity)) {
        return true;
      }
    }

    // If no targeting specified, include for everyone (default behavior)
    if (
      groups.length === 0 && 
      regions.length === 0 && 
      users.length === 0 &&
      devices.length === 0 &&
      !targetNonRegistered &&
      provinces.length === 0 &&
      cities.length === 0
    ) {
      return true;
    }

    return false;
  } catch (error) {
    logger.error('Notification filtering error', {
      notificationEntry,
      userId,
      error: error.message,
    });
    // On error, exclude notification (fail-safe)
    return false;
  }
}

/**
 * Filter notification stream entries by user context
 * @param {Array} notificationEntries - Array of stream entries
 * @param {string} userId - User ID
 * @param {Array<string>} userGroups - User groups
 * @param {string} userRegion - User region
 * @param {string} userProvince - User province
 * @param {string} userCity - User city
 * @param {string} userDeviceId - User device ID
 * @param {boolean} isRegistered - Whether user is registered
 * @returns {Array} Filtered array of entries
 */
function filterNotifications(
  notificationEntries, 
  userId, 
  userGroups = [], 
  userRegion = null,
  userProvince = null,
  userCity = null,
  userDeviceId = null,
  isRegistered = true
) {
  if (!notificationEntries || notificationEntries.length === 0) {
    return [];
  }

  return notificationEntries.filter((entry) =>
    shouldIncludeNotification(
      entry, 
      userId, 
      userGroups, 
      userRegion,
      userProvince,
      userCity,
      userDeviceId,
      isRegistered
    )
  );
}

module.exports = {
  shouldIncludeNotification,
  filterNotifications,
};
