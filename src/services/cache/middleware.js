const crypto = require('crypto');
const {
  getCache,
  setCache,
  getCacheHash,
  setCacheHash,
  getQueryCache,
  setQueryCache,
  incrementCacheHashVersion,
  deleteCacheHash,
  deleteCache,
} = require('../redis/cache');
const { computeDataHash } = require('../sync/hash-computer');
const { addStreamEntry } = require('../sync/stream-manager');
const { getRedisClient } = require('../redis/client');
const { fetchProduct, fetchProductQuery } = require('../erpnext/client');
const { extractEntityFromPath } = require('../../utils/data-types');
const { logger } = require('../logger');
const { fetchProductAnalytics } = require('../cache/transformer');

/**
 * Generate MD5 hash for query string
 */
function hashQuery(queryString) {
  return crypto.createHash('md5').update(queryString).digest('hex');
}

/**
 * Cache middleware for GET requests
 */
async function cacheMiddleware(req, res, next) {
  if (req.method !== 'GET') {
    return next();
  }

  try {
    // Decode URL-encoded path (Express should do this, but ensure it's decoded)
    const path = decodeURIComponent(req.path.replace(/^\/api\/resource\/?/, '') || req.path);
    const queryString = req.url.split('?')[1] || '';
    const { entityType, doctype, entityId } = extractEntityFromPath(path);

    logger.info('Cache middleware', {
      path: req.path,
      decodedPath: path,
      entityType,
      doctype,
      entityId,
      hasQuery: !!queryString,
    });

    // Single product request (using filter in query string)
    if (entityType === 'product' && doctype === 'Website Item') {
      // Extract item code from filters in query string
      const itemCode = extractItemCodeFromQuery(queryString);
      if (itemCode) {
        return await handleProductRequest(req, res, itemCode);
      }
    }

    // Query request (with query string)
    if (entityType === 'product' && queryString && doctype === 'Website Item') {
      return await handleProductQueryRequest(req, res, queryString);
    }

    // Fetch all products (no query string, just doctype)
    if (entityType === 'product' && !queryString && doctype === 'Website Item') {
      // Treat as query with empty query string to fetch all
      return await handleProductQueryRequest(req, res, '');
    }

    return next();
  } catch (error) {
    logger.error('Cache middleware error', {
      path: req.path,
      error: error.message,
    });
    return next();
  }
}

/**
 * Extract item code from query string filters
 * Format: filters=[["name", "=", "WEB-ITM-0002"]]
 */
