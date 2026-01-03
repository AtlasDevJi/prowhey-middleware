const { getRedisClient } = require('./client');
const { getCacheKey, getQueryCacheKey } = require('../../utils/data-types');
const { logger } = require('../logger');
const { getEntityTTL, getQueryTTL } = require('../../config/cache');

/**
 * Get cached entity from Redis (stored as JSON string)
 * Returns transformed app-ready data
 */
async function getCache(entityType, entityId) {
  try {
    const redis = getRedisClient();
    const cacheKey = getCacheKey(entityType, entityId);
    const data = await redis.get(cacheKey);

    if (!data) {
      return null;
    }

    // Parse JSON string to object
    return JSON.parse(data);
  } catch (error) {
    logger.error('Cache get error', {
      entityType,
      entityId,
      error: error.message,
    });
    return null;
  }
}

/**
 * Set cached entity in Redis as JSON string with TTL
 * Data should already be transformed to app-ready format
 */
async function setCache(entityType, entityId, data) {
  try {
    const redis = getRedisClient();
    const cacheKey = getCacheKey(entityType, entityId);
    const ttl = getEntityTTL(entityType);

    if (!data || typeof data !== 'object') {
      return false;
    }

    // Store as JSON string
    const jsonString = JSON.stringify(data);
    await redis.setex(cacheKey, ttl, jsonString);

    return true;
  } catch (error) {
    logger.error('Cache set error', {
      entityType,
      entityId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Delete cached entity
 */
async function deleteCache(entityType, entityId) {
  try {
    const redis = getRedisClient();
    const cacheKey = getCacheKey(entityType, entityId);
    const result = await redis.del(cacheKey);
    return result > 0;
  } catch (error) {
    logger.error('Cache delete error', {
      entityType,
      entityId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Partial update of cached entity
 * Merges updates with existing cached data
 */
async function updateCache(entityType, entityId, updates) {
  try {
    const redis = getRedisClient();
    const cacheKey = getCacheKey(entityType, entityId);
    const ttl = getEntityTTL(entityType);

    // Get existing data
    const existing = await getCache(entityType, entityId);
    if (!existing) {
      return false;
    }

    // Merge updates
    const updated = { ...existing, ...updates };

    // Store updated data
    const jsonString = JSON.stringify(updated);
    await redis.setex(cacheKey, ttl, jsonString);

    return true;
  } catch (error) {
    logger.error('Cache update error', {
      entityType,
      entityId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Get cached query result
 */
async function getQueryCache(entityType, queryHash) {
  try {
    const redis = getRedisClient();
    const cacheKey = getQueryCacheKey(entityType, queryHash);
    const data = await redis.get(cacheKey);

    if (!data) {
      return null;
    }

    return JSON.parse(data);
  } catch (error) {
    logger.error('Query cache get error', {
      entityType,
      queryHash,
      error: error.message,
    });
    return null;
  }
}

/**
 * Set cached query result with TTL
 */
async function setQueryCache(entityType, queryHash, data) {
  try {
    const redis = getRedisClient();
    const cacheKey = getQueryCacheKey(entityType, queryHash);
    const ttl = getQueryTTL(entityType);

    await redis.setex(cacheKey, ttl, JSON.stringify(data));
    return true;
  } catch (error) {
    logger.error('Query cache set error', {
      entityType,
      queryHash,
      error: error.message,
    });
    return false;
  }
}

/**
 * Delete cached query result
 */
async function deleteQueryCache(entityType, queryHash) {
  try {
    const redis = getRedisClient();
    const cacheKey = getQueryCacheKey(entityType, queryHash);
    const result = await redis.del(cacheKey);
    return result > 0;
  } catch (error) {
    logger.error('Query cache delete error', {
      entityType,
      queryHash,
      error: error.message,
    });
    return false;
  }
}

/**
 * Check if cache exists
 */
async function cacheExists(entityType, entityId) {
  try {
    const redis = getRedisClient();
    const cacheKey = getCacheKey(entityType, entityId);
    const exists = await redis.exists(cacheKey);
    return exists === 1;
  } catch (error) {
    logger.error('Cache exists check error', {
      entityType,
      entityId,
      error: error.message,
    });
    return false;
  }
}

module.exports = {
  getCache,
  setCache,
  deleteCache,
  updateCache,
  getQueryCache,
  setQueryCache,
  deleteQueryCache,
  cacheExists,
};

