const { getRedisClient } = require('../services/redis/client');
const { logger } = require('../services/logger');

/**
 * Redis store adapter for express-rate-limit
 * Implements the store interface required by express-rate-limit
 */
class RedisRateLimitStore {
  constructor(options = {}) {
    this.prefix = options.prefix || 'ratelimit:';
    this.windowMs = options.windowMs || 60000; // Default 1 minute
    this.redis = null;
  }

  /**
   * Get Redis client (lazy initialization)
   */
  getRedis() {
    if (!this.redis) {
      try {
        this.redis = getRedisClient();
      } catch (error) {
        logger.error('Failed to get Redis client for rate limiting', {
          error: error.message,
        });
        return null;
      }
    }
    return this.redis;
  }

  /**
   * Increment request count for a key
   * Required by express-rate-limit v7
   * Returns Promise with {totalHits, resetTime}
   * @param {string} key - Rate limit key
   * @returns {Promise<{totalHits: number, resetTime: Date}>}
   */
  async increment(key) {
    const redis = this.getRedis();

    // If Redis unavailable, allow request (graceful degradation)
    if (!redis) {
      const resetTime = new Date(Date.now() + 60000); // 1 minute from now
      return {
        totalHits: 0,
        resetTime,
      };
    }

    try {
      const fullKey = `${this.prefix}${key}`;
      
      // Increment counter
      const count = await redis.incr(fullKey);
      
      // Get current TTL
      let ttl = await redis.ttl(fullKey);
      
      // If key is new (count === 1) or has no TTL, set TTL based on window
      if (count === 1 || ttl === -1) {
        // Set TTL based on windowMs (convert to seconds)
        const ttlSeconds = Math.ceil(this.windowMs / 1000);
        await redis.expire(fullKey, ttlSeconds);
        ttl = ttlSeconds;
      }

      // Calculate reset time
      const resetTime = new Date(Date.now() + (ttl * 1000));
      
      return {
        totalHits: count,
        resetTime,
      };
    } catch (error) {
      logger.error('Rate limit store increment error', {
        key,
        error: error.message,
      });
      // On error, allow request (graceful degradation)
      const resetTime = new Date(Date.now() + 60000);
      return {
        totalHits: 0,
        resetTime,
      };
    }
  }

  /**
   * Decrement request count (optional, not used by express-rate-limit by default)
   * @param {string} key - Rate limit key
   */
  async decrement(key) {
    const redis = this.getRedis();
    if (!redis) {
      return;
    }

    try {
      const fullKey = `${this.prefix}${key}`;
      await redis.decr(fullKey);
    } catch (error) {
      logger.error('Rate limit store decrement error', {
        key,
        error: error.message,
      });
    }
  }

  /**
   * Reset rate limit for a key
   * Required by express-rate-limit
   * @param {string} key - Rate limit key
   */
  async resetKey(key) {
    const redis = this.getRedis();
    if (!redis) {
      return;
    }

    try {
      const fullKey = `${this.prefix}${key}`;
      await redis.del(fullKey);
    } catch (error) {
      logger.error('Rate limit store resetKey error', {
        key,
        error: error.message,
      });
    }
  }

  /**
   * Shutdown store (cleanup) - required by express-rate-limit
   */
  async shutdown() {
    // Redis client is managed by singleton, no cleanup needed
  }
}

module.exports = RedisRateLimitStore;

