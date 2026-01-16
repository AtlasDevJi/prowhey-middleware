const { computeDataHash } = require('../sync/hash-computer');
const { addStreamEntry } = require('../sync/stream-manager');
const {
  setCacheHash,
  getCacheHash,
  incrementCacheHashVersion,
} = require('../redis/cache');
const { logger } = require('../logger');



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

    // Get existing cache (both hash cache and simple key for comparison)
    const existing = await getCacheHash('stock', itemCode);
    const { getStockAvailability } = require('../redis/cache');
    const cachedAvailability = await getStockAvailability(itemCode);

    // Check if changed
    let version = '1';
    let changed = false;

    if (existing) {
      // Compare hash first (fast check)
      if (existing.data_hash === newHash) {
        // Hash matches, but also check if actual Redis value differs (manual changes)
        // Compare arrays element by element
        const arraysMatch = 
          cachedAvailability &&
          Array.isArray(cachedAvailability) &&
          cachedAvailability.length === availabilityArray.length &&
          cachedAvailability.every((val, idx) => val === availabilityArray[idx]);

        if (arraysMatch) {
          // Both hash and actual data match - no change
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
        } else {
          // Hash matches but actual data differs - manual change detected
          logger.info('Manual Redis change detected for stock', {
            itemCode,
            cachedHash: existing.data_hash,
            newHash,
            cachedAvailability,
            newAvailability: availabilityArray,
          });
          // Continue to update (changed = true)
        }
      }
      
      // Hash differs or manual change detected - increment version
      version = await incrementCacheHashVersion('stock', itemCode);
      if (!version) {
        version = (parseInt(existing.version) + 1).toString();
      }
      changed = true;
    } else {
      // No existing hash cache - check simple Redis key
      if (cachedAvailability && Array.isArray(cachedAvailability)) {
        // Compare arrays element by element
        const arraysMatch = 
          cachedAvailability.length === availabilityArray.length &&
          cachedAvailability.every((val, idx) => val === availabilityArray[idx]);

        if (arraysMatch) {
          // Data matches existing simple key - no change, just update hash cache without stream entry
          logger.info('Stock webhook: no change detected (matched simple Redis key)', {
            itemCode,
            hash: newHash,
          });
          
          // Update hash cache to keep it in sync, but don't add stream entry
          const updatedAt = Date.now().toString();
          await setCacheHash('stock', itemCode, stockData, {
            data_hash: newHash,
            updated_at: updatedAt,
            version: '1',
          });
          
          return {
            changed: false,
            version: '1',
            streamId: null,
          };
        }
      }
      // Data differs or no existing data - this is a change
      changed = true;
    }

    // Only proceed if there's a change
    if (!changed) {
      return {
        changed: false,
        version: existing?.version || '1',
        streamId: null,
      };
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

    // Add stream entry only if changed
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

    // Get existing cache (both hash cache and actual data for comparison)
    const existing = await getCacheHash('bundle', entityId);
    const { getCacheHashData } = require('../redis/cache');
    const cachedBundleData = await getCacheHashData('bundle', entityId);

    // Check if changed
    let version = '1';
    let changed = false;

    if (existing) {
      // Compare hash first (fast check)
      if (existing.data_hash === newHash) {
        // Hash matches, but also check if actual data differs (manual changes)
        // Compare objects using JSON stringify (deep equality check)
        const dataMatches = 
          cachedBundleData &&
          JSON.stringify(cachedBundleData) === JSON.stringify(transformedData);

        if (dataMatches) {
          // Both hash and actual data match - no change
          changed = false;
          logger.info('Bundle webhook: no change detected', {
            hash: newHash,
          });
          return {
            changed: false,
            version: existing.version,
            streamId: null,
          };
        } else {
          // Hash matches but actual data differs - manual change detected
          logger.info('Manual Redis change detected for bundle', {
            cachedHash: existing.data_hash,
            newHash,
          });
          // Continue to update (changed = true)
        }
      }
      
      // Hash differs or manual change detected - increment version
      version = await incrementCacheHashVersion('bundle', entityId);
      if (!version) {
        version = (parseInt(existing.version) + 1).toString();
      }
      changed = true;
    } else {
      // No existing cache - this is a change
      changed = true;
    }

    // Only proceed if there's a change
    if (!changed) {
      return {
        changed: false,
        version: existing?.version || '1',
        streamId: null,
      };
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
 * Unified webhook handler
 * Routes to appropriate processor based on entity_type
 * Note: Friday-only entities (product, price, hero, home) are updated automatically on Friday evenings - no webhooks needed
 * @param {string} entityType - Entity type ('stock', 'bundle')
 * @param {object} payload - Webhook payload
 * @returns {Promise<object>} Result object
 */
async function processWebhook(entityType, payload) {
  try {
    switch (entityType) {
      case 'stock': {
        const { itemCode } = payload;
        if (!itemCode) {
          throw new Error('itemCode required for stock webhook');
        }
        return await processStockWebhook(itemCode);
      }

      case 'bundle': {
        return await processBundleWebhook();
      }

      default:
        throw new Error(`Unsupported entity type: ${entityType}. Friday-only entities (product, price, hero, home) are updated automatically on Friday evenings - no webhooks needed.`);
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
  processStockWebhook,
};
