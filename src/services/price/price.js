const { createErpnextClient } = require('../erpnext/client');
const {
  getPrice,
  setPrice,
  setCacheHash,
  getCacheHash,
  incrementCacheHashVersion,
} = require('../redis/cache');
const { computeDataHash } = require('../sync/hash-computer');
const { addStreamEntry } = require('../sync/stream-manager');
const { logger } = require('../logger');

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
 * Fetches all published Website Items, parses variants, and updates prices
 * @returns {Promise<Object>} Summary of update operation
 */
async function updateAllPrices() {
  const { fetchPublishedWebsiteItems } = require('../erpnext/client');

  const summary = {
    totalProductsFetched: 0,
    productsWithVariants: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // Fetch all published Website Items
    const products = await fetchPublishedWebsiteItems();
    summary.totalProductsFetched = products.length;

    logger.info('Starting bulk price update', {
      totalProductsFetched: products.length,
    });

    // Process each product
    for (const product of products) {
      const { name: erpnextName, custom_variant } = product;

      if (!erpnextName) {
        summary.skipped++;
        summary.errors.push({
          product: 'unknown',
          error: 'Missing erpnext name',
        });
        continue;
      }

      try {
        // Parse custom_variant
        const parsedVariants = parseCustomVariant(custom_variant);

        // Skip products without variants early
        if (!parsedVariants || parsedVariants.length === 0) {
          summary.skipped++;
          continue;
        }

        // Only count products that have variants
        summary.productsWithVariants++;

        // Process each size - only use first flavor's itemCode for price lookup
        for (const sizeData of parsedVariants) {
          const { size, unit, flavors } = sizeData;

          // Skip invalid size data
          if (!size || !unit) {
            continue;
          }

          // Build size identifier
          const sizeUnit = buildSizeIdentifier(size, unit);

          // Get first flavor's itemCode (only one price lookup per size)
          if (!flavors || !Array.isArray(flavors) || flavors.length === 0) {
            summary.failed++;
            summary.errors.push({
              product: erpnextName,
              sizeUnit,
              error: 'No flavors found for size',
            });
            continue;
          }

          const firstFlavor = flavors[0];
          const itemCode = firstFlavor.itemCode;

          if (!itemCode) {
            summary.failed++;
            summary.errors.push({
              product: erpnextName,
              sizeUnit,
              error: 'No itemCode in first flavor',
            });
            continue;
          }

          // Fetch price from ERPNext using first flavor's itemCode only
          const price = await fetchItemPrice(itemCode);

          if (price !== null) {
            // Store in Redis
            const success = await setCachedPrice(erpnextName, sizeUnit, price);
            if (success) {
              summary.updated++;
              logger.info('Price updated', {
                erpnextName,
                sizeUnit,
                itemCode,
                price,
              });
            } else {
              summary.failed++;
              summary.errors.push({
                product: erpnextName,
                sizeUnit,
                error: 'Failed to cache price',
              });
            }
          } else {
            summary.failed++;
            summary.errors.push({
              product: erpnextName,
              sizeUnit,
              itemCode,
              error: 'Price not found in ERPNext',
            });
          }
        }
      } catch (error) {
        summary.failed++;
        summary.errors.push({
          product: erpnextName,
          error: error.message,
        });
        logger.error('Error processing product', {
          erpnextName,
          error: error.message,
        });
      }
    }

    logger.info('Bulk price update completed', {
      totalProductsFetched: summary.totalProductsFetched,
      productsWithVariants: summary.productsWithVariants,
      updated: summary.updated,
      failed: summary.failed,
      skipped: summary.skipped,
    });
    return summary;
  } catch (error) {
    logger.error('Bulk price update failed', {
      error: error.message,
    });
    summary.errors.push({
      error: error.message,
    });
    return summary;
  }
}

module.exports = {
  fetchItemPrice,
  getCachedPrice,
  setCachedPrice,
  getProductPrices,
  updateAllPrices,
  buildSizeIdentifier,
};

