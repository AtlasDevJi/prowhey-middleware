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
    
    // Use setex only if TTL > 0, otherwise use set (persistent)
    if (ttl > 0) {
      await redis.setex(cacheKey, ttl, jsonString);
    } else {
      await redis.set(cacheKey, jsonString);
    }

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
    
    // Use setex only if TTL > 0, otherwise use set (persistent)
    if (ttl > 0) {
      await redis.setex(cacheKey, ttl, jsonString);
    } else {
      await redis.set(cacheKey, jsonString);
    }

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
 * Delete cached hash entity
 * Removes both the hash key and the simple cache key
 */
async function deleteCacheHash(entityType, entityId) {
  try {
    const redis = getRedisClient();
    const hashKey = `hash:${getCacheKey(entityType, entityId)}`;
    const simpleKey = getCacheKey(entityType, entityId);
    
    // Log deletion for debugging (especially to track unexpected deletions)
    logger.warn('Deleting cache hash', {
      entityType,
      entityId,
      hashKey,
      simpleKey,
      stack: new Error().stack, // Include stack trace to see where it's called from
    });
    
    // Delete both hash and simple cache
    const results = await redis.del(hashKey, simpleKey);
    return results > 0;
  } catch (error) {
    logger.error('Hash cache delete error', {
      entityType,
      entityId,
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

/**
 * Get price from Redis cache
 * Key format: price:{erpnextName}:{sizeUnit}
 * Returns price as number or null if not found
 */
async function getPrice(erpnextName, sizeUnit) {
  try {
    const redis = getRedisClient();
    const key = `price:${erpnextName}:${sizeUnit}`;
    const price = await redis.get(key);
    
    if (!price) {
      return null;
    }
    
    return parseFloat(price);
  } catch (error) {
    logger.error('Price get error', {
      erpnextName,
      sizeUnit,
      error: error.message,
    });
    return null;
  }
}

/**
 * Set price in Redis cache
 * Key format: price:{erpnextName}:{sizeUnit}
 * No TTL - prices persist until updated
 */
async function setPrice(erpnextName, sizeUnit, price) {
  try {
    const redis = getRedisClient();
    const key = `price:${erpnextName}:${sizeUnit}`;
    
    // Store as string (Redis stores numbers as strings)
    await redis.set(key, String(price));
    
    return true;
  } catch (error) {
    logger.error('Price set error', {
      erpnextName,
      sizeUnit,
      price,
      error: error.message,
    });
    return false;
  }
}

/**
 * Get stock availability array for an item_code
 * Key format: availability:{itemCode}
 * Returns array of 0s and 1s or null if not found
 */
async function getStockAvailability(itemCode) {
  try {
    const redis = getRedisClient();
    const key = `availability:${itemCode}`;
    const data = await redis.get(key);
    
    if (!data) {
      return null;
    }
    
    return JSON.parse(data);
  } catch (error) {
    logger.error('Stock availability get error', {
      itemCode,
      error: error.message,
    });
    return null;
  }
}

/**
 * Set stock availability array for an item_code
 * Key format: availability:{itemCode}
 * No TTL - availability persists until updated
 */
async function setStockAvailability(itemCode, availabilityArray) {
  try {
    const redis = getRedisClient();
    const key = `availability:${itemCode}`;
    
    // Store as JSON string
    await redis.set(key, JSON.stringify(availabilityArray));
    
    return true;
  } catch (error) {
    logger.error('Stock availability set error', {
      itemCode,
      availabilityArray,
      error: error.message,
    });
    return false;
  }
}

/**
 * Get warehouse reference array
 * Key: warehouses:reference
 * Returns array of warehouse names in alphabetical order
 */
async function getWarehouseReference() {
  try {
    const redis = getRedisClient();
    const key = 'warehouses:reference';
    const data = await redis.get(key);
    
    if (!data) {
      return null;
    }
    
    return JSON.parse(data);
  } catch (error) {
    logger.error('Warehouse reference get error', {
      error: error.message,
    });
    return null;
  }
}

/**
 * Set warehouse reference array
 * Key: warehouses:reference
 * No TTL - reference persists until updated
 */
async function setWarehouseReference(warehouseArray) {
  try {
    const redis = getRedisClient();
    const key = 'warehouses:reference';
    
    // Store as JSON string
    await redis.set(key, JSON.stringify(warehouseArray));
    
    return true;
  } catch (error) {
    logger.error('Warehouse reference set error', {
      warehouseArray,
      error: error.message,
    });
    return false;
  }
}

/**
 * Get item price array for an item_code
 * Key format: price:{itemCode}
 * Returns array [retail, wholesale] or null if not found
 */
async function getItemPrice(itemCode) {
  try {
    const redis = getRedisClient();
    const key = `price:${itemCode}`;
    const data = await redis.get(key);
    
    if (!data) {
      return null;
    }
    
    return JSON.parse(data);
  } catch (error) {
    logger.error('Item price get error', {
      itemCode,
      error: error.message,
    });
    return null;
  }
}

/**
 * Set item price array for an item_code
 * Key format: price:{itemCode}
 * No TTL - prices persist until updated
 * Format: [retail_price, wholesale_price]
 */
async function setItemPrice(itemCode, priceArray) {
  try {
    const redis = getRedisClient();
    const key = `price:${itemCode}`;
    
    // Store as JSON string
    await redis.set(key, JSON.stringify(priceArray));
    
    return true;
  } catch (error) {
    logger.error('Item price set error', {
      itemCode,
      priceArray,
      error: error.message,
    });
    return false;
  }
}

/**
 * Set cached entity using Redis Hash structure with metadata
 * Stores data as JSON string in 'data' field, plus metadata fields
 * @param {string} entityType - Entity type (e.g., 'product', 'price', 'stock')
 * @param {string} entityId - Entity ID
 * @param {object} data - Data object to store (will be JSON stringified)
 * @param {object} metadata - Metadata object with data_hash, updated_at, version
 * @returns {Promise<boolean>} Success status
 */
async function setCacheHash(entityType, entityId, data, metadata = {}) {
  try {
    const redis = getRedisClient();
    // Use separate key namespace for hash-based cache to avoid clashing with simple string keys
    const cacheKey = `hash:${getCacheKey(entityType, entityId)}`;
    const ttl = getEntityTTL(entityType);

    if (!data || typeof data !== 'object') {
      return false;
    }

    // Prepare hash fields
    const hashFields = {
      data: JSON.stringify(data),
      data_hash: metadata.data_hash || '',
      updated_at: metadata.updated_at || Date.now().toString(),
      version: metadata.version || '1',
    };

    // Set hash fields
    await redis.hset(cacheKey, hashFields);

    // Set TTL on the hash key (only if TTL > 0, otherwise persistent)
    // If TTL is 0, explicitly remove any existing TTL to ensure persistence
    if (ttl > 0) {
      await redis.expire(cacheKey, ttl);
    } else {
      // Remove any existing TTL to ensure key is persistent
      await redis.persist(cacheKey);
    }

    return true;
  } catch (error) {
    logger.error('Cache hash set error', {
      entityType,
      entityId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Get cached entity from Redis Hash structure
 * Returns object with data and metadata fields
 * @param {string} entityType - Entity type
 * @param {string} entityId - Entity ID
 * @returns {Promise<object|null>} Object with {data, data_hash, updated_at, version} or null
 */
async function getCacheHash(entityType, entityId) {
  try {
    const redis = getRedisClient();
    const cacheKey = `hash:${getCacheKey(entityType, entityId)}`;
    const hashData = await redis.hgetall(cacheKey);

    if (!hashData || !hashData.data) {
      return null;
    }

    return {
      data: JSON.parse(hashData.data),
      data_hash: hashData.data_hash || '',
      updated_at: hashData.updated_at || '',
      version: hashData.version || '1',
    };
  } catch (error) {
    logger.error('Cache hash get error', {
      entityType,
      entityId,
      error: error.message,
    });
    return null;
  }
}

/**
 * Get only the data field from Redis Hash (for backward compatibility)
 * @param {string} entityType - Entity type
 * @param {string} entityId - Entity ID
 * @returns {Promise<object|null>} Parsed data object or null
 */
async function getCacheHashData(entityType, entityId) {
  try {
    const hashData = await getCacheHash(entityType, entityId);
    return hashData ? hashData.data : null;
  } catch (error) {
    logger.error('Cache hash data get error', {
      entityType,
      entityId,
      error: error.message,
    });
    return null;
  }
}

/**
 * Update cache hash metadata fields only (preserves data)
 * @param {string} entityType - Entity type
 * @param {string} entityId - Entity ID
 * @param {object} metadata - Metadata fields to update (data_hash, updated_at, version)
 * @returns {Promise<boolean>} Success status
 */
async function updateCacheHashMetadata(entityType, entityId, metadata) {
  try {
    const redis = getRedisClient();
    const cacheKey = `hash:${getCacheKey(entityType, entityId)}`;

    // Check if hash exists
    const exists = await redis.exists(cacheKey);
    if (!exists) {
      return false;
    }

    // Update only specified metadata fields
    const updates = {};
    if (metadata.data_hash !== undefined) updates.data_hash = metadata.data_hash;
    if (metadata.updated_at !== undefined) updates.updated_at = metadata.updated_at;
    if (metadata.version !== undefined) updates.version = metadata.version;

    if (Object.keys(updates).length > 0) {
      await redis.hset(cacheKey, updates);
    }

    return true;
  } catch (error) {
    logger.error('Cache hash metadata update error', {
      entityType,
      entityId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Increment version in cache hash
 * @param {string} entityType - Entity type
 * @param {string} entityId - Entity ID
 * @returns {Promise<number|null>} New version number or null if failed
 */
async function incrementCacheHashVersion(entityType, entityId) {
  try {
    const redis = getRedisClient();
    const cacheKey = `hash:${getCacheKey(entityType, entityId)}`;

    // Check if hash exists
    const exists = await redis.exists(cacheKey);
    if (!exists) {
      return null;
    }

    // Increment version using HINCRBY
    const newVersion = await redis.hincrby(cacheKey, 'version', 1);
    return newVersion.toString();
  } catch (error) {
    logger.error('Cache hash version increment error', {
      entityType,
      entityId,
      error: error.message,
    });
    return null;
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
  getPrice,
  setPrice,
  getItemPrice,
  setItemPrice,
  getStockAvailability,
  setStockAvailability,
  getWarehouseReference,
  setWarehouseReference,
  // Hash-based cache operations
  setCacheHash,
  getCacheHash,
  getCacheHashData,
  updateCacheHashMetadata,
  incrementCacheHashVersion,
  deleteCacheHash,
};


