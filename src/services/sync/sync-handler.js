const { readMultipleStreams } = require('./stream-manager');
const { filterEntriesNeedingSync, getEntityForSync } = require('./change-detector');
const { filterNotifications } = require('../notifications/notification-filter');
const { filterMessages } = require('../messaging/message-filter');
const { logger } = require('../logger');

/**
 * Entity type frequency mapping
 */
const ENTITY_FREQUENCIES = {
  fast: ['view', 'comment', 'user'], // High-frequency (5-15 min)
  medium: ['stock', 'notification', 'announcement', 'message'], // Medium-frequency (hourly)
  slow: ['product', 'price', 'hero', 'home', 'bundle'], // Low-frequency (daily or on-demand)
};

/**
 * Process sync request for specific entity types
 * @param {Object<string, string>} lastSync - Object mapping entityType to last stream ID
 * @param {Array<string>} entityTypes - Entity types to check (optional, filters results)
 * @param {number} limit - Maximum entries per stream
 * @param {string} userId - User ID for notification filtering
 * @param {Array<string>} userGroups - User groups for notification filtering
 * @param {string} userRegion - User region for notification filtering
 * @param {string} userProvince - User province for notification filtering
 * @param {string} userCity - User city for notification filtering
 * @param {string} userDeviceId - User device ID for notification filtering
 * @param {boolean} isRegistered - Whether user is registered
 * @returns {Promise<object>} Sync response with updates or inSync flag
 */
