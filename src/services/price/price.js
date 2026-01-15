const { createErpnextClient, fetchItemPrices } = require('../erpnext/client');
const {
  getPrice,
  setPrice,
  getItemPrice,
  setItemPrice,
  setCacheHash,
  getCacheHash,
  incrementCacheHashVersion,
} = require('../redis/cache');
const { computeDataHash } = require('../sync/hash-computer');
const { addStreamEntry } = require('../sync/stream-manager');
const { logger } = require('../logger');

/**
 * Update price for a single item code
 * Fetches retail and wholesale prices from ERPNext, builds price array, and caches it
 * @param {string} itemCode - The item code to update
 * @returns {Promise<Array<number>|null>} Price array [retail, wholesale] or null if failed
 */
async function updateItemPrice(itemCode) {
  try {
    // Fetch prices from ERPNext
    const { retail, wholesale } = await fetchItemPrices(itemCode);

    // Build price array: [retail, wholesale] (use 0 if price not found)
    // Note: It's valid for an item to have no prices set up yet (both will be 0)
    const priceArray = [
      retail !== null && retail !== undefined ? retail : 0,
      wholesale !== null && wholesale !== undefined ? wholesale : 0,
    ];

    logger.info('Fetched prices for item', {
      itemCode,
      retail,
      wholesale,
      priceArray,
    });

    // Prepare price data for hash computation
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
          logger.info('Price update: no change detected', {
            itemCode,
            hash: newHash,
          });
          // Still return the price array (for backward compatibility)
          return priceArray;
        } else {
          // Hash matches but actual data differs - manual change detected
          logger.info('Manual Redis change detected for price', {
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

    // Update cache hash with metadata (primary storage for sync)
    const updatedAt = Date.now().toString();
    const hashSuccess = await setCacheHash('price', itemCode, priceData, {
      data_hash: newHash,
      updated_at: updatedAt,
      version,
    });

    if (!hashSuccess) {
      logger.error('Failed to cache item price hash', { itemCode });
      return null;
    }

    // Also cache as simple key for backward compatibility
    await setItemPrice(itemCode, priceArray);

    // Add stream entry if changed (important: app needs to know about any change)
    if (changed) {
      const streamId = await addStreamEntry('price', itemCode, newHash, version);
      logger.info('Price stream entry added', {
        itemCode,
        streamId,
        hash: newHash,
        version,
      });
    } else {
      logger.info('Price unchanged, no stream entry added', {
        itemCode,
        hash: newHash,
      });
    }

    logger.info('Item price updated', {
      itemCode,
      retail,
      wholesale,
      priceArray,
      changed,
      version,
      hash: newHash,
    });
    return priceArray;
  } catch (error) {
    logger.error('Failed to update item price', {
      itemCode,
      error: error.message,
      stack: error.stack,
      errorDetails: error,
    });
    return null;
  }
}

/**
 * Fetch item price from ERPNext Item Price doctype
 * @param {string} itemCode - The item code to fetch price for
 * @param {string} priceList - The price list name (default: "Standard Selling")
 * @returns {Promise<number|null>} The price or null if not found
 */
async function fetchItemPrice(itemCode, priceList = 'Standard Selling') {
  try {
    const client = createErpnextClient();
    const doctype = 'Item Price';

    const fields = ['item_code', 'price_list_rate'];
    const filters = [
      ['price_list', '=', priceList],
      ['item_code', '=', itemCode],
    ];

    const queryParams = new URLSearchParams({
      fields: JSON.stringify(fields),
      filters: JSON.stringify(filters),
    });

    const url = `${doctype}?${queryParams.toString()}`;
    const response = await client.get(url);

    if (
      !response.data ||
      !response.data.data ||
      response.data.data.length === 0
    ) {
      logger.warn('Item price not found', { itemCode, priceList });
      return null;
    }

    const priceData = response.data.data[0];
    const price = parseFloat(priceData.price_list_rate);

    if (isNaN(price)) {
      logger.warn('Invalid price value', {
        itemCode,
        priceList,
        price_list_rate: priceData.price_list_rate,
      });
      return null;
    }

    return price;
  } catch (error) {
    logger.error('Failed to fetch item price', {
      itemCode,
      priceList,
      error: error.message,
      status: error.response?.status,
    });
    return null;
  }
}

/**
 * Get cached price for a product size
 * @param {string} erpnextName - ERPNext name field (e.g., WEB-ITM-0002)
 * @param {string} sizeUnit - Size identifier (e.g., "5lb", "120caps")
 * @returns {Promise<number|null>} The cached price or null
 */
async function getCachedPrice(erpnextName, sizeUnit) {
  return await getPrice(erpnextName, sizeUnit);
}

/**
 * Set cached price for a product size
 * @param {string} erpnextName - ERPNext name field (e.g., WEB-ITM-0002)
 * @param {string} sizeUnit - Size identifier (e.g., "5lb", "120caps")
 * @param {number} price - The price to cache
 * @returns {Promise<boolean>} Success status
 */
async function setCachedPrice(erpnextName, sizeUnit, price) {
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
        // No change detected
        changed = false;
        logger.info('Price update: no change detected', {
          erpnextName,
          sizeUnit,
          hash: newHash,
        });
        // Still update simple key for backward compatibility
        await setPrice(erpnextName, sizeUnit, price);
        return true;
      }
      // Data changed, increment version
      version = await incrementCacheHashVersion('price', entityId);
      if (!version) {
        version = (parseInt(existing.version) + 1).toString();
      }
    }

    // Update simple key for backward compatibility
    const success = await setPrice(erpnextName, sizeUnit, price);
    if (!success) {
      return false;
    }

    // Update cache hash with metadata
    const updatedAt = Date.now().toString();
    await setCacheHash('price', entityId, priceData, {
      data_hash: newHash,
      updated_at: updatedAt,
      version,
    });

    // Add stream entry if changed
    if (changed) {
      await addStreamEntry('price', entityId, newHash, version);
    }

    logger.info('Price cached with sync metadata', {
      erpnextName,
      sizeUnit,
      price,
      changed,
      version,
      hash: newHash,
    });

    return true;
  } catch (error) {
    logger.error('Price cache error', {
      erpnextName,
      sizeUnit,
      error: error.message,
    });
    // Fallback to simple setPrice for backward compatibility
    return await setPrice(erpnextName, sizeUnit, price);
  }
}

