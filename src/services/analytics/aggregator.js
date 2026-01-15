const { getRedisClient } = require('../redis/client');
const { logger } = require('../logger');

/**
 * Aggregate daily events to summaries
 * Processes events from a specific date and creates daily aggregates
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<object>} Aggregation summary
 */
async function aggregateDailyEvents(date) {
  try {
    const redis = getRedisClient();
    const results = {
      date,
      searchEvents: 0,
      interactionEvents: 0,
      sessionEvents: 0,
      aggregated: {
        searches: {},
        interactions: {},
        sessions: {},
      },
    };

    // Aggregate search events
    const searchPattern = `events:search:${date}:*`;
    const searchKeys = await redis.keys(searchPattern);
    results.searchEvents = searchKeys.length;

    const searchAggregates = {};
    for (const key of searchKeys) {
      try {
        const eventData = await redis.get(key);
        if (eventData) {
          const event = JSON.parse(eventData);
          const normalizedTerm = event.term || '';
          
          if (!searchAggregates[normalizedTerm]) {
            searchAggregates[normalizedTerm] = {
              count: 0,
              totalResults: 0,
              totalClicks: 0,
            };
          }
          
          searchAggregates[normalizedTerm].count++;
          searchAggregates[normalizedTerm].totalResults += event.results_count || 0;
          searchAggregates[normalizedTerm].totalClicks += (event.clicked_results || []).length;
        }
      } catch (parseError) {
        logger.warn('Failed to parse search event during aggregation', {
          key,
          error: parseError.message,
        });
      }
    }

    // Store search aggregates
    for (const [term, aggregate] of Object.entries(searchAggregates)) {
      const aggregateKey = `search:aggregate:${date}:${term}`;
      await redis.set(aggregateKey, JSON.stringify(aggregate));
      results.aggregated.searches[term] = aggregate;
    }

    // Aggregate interaction events
    const interactionPattern = `events:interaction:${date}:*`;
    const interactionKeys = await redis.keys(interactionPattern);
    results.interactionEvents = interactionKeys.length;

    const interactionAggregates = {};
    for (const key of interactionKeys) {
      try {
        const eventData = await redis.get(key);
        if (eventData) {
          const event = JSON.parse(eventData);
          const type = event.type || '';
          const productName = event.product_name || '';
          const aggregateKey = `${type}:${productName}`;
          
          if (!interactionAggregates[aggregateKey]) {
            interactionAggregates[aggregateKey] = {
              type,
              productName,
              count: 0,
            };
          }
          
          interactionAggregates[aggregateKey].count++;
        }
      } catch (parseError) {
        logger.warn('Failed to parse interaction event during aggregation', {
          key,
          error: parseError.message,
        });
      }
    }

    // Store interaction aggregates
    for (const [key, aggregate] of Object.entries(interactionAggregates)) {
      const aggregateKey = `interaction:aggregate:${date}:${key}`;
      await redis.set(aggregateKey, JSON.stringify(aggregate));
      results.aggregated.interactions[key] = aggregate;
    }

    // Aggregate session events
    const sessionPattern = `events:session:${date}:*`;
    const sessionKeys = await redis.keys(sessionPattern);
    results.sessionEvents = sessionKeys.length;

    const sessionAggregates = {};
    for (const key of sessionKeys) {
      try {
        const eventData = await redis.get(key);
        if (eventData) {
          const session = JSON.parse(eventData);
          const userId = session.userId || 'anonymous';
          
          if (!sessionAggregates[userId]) {
            sessionAggregates[userId] = {
              userId,
              totalDuration: 0,
              sessionCount: 0,
            };
          }
          
          if (session.duration) {
            sessionAggregates[userId].totalDuration += session.duration;
          }
          if (session.endTime) {
            sessionAggregates[userId].sessionCount++;
          }
        }
      } catch (parseError) {
        logger.warn('Failed to parse session event during aggregation', {
          key,
          error: parseError.message,
        });
      }
    }

    // Store session aggregates
    for (const [userId, aggregate] of Object.entries(sessionAggregates)) {
      const aggregateKey = `session:aggregate:${date}:${userId}`;
      await redis.set(aggregateKey, JSON.stringify(aggregate));
      results.aggregated.sessions[userId] = aggregate;
    }

    logger.info('Daily events aggregated', {
      date,
      searchEvents: results.searchEvents,
      interactionEvents: results.interactionEvents,
      sessionEvents: results.sessionEvents,
    });

    return results;
  } catch (error) {
    logger.error('Failed to aggregate daily events', {
      date,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Cleanup expired events after aggregation
 * Removes detailed event keys older than 30 days
 * @param {string} date - Date in YYYY-MM-DD format (date to clean up)
 * @returns {Promise<number>} Number of keys deleted
 */
async function cleanupExpiredEvents(date) {
  try {
    const redis = getRedisClient();
    let deletedCount = 0;

    // Cleanup search events
    const searchPattern = `events:search:${date}:*`;
    const searchKeys = await redis.keys(searchPattern);
    if (searchKeys.length > 0) {
      await redis.del(...searchKeys);
      deletedCount += searchKeys.length;
    }

    // Cleanup interaction events
    const interactionPattern = `events:interaction:${date}:*`;
    const interactionKeys = await redis.keys(interactionPattern);
    if (interactionKeys.length > 0) {
      await redis.del(...interactionKeys);
      deletedCount += interactionKeys.length;
    }

    // Cleanup session events
    const sessionPattern = `events:session:${date}:*`;
    const sessionKeys = await redis.keys(sessionPattern);
    if (sessionKeys.length > 0) {
      await redis.del(...sessionKeys);
      deletedCount += sessionKeys.length;
    }

    logger.info('Expired events cleaned up', {
      date,
      deletedCount,
    });

    return deletedCount;
  } catch (error) {
    logger.error('Failed to cleanup expired events', {
      date,
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  aggregateDailyEvents,
  cleanupExpiredEvents,
};
