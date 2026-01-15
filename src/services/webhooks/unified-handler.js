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
 * Updates price cache, computes hash, adds stream entry if changed
 * @param {string} erpnextName - ERPNext name field
 * @param {string} sizeUnit - Size identifier (e.g., "5lb")
 * @param {number} price - Price value
 * @returns {Promise<object>} Result object with {changed: boolean, version: string, streamId: string|null}
 */
async function processPriceWebhook(erpnextName, sizeUnit, price) {
  try {
    const entityId = `${erpnextName}:${sizeUnit}`;
    const priceData = { price, erpnextName, sizeUnit };

    // Compute hash
    const newHash = computeDataHash(priceData);

    // Get existing cache
    const existing = await getCacheHash('price', entityId);

    // Check if changed
    let version = '1';
    let changed = true;

    if (existing) {
      if (existing.data_hash === newHash) {
        changed = false;
        logger.info('Price webhook: no change detected', {
          erpnextName,
          sizeUnit,
          hash: newHash,
        });
        return {
          changed: false,
          version: existing.version,
          streamId: null,
        };
      }
      version = await incrementCacheHashVersion('price', entityId);
      if (!version) {
        version = (parseInt(existing.version) + 1).toString();
      }
    }

    // Update cache
    const updatedAt = Date.now().toString();
    const success = await setCacheHash('price', entityId, priceData, {
      data_hash: newHash,
      updated_at: updatedAt,
      version,
    });

    if (!success) {
      throw new Error('Failed to update price cache');
    }

    // Also update simple key for backward compatibility
    const { setPrice } = require('../redis/cache');
    await setPrice(erpnextName, sizeUnit, price);

    // Add stream entry
    const streamId = await addStreamEntry('price', entityId, newHash, version);

    logger.info('Price webhook processed', {
      erpnextName,
      sizeUnit,
      price,
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
      erpnextName,
      sizeUnit,
      error: error.message,
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
 * Unified webhook handler
 * Routes to appropriate processor based on entity_type
 * @param {string} entityType - Entity type ('product', 'price', 'stock')
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
        const { erpnextName, sizeUnit, price } = payload;
        if (!erpnextName || !sizeUnit || price === undefined) {
          throw new Error('erpnextName, sizeUnit, and price required for price webhook');
        }
        return await processPriceWebhook(erpnextName, sizeUnit, price);
      }

      case 'stock': {
        const { itemCode } = payload;
        if (!itemCode) {
          throw new Error('itemCode required for stock webhook');
        }
        return await processStockWebhook(itemCode);
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
