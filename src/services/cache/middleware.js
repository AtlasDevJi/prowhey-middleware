const crypto = require('crypto');
const {
  getCache,
  setCache,
  getQueryCache,
  setQueryCache,
} = require('../redis/cache');
const { fetchProduct, fetchProductQuery } = require('../erpnext/client');
const { extractEntityFromPath } = require('../../utils/data-types');
const { logger } = require('../logger');

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

    // Query request
    if (entityType === 'product' && queryString && doctype === 'Website Item') {
      return await handleProductQueryRequest(req, res, queryString);
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
  const cached = await getCache('product', itemCode);

  if (cached) {
    logger.info('Cache hit', { entityType: 'product', entityId: itemCode });
    console.log(`✅ CACHE HIT: product:${itemCode}`);
    // Return already-transformed app-ready data
    return res.json(cached);
  }

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

    // Cache transformed data (app-ready format)
    await setCache('product', itemCode, transformedData);
    console.log(`💾 CACHED: product:${itemCode} - Stored in Redis`);

    // Return transformed data to app
    return res.json(transformedData);
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

/**
 * Handle product query request
 * Flow: Check cache → [Hit] Return transformed array
 *                   → [Miss] Fetch ERPNext (with transformation) → Cache → Return
 */
async function handleProductQueryRequest(req, res, queryString) {
  const queryHash = hashQuery(queryString);
  const cached = await getQueryCache('product', queryHash);

  if (cached) {
    logger.info('Query cache hit', {
      entityType: 'product',
      queryHash,
    });
    console.log(`✅ QUERY CACHE HIT: product:query:${queryHash}`);
    // Return already-transformed app-ready array
    return res.json(cached);
  }

  logger.info('Query cache miss', {
    entityType: 'product',
    queryHash,
  });
  console.log(`❌ QUERY CACHE MISS: product:query:${queryHash} - Fetching from ERPNext...`);

  try {
    // Fetch query - transformation happens in fetchProductQuery
    // fetchProductQuery returns transformed app-ready array
    // Uses server's ERPNext credentials (not user auth)
    const transformedResults = await fetchProductQuery(queryString);

    if (!transformedResults || transformedResults.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'No results found',
      });
    }

    // Cache transformed results (app-ready format)
    await setQueryCache('product', queryHash, transformedResults);
    console.log(`💾 QUERY CACHED: product:query:${queryHash} - Stored in Redis`);

    // Return transformed results to app
    return res.json(transformedResults);
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

module.exports = { cacheMiddleware, hashQuery };

