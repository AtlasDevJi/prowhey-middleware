const rateLimit = require('express-rate-limit');
const RedisRateLimitStore = require('./rate-limit-store');
const { logger } = require('../services/logger');
const { SecurityLogger } = require('../services/security-logger');

/**
 * Create rate limiter middleware with device ID-based limiting
 * @param {object} config - Rate limit configuration { windowMs, max }
 * @param {string} endpointType - Endpoint type for logging (optional)
 * @returns {Function} Express rate limit middleware
 */
function createRateLimiter(config, endpointType = 'unknown') {
  const { windowMs, max } = config;

  // Create Redis store instance with window configuration
  const store = new RedisRateLimitStore({
    prefix: 'ratelimit:',
    windowMs,
  });

  return rateLimit({
    windowMs,
    max,
    store,
    
    // Use device ID as key identifier (from req.deviceId set by device-id middleware)
    keyGenerator: (req) => {
      const deviceId = req.deviceId || 'unknown';
      const key = `${deviceId}:${endpointType}`;
      return key;
    },

    // Standard rate limit headers
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers (use standard instead)

    // Custom handler for rate limit exceeded
    handler: (req, res) => {
      const resetTime = req.rateLimit.resetTime
        ? Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
        : Math.ceil(windowMs / 1000);

      logger.warn('Rate limit exceeded', {
        deviceId: req.deviceId,
        endpointType,
        path: req.path,
        limit: max,
        remaining: 0,
      });

      // Security logging
      SecurityLogger.logRateLimitViolation(
        req.deviceId || 'unknown',
        req.path,
        req.ip
      );

      res.status(429).json({
        success: false,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: resetTime,
        limit: max,
        remaining: 0,
        reset: req.rateLimit.resetTime
          ? Math.floor(req.rateLimit.resetTime / 1000)
          : Math.floor(Date.now() / 1000) + resetTime,
      });

      // Set Retry-After header
      res.setHeader('Retry-After', resetTime);
    },

    // Skip successful requests (only count if needed)
    skipSuccessfulRequests: false,

    // Skip failed requests (don't count 4xx/5xx errors)
    skipFailedRequests: true,

    // On Redis store error, allow request (graceful degradation)
    skip: (_req) => {
      // This is handled in the store's increment method
      return false;
    },
  });
}

module.exports = {
  createRateLimiter,
};

