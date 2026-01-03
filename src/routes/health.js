const express = require('express');
const { performHealthCheck } = require('../services/health/health');
const { logger } = require('../services/logger');

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

module.exports = router;

