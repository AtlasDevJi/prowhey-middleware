const { trimStream, getStreamInfo } = require('../sync/stream-manager');
const { logger } = require('../logger');

// Default: keep last 7 days of entries
const RETENTION_DAYS = parseInt(process.env.SYNC_STREAM_RETENTION_DAYS || '7', 10);
const MAX_LENGTH = parseInt(process.env.STREAM_MAX_LENGTH || '10000', 10);

/**
 * Estimate max length based on retention days
 * Assumes average of 100 entries per day per stream
 * @param {number} days - Retention days
 * @returns {number} Estimated max length
 */
function estimateMaxLength(days) {
  return days * 100; // Conservative estimate
}

/**
 * Trim a single stream
 * @param {string} entityType - Entity type
 * @returns {Promise<object>} Trim result
 */
async function trimStreamByEntityType(entityType) {
  try {
    const streamInfo = await getStreamInfo(entityType);

    if (!streamInfo || streamInfo.length === 0) {
      return {
        entityType,
        trimmed: 0,
        length: 0,
      };
    }

    // Use configured max length or estimate based on retention days
    const maxLength = MAX_LENGTH || estimateMaxLength(RETENTION_DAYS);

    if (streamInfo.length <= maxLength) {
      return {
        entityType,
        trimmed: 0,
        length: streamInfo.length,
      };
    }

    const trimmed = await trimStream(entityType, maxLength);

    logger.info('Stream trimmed', {
      entityType,
      trimmed,
      length: streamInfo.length,
      maxLength,
    });

    return {
      entityType,
      trimmed,
      length: streamInfo.length - trimmed,
    };
  } catch (error) {
    logger.error('Stream trim error', {
      entityType,
      error: error.message,
    });
    return {
      entityType,
      trimmed: 0,
      error: error.message,
    };
  }
}

/**
 * Trim all streams
 * @param {Array<string>} entityTypes - Entity types to trim (optional, defaults to common types)
 * @returns {Promise<object>} Summary of trim operations
 */
async function trimAllStreams(entityTypes = null) {
  const defaultTypes = ['product', 'price', 'stock', 'notification', 'view', 'comment', 'user', 'hero', 'announcement'];

  const typesToTrim = entityTypes || defaultTypes;

  logger.info('Starting stream trimming', {
    entityTypes: typesToTrim,
    retentionDays: RETENTION_DAYS,
    maxLength: MAX_LENGTH,
  });

  const results = await Promise.all(
    typesToTrim.map((entityType) => trimStreamByEntityType(entityType))
  );

  const summary = {
    total: results.length,
    trimmed: results.reduce((sum, r) => sum + (r.trimmed || 0), 0),
    results,
    timestamp: new Date().toISOString(),
  };

  logger.info('Stream trimming completed', summary);
  return summary;
}

module.exports = {
  trimStreamByEntityType,
  trimAllStreams,
};
