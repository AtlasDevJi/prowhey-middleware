const cron = require('node-cron');
const { performFullRefresh } = require('../sync/full-refresh');
const { logger } = require('../logger');

// Default: Saturday at 6 AM (day 6, hour 6)
const DEFAULT_DAY = parseInt(process.env.SYNC_FULL_REFRESH_DAY || '6', 10);
const DEFAULT_HOUR = parseInt(process.env.SYNC_FULL_REFRESH_HOUR || '6', 10);

/**
 * Build cron expression for full refresh
 * @param {number} day - Day of week (0-6, 0=Sunday)
 * @param {number} hour - Hour (0-23)
 * @returns {string} Cron expression
 */
function buildCronExpression(day, hour) {
  // Cron format: second minute hour day-of-month month day-of-week
  // node-cron uses: minute hour day-of-month month day-of-week
  // Day 0 = Sunday, so we need to adjust
  return `${0} ${hour} * * ${day}`;
}

let scheduledTask = null;

/**
 * Start scheduled full refresh
 * Runs weekly at configured day/hour
 */
function startScheduledFullRefresh() {
  if (scheduledTask) {
    logger.warn('Full refresh scheduler already running');
    return;
  }

  const cronExpression = buildCronExpression(DEFAULT_DAY, DEFAULT_HOUR);

  logger.info('Starting full refresh scheduler', {
    cronExpression,
    day: DEFAULT_DAY,
    hour: DEFAULT_HOUR,
  });

  scheduledTask = cron.schedule(cronExpression, async () => {
    logger.info('Scheduled full refresh triggered');
    try {
      const summary = await performFullRefresh();
      logger.info('Scheduled full refresh completed', summary);
    } catch (error) {
      logger.error('Scheduled full refresh failed', {
        error: error.message,
        stack: error.stack,
      });
    }
  });

  return scheduledTask;
}

/**
 * Stop scheduled full refresh
 */
function stopScheduledFullRefresh() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('Full refresh scheduler stopped');
  }
}

module.exports = {
  startScheduledFullRefresh,
  stopScheduledFullRefresh,
};
