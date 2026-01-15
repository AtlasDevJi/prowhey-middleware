const { computeDataHash } = require('../sync/hash-computer');
const { addStreamEntry } = require('../sync/stream-manager');
const {
  setCacheHash,
  getCacheHash,
  incrementCacheHashVersion,
} = require('../redis/cache');
const { fetchProduct } = require('../erpnext/client');
const { transformProduct } = require('../cache/transformer');
const { logger } = require('../logger');

/**
 * Process webhook for product entity
 * Fetches product from ERPNext, transforms, computes hash, updates cache, adds stream entry if changed
 * @param {string} erpnextName - ERPNext name field (e.g., WEB-ITM-0002)
 * @returns {Promise<object>} Result object with {changed: boolean, version: string, streamId: string|null}
 */
async function processProductWebhook(erpnextName) {
  try {
    // Fetch product from ERPNext
    const transformedData = await fetchProduct(erpnextName);

    if (!transformedData) {
      logger.warn('Product not found in ERPNext', { erpnextName });
      return {
        changed: false,
        version: null,
        streamId: null,
        error: 'Product not found',
      };
    }

    // Compute hash of transformed data
    const newHash = computeDataHash(transformedData);

    // Get existing cache
    const existing = await getCacheHash('product', erpnextName);

    // Check if data changed
    let version = '1';
    let changed = true;

    if (existing) {
      // Compare hashes
      if (existing.data_hash === newHash) {
        // No change, skip update
        changed = false;
        logger.info('Product webhook: no change detected', {
          erpnextName,
          hash: newHash,
        });
        return {
          changed: false,
          version: existing.version,
          streamId: null,
        };
      }
      // Data changed, increment version
      version = await incrementCacheHashVersion('product', erpnextName);
      if (!version) {
        version = (parseInt(existing.version) + 1).toString();
      }
    }

    // Update cache with new data
    const updatedAt = Date.now().toString();
    const success = await setCacheHash('product', erpnextName, transformedData, {
      data_hash: newHash,
      updated_at: updatedAt,
      version,
    });

    if (!success) {
      throw new Error('Failed to update cache');
    }

    // Add stream entry
    const streamId = await addStreamEntry('product', erpnextName, newHash, version);

    logger.info('Product webhook processed', {
      erpnextName,
      changed,
      version,
      streamId,
      hash: newHash,
    });

    return {
      changed: true,
      version,
      streamId,
    };
  } catch (error) {
    logger.error('Product webhook processing error', {
      erpnextName,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Process webhook for price entity
 * Fetches prices from ERPNext for a specific item code, computes hash, adds stream entry if changed
 * @param {string} itemCode - Item code (e.g., "OL-EN-92-rng-1kg")
 * @returns {Promise<object>} Result object with {changed: boolean, version: string, streamId: string|null}
 */
async function processPriceWebhook(itemCode) {
  try {
    // Fetch prices from ERPNext (retail and wholesale)
    const { fetchItemPrices } = require('../erpnext/client');
    const { getItemPrice, setItemPrice } = require('../redis/cache');
    
    const { retail, wholesale } = await fetchItemPrices(itemCode);

    // Build price array: [retail, wholesale] (use 0 if price not found)
    const priceArray = [
      retail !== null && retail !== undefined ? retail : 0,
      wholesale !== null && wholesale !== undefined ? wholesale : 0,
    ];

    const priceData = { itemCode, prices: priceArray };

    // Compute hash
    const newHash = computeDataHash(priceData);

    // Get existing cache (both hash cache and simple key for comparison)
    const existing = await getCacheHash('price', itemCode);
    const cachedPriceArray = await getItemPrice(itemCode);

    // Check if changed
    let version = '1';
    let changed = true;

    if (existing) {
      // Compare hash first (fast check)
      if (existing.data_hash === newHash) {
        // Hash matches, but also check if actual Redis value differs (manual changes)
        // Compare arrays element by element
        const arraysMatch = 
          cachedPriceArray &&
          Array.isArray(cachedPriceArray) &&
          cachedPriceArray.length === priceArray.length &&
          cachedPriceArray.every((val, idx) => val === priceArray[idx]);

        if (arraysMatch) {
          // Both hash and actual data match - no change
          changed = false;
          logger.info('Price webhook: no change detected', {
            itemCode,
            hash: newHash,
          });
          return {
            changed: false,
            version: existing.version,
            streamId: null,
          };
        } else {
          // Hash matches but actual data differs - manual change detected
          logger.info('Manual Redis change detected for price in webhook', {
            itemCode,
            cachedHash: existing.data_hash,
            newHash,
            cachedPriceArray,
            newPriceArray: priceArray,
          });
          // Continue to update (changed = true)
        }
      }
      
      // Hash differs or manual change detected - increment version
      version = await incrementCacheHashVersion('price', itemCode);
      if (!version) {
        version = (parseInt(existing.version) + 1).toString();
      }
    }

    // Update cache
    const updatedAt = Date.now().toString();
    const success = await setCacheHash('price', itemCode, priceData, {
      data_hash: newHash,
      updated_at: updatedAt,
      version,
    });

    if (!success) {
      throw new Error('Failed to update price cache');
    }

    // Also update simple key for backward compatibility
    await setItemPrice(itemCode, priceArray);

    // Add stream entry if changed
    const streamId = await addStreamEntry('price', itemCode, newHash, version);

    logger.info('Price webhook processed', {
      itemCode,
      retail,
      wholesale,
      priceArray,
      changed,
      version,
      streamId,
    });

    return {
      changed: true,
      version,
      streamId,
    };
  } catch (error) {
    logger.error('Price webhook processing error', {
      itemCode,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Process webhook for stock entity
 * Fetches stock from ERPNext, builds availability array, computes hash, adds stream entry if changed
 * @param {string} itemCode - Item code
 * @returns {Promise<object>} Result object with {changed: boolean, version: string, streamId: string|null}
 */
async function processStockWebhook(itemCode) {
  try {
    // Fetch warehouses with stock from ERPNext
    const { fetchItemStock } = require('../erpnext/client');
    const { getWarehouseReferenceArray, buildAvailabilityArray } = require('../stock/stock');
    
    const warehousesWithStock = await fetchItemStock(itemCode);
    const referenceWarehouses = await getWarehouseReferenceArray();
    const availabilityArray = buildAvailabilityArray(warehousesWithStock, referenceWarehouses);

    const stockData = { itemCode, availability: availabilityArray };

    // Compute hash
    const newHash = computeDataHash(stockData);

    // Get existing cache
    const existing = await getCacheHash('stock', itemCode);

    // Check if changed
    let version = '1';
    let changed = true;

    if (existing) {
      if (existing.data_hash === newHash) {
        changed = false;
        logger.info('Stock webhook: no change detected', {
          itemCode,
          hash: newHash,
        });
        return {
          changed: false,
          version: existing.version,
          streamId: null,
        };
      }
      version = await incrementCacheHashVersion('stock', itemCode);
      if (!version) {
        version = (parseInt(existing.version) + 1).toString();
      }
    }

    // Update cache
    const updatedAt = Date.now().toString();
    const success = await setCacheHash('stock', itemCode, stockData, {
      data_hash: newHash,
      updated_at: updatedAt,
      version,
    });

    if (!success) {
      throw new Error('Failed to update stock cache');
    }

    // Also update simple key for backward compatibility
    const { setStockAvailability } = require('../redis/cache');
    await setStockAvailability(itemCode, availabilityArray);

    // Add stream entry
    const streamId = await addStreamEntry('stock', itemCode, newHash, version);

    logger.info('Stock webhook processed', {
      itemCode,
      changed,
      version,
      streamId,
    });

    return {
      changed: true,
      version,
      streamId,
    };
  } catch (error) {
    logger.error('Stock webhook processing error', {
      itemCode,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Process webhook for hero entity
 * Fetches hero images from ERPNext, downloads and converts to base64, computes hash, adds stream entry if changed
 * @returns {Promise<object>} Result object with {changed: boolean, version: string, streamId: string|null}
 */
async function processHeroWebhook() {
  try {
    const { fetchHeroImages } = require('../erpnext/client');
    const { transformHeroImages } = require('../cache/transformer');
    const entityId = 'hero';

    // Fetch hero images from ERPNext
    const fileUrls = await fetchHeroImages();
    
    if (!fileUrls || fileUrls.length === 0) {
      logger.warn('No hero images found in ERPNext');
      return {
        changed: false,
        version: null,
        streamId: null,
        error: 'No hero images found',
      };
    }

    // Wrap in ERPNext response format for transformer
    const erpnextData = {
      data: fileUrls.map((url) => ({ file_url: url })),
    };

    // Transform (downloads images and converts to base64)
    const transformedData = await transformHeroImages(erpnextData);

    // Compute hash
    const newHash = computeDataHash(transformedData);

    // Get existing cache
    const existing = await getCacheHash('hero', entityId);

    // Check if changed
    let version = '1';
    let changed = true;

    if (existing) {
      if (existing.data_hash === newHash) {
        changed = false;
        logger.info('Hero webhook: no change detected', {
          hash: newHash,
        });
        return {
          changed: false,
          version: existing.version,
          streamId: null,
        };
      }
      version = await incrementCacheHashVersion('hero', entityId);
      if (!version) {
        version = (parseInt(existing.version) + 1).toString();
      }
    }

    // Update cache
    const updatedAt = Date.now().toString();
    const success = await setCacheHash('hero', entityId, transformedData, {
      data_hash: newHash,
      updated_at: updatedAt,
      version,
    });

    if (!success) {
      throw new Error('Failed to update hero cache');
    }

    // Add stream entry
    const streamId = await addStreamEntry('hero', entityId, newHash, version);

    logger.info('Hero webhook processed', {
      changed,
      version,
      streamId,
      imageCount: transformedData.heroImages?.length || 0,
    });

    return {
      changed: true,
      version,
      streamId,
    };
  } catch (error) {
    logger.error('Hero webhook processing error', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Process webhook for bundle entity
 * Fetches bundle images from ERPNext, downloads and converts to base64, computes hash, adds stream entry if changed
 * @returns {Promise<object>} Result object with {changed: boolean, version: string, streamId: string|null}
 */
async function processBundleWebhook() {
  try {
    const { fetchBundleImages } = require('../erpnext/client');
    const { transformBundleImages } = require('../cache/transformer');
    const entityId = 'bundle';

    // Fetch bundle images from ERPNext
    const fileUrls = await fetchBundleImages();
    
    if (!fileUrls || fileUrls.length === 0) {
      logger.warn('No bundle images found in ERPNext');
      return {
        changed: false,
        version: null,
        streamId: null,
        error: 'No bundle images found',
      };
    }

    // Wrap in ERPNext response format for transformer
    const erpnextData = {
      data: fileUrls.map((url) => ({ file_url: url })),
    };

    // Transform (downloads images and converts to base64)
    const transformedData = await transformBundleImages(erpnextData);

    // Compute hash
    const newHash = computeDataHash(transformedData);

    // Get existing cache
    const existing = await getCacheHash('bundle', entityId);

    // Check if changed
    let version = '1';
    let changed = true;

    if (existing) {
      if (existing.data_hash === newHash) {
        changed = false;
        logger.info('Bundle webhook: no change detected', {
          hash: newHash,
        });
        return {
          changed: false,
          version: existing.version,
          streamId: null,
        };
      }
      version = await incrementCacheHashVersion('bundle', entityId);
      if (!version) {
        version = (parseInt(existing.version) + 1).toString();
      }
    }

    // Update cache
    const updatedAt = Date.now().toString();
    const success = await setCacheHash('bundle', entityId, transformedData, {
      data_hash: newHash,
      updated_at: updatedAt,
      version,
    });

    if (!success) {
      throw new Error('Failed to update bundle cache');
    }

    // Add stream entry
    const streamId = await addStreamEntry('bundle', entityId, newHash, version);

    logger.info('Bundle webhook processed', {
      changed,
      version,
      streamId,
      imageCount: transformedData.bundleImages?.length || 0,
    });

    return {
      changed: true,
      version,
      streamId,
    };
  } catch (error) {
    logger.error('Bundle webhook processing error', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Process webhook for home entity
 * Fetches App Home from ERPNext, transforms, computes hash, adds stream entry if changed
 * @returns {Promise<object>} Result object with {changed: boolean, version: string, streamId: string|null}
 */
async function processHomeWebhook() {
  try {
    const { fetchAppHome } = require('../erpnext/client');
    const { transformAppHome } = require('../cache/transformer');
    const entityId = 'home';

    // Fetch App Home from ERPNext
    const appHomeData = await fetchAppHome();

    if (!appHomeData) {
      logger.warn('App Home not found in ERPNext');
      return {
        changed: false,
        version: null,
        streamId: null,
        error: 'App Home not found',
      };
    }

    // Wrap in ERPNext response format for transformer
    const erpnextData = { data: appHomeData };

    // Transform (parses JSON strings)
    const transformedData = await transformAppHome(erpnextData);

    if (!transformedData) {
      throw new Error('Failed to transform App Home data');
    }

    // Compute hash
    const newHash = computeDataHash(transformedData);

    // Get existing cache
    const existing = await getCacheHash('home', entityId);

    // Check if changed
    let version = '1';
    let changed = true;

    if (existing) {
      if (existing.data_hash === newHash) {
        changed = false;
        logger.info('Home webhook: no change detected', {
          hash: newHash,
        });
        return {
          changed: false,
          version: existing.version,
          streamId: null,
        };
      }
      version = await incrementCacheHashVersion('home', entityId);
      if (!version) {
        version = (parseInt(existing.version) + 1).toString();
      }
    }

    // Update cache
    const updatedAt = Date.now().toString();
    const success = await setCacheHash('home', entityId, transformedData, {
      data_hash: newHash,
      updated_at: updatedAt,
      version,
    });

    if (!success) {
      throw new Error('Failed to update home cache');
    }

    // Add stream entry
    const streamId = await addStreamEntry('home', entityId, newHash, version);

    logger.info('Home webhook processed', {
      changed,
      version,
      streamId,
    });

    return {
      changed: true,
      version,
      streamId,
    };
  } catch (error) {
    logger.error('Home webhook processing error', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Unified webhook handler
 * Routes to appropriate processor based on entity_type
 * @param {string} entityType - Entity type ('product', 'price', 'stock', 'hero', 'home')
 * @param {object} payload - Webhook payload
 * @returns {Promise<object>} Result object
 */
async function processWebhook(entityType, payload) {
  try {
    switch (entityType) {
      case 'product': {
        const { erpnextName } = payload;
        if (!erpnextName) {
          throw new Error('erpnextName required for product webhook');
        }
        return await processProductWebhook(erpnextName);
      }

      case 'price': {
        const { itemCode } = payload;
        if (!itemCode) {
          throw new Error('itemCode required for price webhook');
        }
        return await processPriceWebhook(itemCode);
      }

      case 'stock': {
        const { itemCode } = payload;
        if (!itemCode) {
          throw new Error('itemCode required for stock webhook');
        }
        return await processStockWebhook(itemCode);
      }

      case 'hero': {
        return await processHeroWebhook();
      }

      case 'bundle': {
        return await processBundleWebhook();
      }

      case 'home': {
        return await processHomeWebhook();
      }

      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }
  } catch (error) {
    logger.error('Unified webhook processing error', {
      entityType,
      payload,
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  processWebhook,
  processProductWebhook,
  processPriceWebhook,
  processStockWebhook,
};
