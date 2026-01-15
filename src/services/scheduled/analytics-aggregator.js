const cron = require('node-cron');
const { aggregateDailyEvents, cleanupExpiredEvents } = require('../analytics/aggregator');
const { logger } = require('../logger');

// Default: Daily at midnight (00:00)
const DEFAULT_HOUR = parseInt(process.env.ANALYTICS_AGGREGATION_HOUR || '0', 10);
const DEFAULT_MINUTE = parseInt(process.env.ANALYTICS_AGGREGATION_MINUTE || '0', 10);

/**
 * Build cron expression for analytics aggregation
 * @param {number} hour - Hour (0-23)
 * @param {number} minute - Minute (0-59)
 * @returns {string} Cron expression
 */
function buildCronExpression(hour, minute) {
  // Cron format: second minute hour day-of-month month day-of-week
  // node-cron uses: minute hour day-of-month month day-of-week
  return `${minute} ${hour} * * *`;
}

let scheduledTask = null;

/**
 * Run analytics aggregation for a specific date
 * @param {string} date - Date in YYYY-MM-DD format (defaults to 31 days ago)
 */
async function runAggregation(date = null) {
  try {
    // Calculate date to aggregate (31 days ago by default)
    if (!date) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - 31);
      date = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD
    }

    logger.info('Starting analytics aggregation', { date });

    // Aggregate events for the date
    const aggregationResult = await aggregateDailyEvents(date);

    // Cleanup expired events after aggregation
    const deletedCount = await cleanupExpiredEvents(date);

    logger.info('Analytics aggregation completed', {
      date,
      searchEvents: aggregationResult.searchEvents,
      interactionEvents: aggregationResult.interactionEvents,
      sessionEvents: aggregationResult.sessionEvents,
      deletedCount,
    });

    return {
      date,
      aggregationResult,
      deletedCount,
    };
  } catch (error) {
    logger.error('Analytics aggregation failed', {
      date,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Start scheduled analytics aggregation
 * Runs daily at configured hour/minute
 */
function startScheduledAggregation() {
  if (scheduledTask) {
    logger.warn('Analytics aggregation scheduler already running');
    return;
  }

  const cronExpression = buildCronExpression(DEFAULT_HOUR, DEFAULT_MINUTE);

  logger.info('Starting analytics aggregation scheduler', {
    cronExpression,
    hour: DEFAULT_HOUR,
    minute: DEFAULT_MINUTE,
  });

  scheduledTask = cron.schedule(cronExpression, async () => {
    logger.info('Scheduled analytics aggregation triggered');
    try {
      await runAggregation();
    } catch (error) {
      logger.error('Scheduled analytics aggregation failed', {
        error: error.message,
        stack: error.stack,
      });
    }
  });

  return scheduledTask;
}

/**
 * Stop scheduled analytics aggregation
 */
function stopScheduledAggregation() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('Analytics aggregation scheduler stopped');
  }
}

module.exports = {
  startScheduledAggregation,
  stopScheduledAggregation,
  runAggregation,
};