async function processSync(
  lastSync = {}, 
  entityTypes = null, 
  limit = 100,
  userId = null,
  userGroups = [],
  userRegion = null,
  userProvince = null,
  userCity = null,
  userDeviceId = null,
  isRegistered = true
) {
  try {
    // Build streamsToCheck: if entityTypes specified, use them (with '0-0' if no lastSync), otherwise use all from lastSync
    let streamsToCheck = {};
    
    if (entityTypes && Array.isArray(entityTypes) && entityTypes.length > 0) {
      // For each requested entity type, use lastSync value or '0-0' (read from beginning)
      for (const entityType of entityTypes) {
        streamsToCheck[entityType] = lastSync[entityType] || '0-0';
      }
    } else {
      // No entityTypes filter: use all from lastSync, or if empty, return inSync
      if (Object.keys(lastSync).length === 0) {
        return { inSync: true };
      }
      streamsToCheck = lastSync;
    }

    // If no streams to check, return inSync
    if (Object.keys(streamsToCheck).length === 0) {
      return { inSync: true };
    }

    // Read streams since last IDs
    const streamsData = await readMultipleStreams(streamsToCheck, limit);

    // Collect all entries that need sync
    const updates = [];
    const lastIds = { ...lastSync };

    for (const [entityType, entries] of Object.entries(streamsData)) {
      if (!entries || entries.length === 0) {
        continue;
      }

      // For notifications and messages, apply user-based filtering first
      let entriesToProcess = entries;
      if (entityType === 'notification' && userId) {
        entriesToProcess = filterNotifications(
          entries,
          userId,
          userGroups,
          userRegion,
          userProvince,
          userCity,
          userDeviceId,
          isRegistered
        );
      } else if (entityType === 'message' && userId) {
        // Filter messages by userId (messages are user-scoped)
        entriesToProcess = await filterMessages(entries, userId);
      }

      // Filter entries that actually need sync (hash comparison)
      const entriesNeedingSync = await filterEntriesNeedingSync(entriesToProcess);

      // Get entity data for each entry that needs sync
      for (const entry of entriesNeedingSync) {
        const { entity_id, idempotency_key, data_hash } = entry.fields;

        // Get entity data from cache (pass data_hash to detect deletions)
        const entityData = await getEntityForSync(entityType, entity_id, data_hash);

        if (entityData) {
          updates.push({
            ...entityData,
            idempotency_key: idempotency_key || null,
          });
        }

        // Update last ID for this stream
        lastIds[entityType] = entry.id;
      }

      // If we processed entries but none needed sync, update last ID to latest
      if (entriesToProcess.length > 0 && entriesNeedingSync.length === 0) {
        const lastEntry = entriesToProcess[entriesToProcess.length - 1];
        lastIds[entityType] = lastEntry.id;
      } else if (entries.length > 0 && entriesNeedingSync.length === 0) {
        // Fallback: if no entries to process but we had entries, update to latest
        const lastEntry = entries[entries.length - 1];
        lastIds[entityType] = lastEntry.id;
      }
    }

    // If no updates, return inSync
    if (updates.length === 0) {
      return { inSync: true };
    }

    return {
      inSync: false,
      updates,
      lastIds,
    };
  } catch (error) {
    logger.error('Sync processing error', {
      lastSync,
      entityTypes,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Process sync request for fast-frequency entities
 * @param {Object<string, string>} lastSync - Last sync IDs
 * @param {number} limit - Max entries per stream
 * @returns {Promise<object>} Sync response
 */
async function processFastSync(lastSync = {}, limit = 100) {
  const fastTypes = ENTITY_FREQUENCIES.fast;
  const filteredLastSync = {};

  // Filter lastSync to only fast-frequency types
  for (const entityType of fastTypes) {
    if (lastSync[`${entityType}_changes`]) {
      filteredLastSync[entityType] = lastSync[`${entityType}_changes`];
    } else if (lastSync[entityType]) {
      filteredLastSync[entityType] = lastSync[entityType];
    }
  }

  return await processSync(filteredLastSync, fastTypes, limit);
}

/**
 * Process sync request for medium-frequency entities
 * @param {Object<string, string>} lastSync - Last sync IDs
 * @param {number} limit - Max entries per stream
 * @param {string} userId - User ID for notification filtering
 * @param {Array<string>} userGroups - User groups for notification filtering
 * @param {string} userRegion - User region for notification filtering
 * @param {string} userProvince - User province for notification filtering
 * @param {string} userCity - User city for notification filtering
 * @param {string} userDeviceId - User device ID for notification filtering
 * @param {boolean} isRegistered - Whether user is registered
 * @returns {Promise<object>} Sync response
 */
async function processMediumSync(
  lastSync = {}, 
  limit = 100,
  userId = null,
  userGroups = [],
  userRegion = null,
  userProvince = null,
  userCity = null,
  userDeviceId = null,
  isRegistered = true
) {
  const mediumTypes = ENTITY_FREQUENCIES.medium;
  const filteredLastSync = {};

  // Filter lastSync to only medium-frequency types
  for (const entityType of mediumTypes) {
    if (lastSync[`${entityType}_changes`]) {
      filteredLastSync[entityType] = lastSync[`${entityType}_changes`];
    } else if (lastSync[entityType]) {
      filteredLastSync[entityType] = lastSync[entityType];
    }
  }

  return await processSync(
    filteredLastSync, 
    mediumTypes, 
    limit,
    userId,
    userGroups,
    userRegion,
    userProvince,
    userCity,
    userDeviceId,
    isRegistered
  );
}

/**
 * Process sync request for slow-frequency entities
 * @param {Object<string, string>} lastSync - Last sync IDs
 * @param {number} limit - Max entries per stream
 * @returns {Promise<object>} Sync response
 */
async function processSlowSync(lastSync = {}, limit = 100) {
  const slowTypes = ENTITY_FREQUENCIES.slow;
  const filteredLastSync = {};

  // Filter lastSync to only slow-frequency types
  for (const entityType of slowTypes) {
    if (lastSync[`${entityType}_changes`]) {
      filteredLastSync[entityType] = lastSync[`${entityType}_changes`];
    } else if (lastSync[entityType]) {
      filteredLastSync[entityType] = lastSync[entityType];
    }
  }

  return await processSync(filteredLastSync, slowTypes, limit);
}

module.exports = {
  processSync,
  processFastSync,
  processMediumSync,
  processSlowSync,
  ENTITY_FREQUENCIES,
};
