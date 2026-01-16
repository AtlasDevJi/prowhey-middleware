const { getCacheHash } = require('../redis/cache');
const { logger } = require('../logger');

/**
 * Filter message stream entries by userId
 * Messages are user-scoped, so we need to check the actual message data to filter by userId
 * @param {Array} messageEntries - Array of stream entries with {id, fields: {entity_type, entity_id, data_hash, ...}}
 * @param {string} userId - User ID to filter by
 * @returns {Promise<Array>} Filtered array of entries where message.userId matches userId
 */
async function filterMessages(messageEntries, userId) {
  if (!messageEntries || messageEntries.length === 0) {
    return [];
  }

  if (!userId) {
    logger.warn('filterMessages called without userId, returning empty array');
    return [];
  }

  const filteredEntries = [];

  for (const entry of messageEntries) {
    try {
      const { entity_id } = entry.fields;

      if (!entity_id) {
        logger.warn('Message entry missing entity_id', { entryId: entry.id });
        continue;
      }

      // Get message data to check userId
      const cached = await getCacheHash('message', entity_id);
      if (!cached) {
        // Message not found in cache, skip it
        continue;
      }

      const message = cached.data;

      // Filter by userId (messages are user-scoped)
      if (message.userId === userId && !message.deleted) {
        filteredEntries.push(entry);
      }
    } catch (error) {
      logger.error('Error filtering message entry', {
        entryId: entry.id,
        userId,
        error: error.message,
      });
      // Continue processing other entries
      continue;
    }
  }

  return filteredEntries;
}

module.exports = {
  filterMessages,
};
