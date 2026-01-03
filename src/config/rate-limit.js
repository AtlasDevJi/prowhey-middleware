/**
 * Rate limit configurations for different endpoint types
 * Limits are per device ID (not IP address)
 */

const RATE_LIMITS = {
  // Health check - very lenient for monitoring
  health: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
  },

  // Resource endpoints (products, queries) - moderate
  resource: {
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
  },

  // Analytics endpoints - stricter (user-generated content)
  analytics: {
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
  },

  // Management endpoints (price/stock updates) - very strict
  management: {
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute
  },

  // Webhooks - very strict, longer window
  webhooks: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // 100 requests per hour
  },
};

/**
 * Get rate limit configuration for endpoint type
 * @param {string} endpointType - Type of endpoint (health, resource, analytics, management, webhooks)
 * @returns {object} Rate limit configuration
 */
function getRateLimitConfig(endpointType) {
  return RATE_LIMITS[endpointType] || RATE_LIMITS.resource;
}

/**
 * Get all rate limit configurations
 * @returns {object} All rate limit configurations
 */
function getAllRateLimitConfigs() {
  return RATE_LIMITS;
}

module.exports = {
  RATE_LIMITS,
  getRateLimitConfig,
  getAllRateLimitConfigs,
};

