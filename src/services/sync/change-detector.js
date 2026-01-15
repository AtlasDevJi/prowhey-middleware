const { getCacheHash } = require('../redis/cache');
const { compareHashes } = require('./hash-computer');
const { logger } = require('../logger');

/**
 * Check if entity needs sync by comparing cached hash vs stream entry hash
 * @param {string} entityType - Entity type
 * @param {string} entityId - Entity ID
 * @param {string} streamDataHash - Data hash from stream entry
 * @returns {Promise<boolean>} True if entity needs sync (hashes differ or cache miss)
 */
async function needsSync(entityType, entityId, streamDataHash) {
  try {
    // Get cached entity with metadata
    const cached = await getCacheHash(entityType, entityId);

    // If cache miss, entity needs sync
    if (!cached) {
      logger.info('Change detected: cache miss', {
        entityType,
        entityId,
      });
      return true;
    }

    // Compare cached hash with stream entry hash
    const hashesMatch = compareHashes(cached.data_hash, streamDataHash);

    if (!hashesMatch) {
      logger.info('Change detected: hash mismatch', {
        entityType,
        entityId,
        cachedHash: cached.data_hash,
        streamHash: streamDataHash,
      });
      return true;
    }

    // Hashes match, no sync needed
    logger.debug('No change detected: hashes match', {
      entityType,
      entityId,
      hash: cached.data_hash,
    });
    return false;
  } catch (error) {
    logger.error('Change detection error', {
      entityType,
      entityId,
      error: error.message,
    });
    // On error, assume sync is needed (fail-safe)
    return true;
  }
}

/**
 * Filter stream entries to only those that need sync
 * @param {Array} streamEntries - Array of stream entries with {id, fields: {entity_type, entity_id, data_hash, ...}}
 * @returns {Promise<Array>} Filtered array of entries that need sync
 */
async function filterEntriesNeedingSync(streamEntries) {
  const entriesNeedingSync = [];

  for (const entry of streamEntries) {
    const { entity_type, entity_id, data_hash } = entry.fields;

    if (!entity_type || !entity_id || !data_hash) {
      logger.warn('Invalid stream entry, skipping', {
        entryId: entry.id,
        fields: entry.fields,
      });
      continue;
    }

    const needsUpdate = await needsSync(entity_type, entity_id, data_hash);
    if (needsUpdate) {
      entriesNeedingSync.push(entry);
    }
  }

  return entriesNeedingSync;
}

/**
 * Get entity data for sync response
 * Fetches cached entity data and includes metadata
 * If entity is deleted (hash indicates deletion), returns deletion marker
 * @param {string} entityType - Entity type
 * @param {string} entityId - Entity ID
 * @param {string} streamDataHash - Data hash from stream entry (to detect deletions)
 * @returns {Promise<object|null>} Entity data object with metadata, deletion marker, or null if not found
 */
async function getEntityForSync(entityType, entityId, streamDataHash = null) {
  try {
    const cached = await getCacheHash(entityType, entityId);

    // Check if this is a deletion marker (hash indicates deletion)
    if (streamDataHash) {
      const deletionMarker = { deleted: true, erpnext_name: entityId };
      const deletionHash = require('./hash-computer').computeDataHash(deletionMarker);
      
      if (streamDataHash === deletionHash) {
        // This is a deletion - return deletion marker
        return {
          entity_type: entityType,
          entity_id: entityId,
          deleted: true,
          updated_at: Date.now().toString(),
          version: cached?.version || '1',
          data_hash: streamDataHash,
        };
      }
    }

    // If cache doesn't exist and we have a stream entry, it might be a deletion
    if (!cached && streamDataHash) {
      const deletionMarker = { deleted: true, erpnext_name: entityId };
      const deletionHash = require('./hash-computer').computeDataHash(deletionMarker);
      
      if (streamDataHash === deletionHash) {
        return {
          entity_type: entityType,
          entity_id: entityId,
          deleted: true,
          updated_at: Date.now().toString(),
          version: '1',
          data_hash: streamDataHash,
        };
      }
    }

    if (!cached) {
      return null;
    }

    return {
      entity_type: entityType,
      entity_id: entityId,
      data: cached.data,
      updated_at: cached.updated_at,
      version: cached.version,
      data_hash: cached.data_hash,
    };
  } catch (error) {
    logger.error('Get entity for sync error', {
      entityType,
      entityId,
      error: error.message,
    });
    return null;
  }
}

module.exports = {
  needsSync,
  filterEntriesNeedingSync,
  getEntityForSync,
};