function extractItemCodeFromQuery(queryString) {
  try {
    const params = new URLSearchParams(queryString);
    const filtersParam = params.get('filters');
    if (!filtersParam) {
      return null;
    }

    const filters = JSON.parse(filtersParam);
    if (Array.isArray(filters) && filters.length > 0) {
      const filter = filters[0];
      if (Array.isArray(filter) && filter.length === 3 && filter[0] === 'name' && filter[1] === '=') {
        return filter[2];
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Handle single product request
 * Flow: Check cache → [Hit] Return transformed data
 *                   → [Miss] Fetch ERPNext (with transformation) → Cache → Return
 */
async function handleProductRequest(req, res, itemCode) {
  // Check hash-based cache first (for sync compatibility)
  const cachedHash = await getCacheHash('product', itemCode);

  let productData;
  let erpnextName; // ERPNext 'name' field (e.g., WEB-ITM-0002)

  if (cachedHash) {
    logger.info('Cache hit (hash)', { entityType: 'product', entityId: itemCode });
    console.log(`✅ CACHE HIT (hash): product:${itemCode}`);
    productData = cachedHash.data;
    erpnextName = productData.erpnext_name; // Use ERPNext name field for analytics
  } else {
    // Fallback to simple cache for backward compatibility
    const cached = await getCache('product', itemCode);
    if (cached) {
      logger.info('Cache hit (simple)', { entityType: 'product', entityId: itemCode });
      console.log(`✅ CACHE HIT (simple): product:${itemCode}`);
      productData = cached;
      erpnextName = cached.erpnext_name;
    } else {
      logger.info('Cache miss', { entityType: 'product', entityId: itemCode });
      console.log(`❌ CACHE MISS: product:${itemCode} - Fetching from ERPNext...`);

      try {
        // Fetch product - transformation happens in fetchProduct
        // fetchProduct returns transformed app-ready data
        // Uses server's ERPNext credentials (not user auth)
        const transformedData = await fetchProduct(itemCode);

        if (!transformedData) {
          return res.status(404).json({
            success: false,
            error: 'Not found',
            message: 'Product not found',
          });
        }

        productData = transformedData;
        erpnextName = transformedData.erpnext_name; // Use ERPNext name field for analytics

        // Compute hash for sync
        const newHash = computeDataHash(transformedData);
        const updatedAt = Date.now().toString();
        const version = '1';

        // Cache as hash (primary storage for sync)
        await setCacheHash('product', itemCode, transformedData, {
          data_hash: newHash,
          updated_at: updatedAt,
          version,
        });

        // Also cache as simple key for backward compatibility
        await setCache('product', itemCode, transformedData);
        console.log(`💾 CACHED: product:${itemCode} - Stored in Redis (hash + simple)`);
      } catch (error) {
        logger.error('ERPNext fetch error', {
          entityType: 'product',
          entityId: itemCode,
          error: error.message,
        });
        return res.status(500).json({
          success: false,
          error: 'Internal Server Error',
          message: 'Failed to fetch product',
        });
      }
    }
  }

  // Fetch analytics separately using ERPNext 'name' field (e.g., WEB-ITM-0002)
  // Analytics are stored separately and returned as top-level fields
  try {
    const analytics = await fetchProductAnalytics(erpnextName);

    // Return product and analytics as separate top-level fields
    return res.json({
      product: productData,
      views: analytics.views,
      ratingBreakdown: analytics.ratingBreakdown,
      reviewCount: analytics.reviewCount,
      comments: analytics.comments,
    });
  } catch (error) {
    logger.error('Analytics fetch error', {
      erpnextName,
      error: error.message,
    });
    // Return product even if analytics fail, with default analytics
    return res.json({
      product: productData,
      views: 0,
      ratingBreakdown: {
        '1': 0,
        '2': 0,
        '3': 0,
        '4': 0,
        '5': 0,
      },
      reviewCount: 0,
      comments: [],
    });
  }
}

/**
 * Handle product query request
 * Flow: Check cache → [Hit] Return transformed array
 *                   → [Miss] Fetch ERPNext (with transformation) → Cache → Return
 */
async function handleProductQueryRequest(req, res, queryString) {
  const queryHash = hashQuery(queryString);
  let transformedResults;
  let fromCache = false;

  // Check query cache first
  const cached = await getQueryCache('product', queryHash);
  if (cached) {
    logger.info('Query cache hit', {
      entityType: 'product',
      queryHash,
    });
    console.log(`✅ QUERY CACHE HIT: product:query:${queryHash}`);
    transformedResults = cached;
    fromCache = true;
  } else {
    logger.info('Query cache miss', {
      entityType: 'product',
      queryHash,
    });
    console.log(`❌ QUERY CACHE MISS: product:query:${queryHash} - Fetching from ERPNext...`);

    try {
      // Fetch query - transformation happens in fetchProductQuery
      // fetchProductQuery returns transformed app-ready array
      // Uses server's ERPNext credentials (not user auth)
      transformedResults = await fetchProductQuery(queryString);

      if (!transformedResults || transformedResults.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Not found',
          message: 'No results found',
        });
      }

      // Cache transformed results (app-ready format) for query cache
      await setQueryCache('product', queryHash, transformedResults);
      console.log(`💾 QUERY CACHED: product:query:${queryHash} - Stored in Redis`);
    } catch (error) {
      logger.error('ERPNext query error', {
        queryHash,
        error: error.message,
      });
      return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to fetch products',
      });
    }
  }

  // Always check individual product hashes and update streams
  // This ensures consistency even when query cache is hit
  try {

    // Track products from ERPNext response
    const erpnextProductNames = new Set();
    
    // Also cache each product individually as hash (for sync compatibility)
    // Compare with Redis hashes and update stream if changes detected
    let cachedCount = 0;
    let updatedCount = 0;
    let newCount = 0;
    
    for (const product of transformedResults) {
      if (product.erpnext_name) {
        erpnextProductNames.add(product.erpnext_name);
        
        const productHash = computeDataHash(product);
        const updatedAt = Date.now().toString();
        let version = '1';
        let changed = false;
        
        // Check if hash already exists to preserve version (both hash cache and simple cache for comparison)
        const existing = await getCacheHash('product', product.erpnext_name);
        const { getCache } = require('../redis/cache');
        const cachedProduct = await getCache('product', product.erpnext_name);
        
        if (existing) {
          // Compare hash first (fast check)
          if (existing.data_hash === productHash) {
            // Hash matches, but also check if actual Redis value differs (manual changes)
            // Compare objects using JSON stringify (deep equality check)
            const dataMatches = 
              cachedProduct &&
              JSON.stringify(cachedProduct) === JSON.stringify(product);

            if (dataMatches) {
              // Both hash and actual data match - no change
              // Still cache to ensure it's up to date, but skip stream update
              await setCacheHash('product', product.erpnext_name, product, {
                data_hash: productHash,
                updated_at: updatedAt,
                version: existing.version,
              });
              await setCache('product', product.erpnext_name, product);
              continue; // Skip stream update, no change
            } else {
              // Hash matches but actual data differs - manual change detected
              logger.info('Manual Redis change detected for product in middleware', {
                erpnextName: product.erpnext_name,
                cachedHash: existing.data_hash,
                newHash: productHash,
              });
              // Continue to update (changed = true)
            }
          }
          
          // Hash differs or manual change detected - increment version and add stream entry
          changed = true;
          const newVersion = await incrementCacheHashVersion('product', product.erpnext_name);
          version = newVersion || (parseInt(existing.version) + 1).toString();
          updatedCount++;
        } else {
          // No existing hash cache - check simple Redis key
          if (cachedProduct) {
            // Compare objects using JSON stringify
            const dataMatches = JSON.stringify(cachedProduct) === JSON.stringify(product);
            
            if (dataMatches) {
              // Data matches existing simple key - no change, just update hash cache without stream entry
              await setCacheHash('product', product.erpnext_name, product, {
                data_hash: productHash,
                updated_at: updatedAt,
                version: '1',
              });
              await setCache('product', product.erpnext_name, product);
              continue; // Skip stream update, no change
            }
          }
          // Data differs or no existing data - this is a change
          changed = true;
          newCount++;
        }
        
        // Cache as hash (primary storage for sync)
        await setCacheHash('product', product.erpnext_name, product, {
          data_hash: productHash,
          updated_at: updatedAt,
          version,
        });
        
        // Also cache as simple key for backward compatibility
        await setCache('product', product.erpnext_name, product);
        
        // Add stream entry if data changed (new or updated)
        if (changed) {
          const streamId = await addStreamEntry('product', product.erpnext_name, productHash, version);
          logger.info('Product change detected and stream updated', {
            erpnextName: product.erpnext_name,
            version,
            streamId,
            isNew: !existing,
          });
        }
        
        cachedCount++;
      }
    }
    
    // Check for deleted products (exist in Redis but not in ERPNext response)
    // Only check if we're fetching all products (empty query string indicates fetch all)
    let deletedCount = 0;
    if (!queryString || queryString === '') {
      try {
        const redis = getRedisClient();
        // Get all product hash keys (use SCAN instead of KEYS for better performance)
        const productKeys = [];
        let cursor = '0';
        
        do {
          const result = await redis.scan(cursor, 'MATCH', 'hash:product:*', 'COUNT', 100);
          cursor = result[0];
          productKeys.push(...result[1]);
        } while (cursor !== '0');
        
        // Remove duplicates and filter out query cache keys
        const uniqueProductNames = new Set();
        for (const key of productKeys) {
          // Extract product name from key (format: hash:product:WEB-ITM-0002)
          const productName = key.replace('hash:product:', '');
          // Skip query cache keys (they have different format) and ensure it's a valid product name
          if (productName && !productName.includes(':') && productName.startsWith('WEB-ITM-')) {
            uniqueProductNames.add(productName);
          }
        }
        
        logger.info('Deletion check: found products in Redis', {
          totalInRedis: uniqueProductNames.size,
          totalInErpnext: erpnextProductNames.size,
        });
        
        // Check each product in Redis against ERPNext response
        // First, check recent stream entries once to avoid duplicate deletion entries
        const { readStreamEntries } = require('../sync/stream-manager');
        const recentEntries = await readStreamEntries('product', '0', 100);
        const existingDeletionHashes = new Set();
        
        // Build a set of existing deletion hashes for products
        for (const entry of recentEntries) {
          const { entity_id, data_hash } = entry.fields || {};
          if (entity_id && data_hash) {
            // Check if this is a deletion hash by computing what it would be
            const deletionHash = computeDataHash({ deleted: true, erpnext_name: entity_id });
            if (data_hash === deletionHash) {
              existingDeletionHashes.add(entity_id);
            }
          }
        }
        
        logger.info('Deletion check: found existing deletion entries', {
          existingDeletions: existingDeletionHashes.size,
        });
        
        // Track processed deletions in this run to avoid duplicates
        const processedDeletions = new Set();
        
        for (const productName of uniqueProductNames) {
          // Skip if already processed in this run
          if (processedDeletions.has(productName)) {
            continue;
          }
          
          // Skip if deletion entry already exists in stream
          if (existingDeletionHashes.has(productName)) {
            logger.info('Deletion entry already exists in stream, skipping', {
              erpnextName: productName,
            });
            // Still delete from cache if it exists
            const existing = await getCacheHash('product', productName);
            if (existing) {
              await deleteCacheHash('product', productName);
            }
            continue;
          }
          
          // If product not in ERPNext response, it may have been deleted
          if (!erpnextProductNames.has(productName)) {
            // Verify it's actually a product hash (has data field)
            const existing = await getCacheHash('product', productName);
            if (existing && existing.data) {
              // Product exists in Redis but not in ERPNext - it's been deleted/unpublished
              // Add a special stream entry to indicate deletion
              const deletedHash = computeDataHash({ deleted: true, erpnext_name: productName });
              const deletedVersion = await incrementCacheHashVersion('product', productName);
              const streamId = await addStreamEntry(
                'product',
                productName,
                deletedHash,
                deletedVersion || (parseInt(existing.version) + 1).toString()
              );
              
              // Mark as processed to avoid duplicate entries
              processedDeletions.add(productName);
              
              // Delete from Redis cache (both hash and simple cache)
              await deleteCacheHash('product', productName);
              
              // Invalidate query cache so next fetch reflects the deletion
              // Delete all product query caches (they may contain the deleted product)
              try {
                const redis = getRedisClient();
                const queryCacheKeys = await redis.keys('product:query:*');
                if (queryCacheKeys.length > 0) {
                  await redis.del(...queryCacheKeys);
                  logger.info('Query cache invalidated after product deletion', {
                    erpnextName: productName,
                    invalidatedQueries: queryCacheKeys.length,
                  });
                }
              } catch (error) {
                logger.warn('Failed to invalidate query cache', {
                  erpnextName: productName,
                  error: error.message,
                });
              }
              
              logger.info('Product deletion detected: removed from cache and stream updated', {
                erpnextName: productName,
                streamId,
                previousVersion: existing.version,
              });
              
              deletedCount++;
            }
          }
        }
      } catch (error) {
        logger.error('Error checking for deleted products', {
          error: error.message,
          stack: error.stack,
        });
      }
    }
    
    if (cachedCount > 0) {
      console.log(`💾 INDIVIDUAL PRODUCTS PROCESSED: ${cachedCount} products checked`);
      if (updatedCount > 0 || newCount > 0 || deletedCount > 0) {
        console.log(`📢 STREAM UPDATES: ${newCount} new, ${updatedCount} updated, ${deletedCount} deleted`);
      } else if (!fromCache) {
        console.log(`✅ All products up to date (no changes detected)`);
      }
    }

    // Return transformed results to app wrapped in data object
    return res.json({ data: transformedResults });
  } catch (error) {
    logger.error('Error processing individual products', {
      queryHash,
      error: error.message,
      stack: error.stack,
    });
    // Still return the results even if individual product processing fails
    return res.json({ data: transformedResults });
  }
}

module.exports = { cacheMiddleware, hashQuery };

