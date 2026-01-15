const { logger } = require('../logger');

/**
 * Check if notification should be included for user
 * @param {object} notificationEntry - Stream entry with notification fields
 * @param {string} userId - User ID
 * @param {Array<string>} userGroups - User groups
 * @param {string} userRegion - User region
 * @returns {boolean} True if notification should be included
 */
function shouldIncludeNotification(notificationEntry, userId, userGroups = [], userRegion = null) {
  try {
    const { target_groups, target_regions, target_users } = notificationEntry.fields;

    // Parse arrays from stream entry (they come as strings)
    const groups = Array.isArray(target_groups) ? target_groups : JSON.parse(target_groups || '[]');
    const regions = Array.isArray(target_regions) ? target_regions : JSON.parse(target_regions || '[]');
    const users = Array.isArray(target_users) ? target_users : JSON.parse(target_users || '[]');

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

    // Check region targeting
    if (regions.length > 0) {
      // "all" means all regions
      if (regions.includes('all')) {
        return true;
      }
      // Check if user's region matches
      if (userRegion && regions.includes(userRegion)) {
        return true;
      }
    }

    // If no targeting specified, include for everyone (default behavior)
    if (groups.length === 0 && regions.length === 0 && users.length === 0) {
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
 * @returns {Array} Filtered array of entries
 */
function filterNotifications(notificationEntries, userId, userGroups = [], userRegion = null) {
  if (!notificationEntries || notificationEntries.length === 0) {
    return [];
  }

  return notificationEntries.filter((entry) =>
    shouldIncludeNotification(entry, userId, userGroups, userRegion)
  );
}

module.exports = {
  shouldIncludeNotification,
  filterNotifications,
};
