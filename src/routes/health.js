const express = require('express');
const { performHealthCheck } = require('../services/health/health');
const { getStreamInfo } = require('../services/sync/stream-manager');
const { logger } = require('../services/logger');
const { handleAsyncErrors } = require('../utils/error-utils');

const router = express.Router();

/**
 * GET /health
 * Comprehensive health check endpoint
 * Returns status of all components (Redis, ERPNext) and system metrics
 * Always returns 200 OK - let monitoring systems determine health from component statuses
 */
router.get('/', async (req, res) => {
  try {
    const health = await performHealthCheck();
    
    // Log health check if degraded or unhealthy
    if (health.status === 'degraded' || health.status === 'unhealthy') {
      logger.warn('Health check indicates degraded or unhealthy status', {
        status: health.status,
        components: health.components,
      });
    }
    
    return res.json(health);
  } catch (error) {
    logger.error('Health check failed', {
      error: error.message,
      stack: error.stack,
    });
    
    // Return error status but still 200 OK
    return res.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      error: 'Health check processing failed',
      message: error.message,
    });
  }
});

/**
 * GET /health/sync-status
 * Sync status endpoint showing stream lengths, last IDs, and sync metrics
 */
router.get(
  '/sync-status',
  handleAsyncErrors(async (req, res) => {
    try {
      const entityTypes = ['product', 'price', 'stock', 'notification', 'view', 'comment', 'user', 'hero', 'announcement'];
      const streams = {};

      // Get stream info for each entity type
      for (const entityType of entityTypes) {
        const info = await getStreamInfo(entityType);
        if (info) {
          streams[`${entityType}_changes`] = {
            length: info.length,
            firstId: info.firstId,
            lastId: info.lastId,
          };
        }
      }

      return res.json({
        timestamp: new Date().toISOString(),
        streams,
      });
    } catch (error) {
      logger.error('Sync status check failed', {
        error: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        error: 'Sync status check failed',
        message: error.message,
      });
    }
  })
);

module.exports = router;