/**
 * Build size identifier from size and unit
 * Format: {size}{unit} (e.g., "5lb", "120caps")
 * @param {number} size - Numeric size
 * @param {string} unit - Unit string
 * @returns {string} Size identifier
 */
function buildSizeIdentifier(size, unit) {
  return `${size}${unit}`.toLowerCase();
}

/**
 * Get product prices for all sizes
 * Fetches prices from cache or ERPNext, then caches them
 * @param {string} erpnextName - ERPNext name field (e.g., WEB-ITM-0002)
 * @param {Array} variants - Parsed variants array from custom_variant
 * @returns {Promise<Object>} Object with size identifiers as keys and prices as values
 */
async function getProductPrices(erpnextName, variants) {
  const prices = {};

  if (!variants || !Array.isArray(variants) || variants.length === 0) {
    return prices;
  }

  // Process each size
  for (const sizeData of variants) {
    const { size, unit, flavors } = sizeData;

    if (!size || !unit) {
      logger.warn('Invalid size data', { erpnextName, sizeData });
      continue;
    }

    // Build size identifier
    const sizeUnit = buildSizeIdentifier(size, unit);

    // Check cache first
    let price = await getCachedPrice(erpnextName, sizeUnit);

    if (price === null) {
      // Not in cache, fetch from ERPNext
      // Always use first flavor's itemCode (always exists, even if "unflavored")
      if (!flavors || !Array.isArray(flavors) || flavors.length === 0) {
        logger.warn('No flavors found for size', {
          erpnextName,
          sizeUnit,
        });
        continue;
      }

      const firstFlavor = flavors[0];
      const itemCode = firstFlavor.itemCode;

      if (!itemCode) {
        logger.warn('No itemCode in first flavor', {
          erpnextName,
          sizeUnit,
          flavor: firstFlavor,
        });
        continue;
      }

      // Fetch price from ERPNext
      price = await fetchItemPrice(itemCode);

      if (price !== null) {
        // Cache the price
        await setCachedPrice(erpnextName, sizeUnit, price);
        logger.info('Price fetched and cached', {
          erpnextName,
          sizeUnit,
          itemCode,
          price,
        });
      } else {
        logger.warn('Price not found for item', {
          erpnextName,
          sizeUnit,
          itemCode,
        });
      }
    }

    // Add to prices object (even if null, to indicate we tried)
    if (price !== null) {
      prices[sizeUnit] = price;
    }
  }

  return prices;
}

