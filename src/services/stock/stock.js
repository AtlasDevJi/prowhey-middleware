const { fetchItemStock } = require('../erpnext/client');
const {
  getStockAvailability,
  setStockAvailability,
  getWarehouseReference,
  setWarehouseReference,
} = require('../redis/cache');
const { logger } = require('../logger');

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
 * Default warehouse reference array (used only for initial setup)
 * This is only used if warehouses:reference doesn't exist in Redis
 * After initialization, always use the value from Redis
 * You can update warehouses:reference in Redis anytime and it will be used
 */
const DEFAULT_WAREHOUSE_REFERENCE = [
  'Idlib Store - P',
  'Allepo Store - P',
  'Homs Store - P',
  'Hama Store - P',
  'Latakia Store - P',
];

/**
 * Get warehouse reference array from Redis
 * If not exists, initializes with default list (can be changed later in Redis)
 * Always reads from Redis - you can update warehouses:reference in Redis anytime
 * @returns {Promise<Array<string>>} Warehouse reference array from Redis
 */
async function getWarehouseReferenceArray() {
  let reference = await getWarehouseReference();
  
  // If not exists, initialize with default (user can change it in Redis later)
  if (!reference || !Array.isArray(reference) || reference.length === 0) {
    await setWarehouseReference(DEFAULT_WAREHOUSE_REFERENCE);
    logger.info('Warehouse reference initialized with default list (can be changed in Redis)', {
      warehouseCount: DEFAULT_WAREHOUSE_REFERENCE.length,
      warehouses: DEFAULT_WAREHOUSE_REFERENCE,
      redisKey: 'warehouses:reference',
    });
    return DEFAULT_WAREHOUSE_REFERENCE;
  }
  
  // Always use what's in Redis
  return reference;
}

/**
 * Build availability array from warehouses with stock
 * Starts with zeros, sets index to 1 if warehouse has stock
 * Always returns array with length matching reference warehouses
 * @param {Array<string>} warehousesWithStock - Warehouses where item has stock
 * @param {Array<string>} referenceWarehouses - Reference warehouse array
 * @returns {Array<number>} Binary array [0,0,1,0,1] matching reference order
 */
function buildAvailabilityArray(warehousesWithStock, referenceWarehouses) {
  // Start with all zeros - always match reference length
  const availabilityArray = new Array(referenceWarehouses.length).fill(0);

  // Set index to 1 if warehouse has stock
  // Use case-insensitive matching to handle slight variations
  warehousesWithStock.forEach((warehouse) => {
    const index = referenceWarehouses.findIndex(
      (ref) => ref.toLowerCase().trim() === warehouse.toLowerCase().trim()
    );
    if (index !== -1) {
      availabilityArray[index] = 1;
    } else {
      // Log if warehouse from API doesn't match reference
      logger.warn('Warehouse from API not found in reference', {
        warehouse,
        referenceWarehouses,
      });
    }
  });

  return availabilityArray;
}

/**
 * Get cached availability array for an item
 * @param {string} itemCode - The item code
 * @returns {Promise<Array<number>|null>} Availability array or null
 */
async function getItemAvailability(itemCode) {
  return await getStockAvailability(itemCode);
}

/**
 * Update availability for a single item
 * Fetches stock from ERPNext, builds availability array, and caches it
 * @param {string} itemCode - The item code to update
 * @param {Array<string>} referenceWarehouses - Reference warehouse array
 * @returns {Promise<Array<number>|null>} Availability array or null if failed
 */
async function updateItemAvailability(itemCode, referenceWarehouses) {
  try {
    // Fetch warehouses with stock from ERPNext
    const warehousesWithStock = await fetchItemStock(itemCode);

    // Build availability array
    const availabilityArray = buildAvailabilityArray(
      warehousesWithStock,
      referenceWarehouses
    );

    // Cache the availability array
    const success = await setStockAvailability(itemCode, availabilityArray);

    if (success) {
      logger.info('Item availability updated', {
        itemCode,
        warehousesWithStock,
        availabilityArray,
      });
      return availabilityArray;
    } else {
      logger.error('Failed to cache item availability', { itemCode });
      return null;
    }
  } catch (error) {
    logger.error('Failed to update item availability', {
      itemCode,
      error: error.message,
    });
    return null;
  }
}


/**
 * Update all stock availability for all published products
 * Processes ALL flavors (not just first) since each flavor has its own stock
 * @returns {Promise<Object>} Summary of update operation
 */
async function updateAllStock() {
  const { fetchPublishedWebsiteItems } = require('../erpnext/client');

  const summary = {
    totalProductsFetched: 0,
    productsWithVariants: 0,
    itemsProcessed: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // Fetch all published Website Items
    const products = await fetchPublishedWebsiteItems();
    summary.totalProductsFetched = products.length;

    logger.info('Starting bulk stock update', {
      totalProductsFetched: products.length,
    });

    // Get or initialize warehouse reference array (uses fixed list)
    const referenceWarehouses = await getWarehouseReferenceArray();

    // Second pass: update stock for all items
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

        summary.productsWithVariants++;

        // Process each size
        for (const sizeData of parsedVariants) {
          const { size, unit, flavors } = sizeData;

          if (!size || !unit) {
            continue;
          }

          // Process ALL flavors (not just first) since each has its own stock
          if (!flavors || !Array.isArray(flavors) || flavors.length === 0) {
            summary.failed++;
            summary.errors.push({
              product: erpnextName,
              size: `${size}${unit}`,
              error: 'No flavors found for size',
            });
            continue;
          }

          // Update stock for each flavor
          for (const flavor of flavors) {
            const itemCode = flavor.itemCode;

            if (!itemCode) {
              summary.failed++;
              summary.errors.push({
                product: erpnextName,
                size: `${size}${unit}`,
                error: 'No itemCode in flavor',
              });
              continue;
            }

            summary.itemsProcessed++;

            // Update availability for this item
            const availabilityArray = await updateItemAvailability(
              itemCode,
              referenceWarehouses
            );

            if (availabilityArray) {
              summary.updated++;
            } else {
              summary.failed++;
              summary.errors.push({
                product: erpnextName,
                itemCode,
                error: 'Failed to update availability',
              });
            }
          }
        }
      } catch (error) {
        summary.failed++;
        summary.errors.push({
          product: erpnextName,
          error: error.message,
        });
        logger.error('Error processing product for stock update', {
          erpnextName,
          error: error.message,
        });
      }
    }

    logger.info('Bulk stock update completed', {
      totalProductsFetched: summary.totalProductsFetched,
      productsWithVariants: summary.productsWithVariants,
      itemsProcessed: summary.itemsProcessed,
      updated: summary.updated,
      failed: summary.failed,
      skipped: summary.skipped,
    });

    return summary;
  } catch (error) {
    logger.error('Bulk stock update failed', {
      error: error.message,
    });
    summary.errors.push({
      error: error.message,
    });
    return summary;
  }
}

module.exports = {
  getItemAvailability,
  updateItemAvailability,
  updateAllStock,
  getWarehouseReferenceArray,
  buildAvailabilityArray,
};