/**
 * Parse custom_variant JSON string (duplicated from transformer to avoid circular dependency)
 * @param {string} customVariantString - JSON string of custom_variant
 * @returns {Array} Parsed variants array
 */
function parseCustomVariant(customVariantString) {
  if (!customVariantString) {
    return [];
  }

  try {
    const parsed = JSON.parse(customVariantString);
    return parsed.sizes || [];
  } catch (error) {
    logger.warn('Failed to parse custom_variant', {
      error: error.message,
    });
    return [];
  }
}

/**
 * Update all prices for all published products
 * Fetches all published Website Items, extracts unique item codes, and updates prices
 * Follows same pattern as stock refresh: deduplicates item codes, processes in batches
 * @returns {Promise<Object>} Summary of update operation
 */
async function updateAllPrices() {
  const { fetchPublishedWebsiteItems } = require('../erpnext/client');

  const summary = {
    total: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
  };

  try {
    const products = await fetchPublishedWebsiteItems();

    logger.info('Starting bulk price update', {
      totalProducts: products.length,
    });

    // Step 1: Collect all unique item codes from all products
    const itemCodeSet = new Set();
    const productItemMap = new Map(); // Track which products have which item codes for error reporting

    for (const product of products) {
      const { name: erpnextName, custom_variant } = product;

      if (!erpnextName) {
        continue;
      }

      try {
        const parsedVariants = parseCustomVariant(custom_variant);
        if (!parsedVariants || parsedVariants.length === 0) {
          continue;
        }

        for (const sizeData of parsedVariants) {
          const { flavors } = sizeData;

          if (!flavors || !Array.isArray(flavors)) {
            continue;
          }

          for (const flavor of flavors) {
            const itemCode = flavor.itemCode;

            if (!itemCode) {
              continue;
            }

            // Deduplicate: only add if not already seen
            if (!itemCodeSet.has(itemCode)) {
              itemCodeSet.add(itemCode);
              productItemMap.set(itemCode, erpnextName);
            }
          }
        }
      } catch (error) {
        summary.errors.push({
          erpnextName,
          error: `Failed to parse variants: ${error.message}`,
        });
      }
    }

    const uniqueItemCodes = Array.from(itemCodeSet);
    summary.total = uniqueItemCodes.length;

    logger.info('Collected unique item codes', {
      totalProducts: products.length,
      uniqueItemCodes: uniqueItemCodes.length,
    });

    // Step 2: Process items in parallel batches (10 at a time for performance)
    const BATCH_SIZE = 10;
    const batches = [];

    for (let i = 0; i < uniqueItemCodes.length; i += BATCH_SIZE) {
      batches.push(uniqueItemCodes.slice(i, i + BATCH_SIZE));
    }

    for (const batch of batches) {
      // Process batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(async (itemCode) => {
          try {
            // Use updateItemPrice which handles hash-based change detection
            const priceArray = await updateItemPrice(itemCode);
            
            if (priceArray === null) {
              // Log the actual error for debugging
              logger.error('updateItemPrice returned null', { itemCode });
              throw new Error('updateItemPrice returned null - check logs for details');
            }

            // updateItemPrice returns the price array if successful (even if [0, 0])
            // It handles hash comparison and stream entries internally
            logger.info('Successfully updated price', { itemCode, priceArray });
            return { itemCode, changed: true };
          } catch (error) {
            logger.error('Error in batch processing for item', {
              itemCode,
              error: error.message,
              stack: error.stack,
            });
            throw { itemCode, error: error.message || String(error) };
          }
        })
      );

      // Process batch results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          if (result.value.changed) {
            summary.updated++;
          } else {
            summary.unchanged++;
          }
        } else {
          const { itemCode, error } = result.reason;
          const erpnextName = productItemMap.get(itemCode) || 'unknown';
          summary.errors.push({
            itemCode,
            erpnextName,
            error,
          });
        }
      }
    }

    logger.info('Bulk price update completed', summary);
    return summary;
  } catch (error) {
    logger.error('Bulk price update failed', {
      error: error.message,
    });
    summary.errors.push({ error: error.message });
    return summary;
  }
}

module.exports = {
  fetchItemPrice,
  fetchItemPrices,
  getCachedPrice,
  setCachedPrice,
  getProductPrices,
  updateItemPrice,
  updateAllPrices,
  buildSizeIdentifier,
  parseCustomVariant,
};

