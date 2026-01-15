const { computeDataHash } = require('./hash-computer');
const { addStreamEntry } = require('./stream-manager');
const {
  setCacheHash,
  getCacheHash,
  incrementCacheHashVersion,
} = require('../redis/cache');
const { fetchPublishedWebsiteItems, fetchProduct, fetchItemStock, fetchItemPrices, fetchHeroImages, fetchBundleImages, fetchAppHome } = require('../erpnext/client');
const { transformProduct, transformHeroImages, transformBundleImages, transformAppHome } = require('../cache/transformer');
const { fetchItemPrice, updateItemPrice, parseCustomVariant } = require('../price/price');
const { getWarehouseReferenceArray, buildAvailabilityArray } = require('../stock/stock');
const { logger } = require('../logger');

/**
 * Refresh all products
 * Fetches all published products from ERPNext, compares hashes, updates cache and streams only if changed
 * @returns {Promise<object>} Summary object
 */
async function refreshAllProducts() {
  const summary = {
    total: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
  };

  try {
    // Fetch all published Website Items
    const products = await fetchPublishedWebsiteItems();
    summary.total = products.length;

    logger.info('Starting full product refresh', {
      totalProducts: products.length,
    });

    for (const product of products) {
      const { name: erpnextName } = product;

      if (!erpnextName) {
        continue;
      }

      try {
        // Fetch and transform product
        const transformedData = await fetchProduct(erpnextName);

        if (!transformedData) {
          summary.errors.push({
            erpnextName,
            error: 'Product not found',
          });
          continue;
        }

        // Compute hash
        const newHash = computeDataHash(transformedData);

        // Get existing cache
        const existing = await getCacheHash('product', erpnextName);

        // Check if changed
        let version = '1';
        let changed = false;

        if (existing) {
          if (existing.data_hash === newHash) {
            // No change
            summary.unchanged++;
            continue;
          }
          // Changed, increment version
          version = await incrementCacheHashVersion('product', erpnextName);
          if (!version) {
            version = (parseInt(existing.version) + 1).toString();
          }
        }

        changed = true;

        // Update cache hash (primary storage for sync)
        const updatedAt = Date.now().toString();
        await setCacheHash('product', erpnextName, transformedData, {
          data_hash: newHash,
          updated_at: updatedAt,
          version,
        });

        // Also update simple cache for backward compatibility
        const { setCache } = require('../redis/cache');
        await setCache('product', erpnextName, transformedData);

        // Add stream entry only if changed
        await addStreamEntry('product', erpnextName, newHash, version);

        summary.updated++;

        logger.debug('Product refreshed', {
          erpnextName,
          changed,
          version,
        });
      } catch (error) {
        summary.errors.push({
          erpnextName,
          error: error.message,
        });
        logger.error('Product refresh error', {
          erpnextName,
          error: error.message,
        });
      }
    }

    logger.info('Full product refresh completed', summary);
    return summary;
  } catch (error) {
    logger.error('Full product refresh failed', {
      error: error.message,
    });
    summary.errors.push({ error: error.message });
    return summary;
  }
}

/**
 * Refresh all prices
 * Fetches prices from ERPNext, compares hashes, updates cache and streams only if changed
 * @returns {Promise<object>} Summary object
 */
async function refreshAllPrices() {
  const summary = {
    total: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
  };

  try {
    const products = await fetchPublishedWebsiteItems();
    const { parseCustomVariant } = require('../price/price');

    logger.info('Starting full price refresh', {
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
            // Fetch prices from ERPNext
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
            const { getItemPrice } = require('../redis/cache');
            const cachedPriceArray = await getItemPrice(itemCode);

            // Check if changed
            let version = '1';
            let changed = false;

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
                  return { itemCode, changed: false };
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

            changed = true;

            // Update cache
            const updatedAt = Date.now().toString();
            await setCacheHash('price', itemCode, priceData, {
              data_hash: newHash,
              updated_at: updatedAt,
              version,
            });

            // Also update simple key
            const { setItemPrice } = require('../redis/cache');
            await setItemPrice(itemCode, priceArray);

            // Add stream entry only if changed (important: app needs to know about any change)
            const streamId = await addStreamEntry('price', itemCode, newHash, version);
            logger.info('Price stream entry added in refresh', {
              itemCode,
              streamId,
              hash: newHash,
              version,
            });

            return { itemCode, changed: true };
          } catch (error) {
            throw { itemCode, error: error.message };
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

    logger.info('Full price refresh completed', summary);
    return summary;
  } catch (error) {
    logger.error('Full price refresh failed', {
      error: error.message,
    });
    summary.errors.push({ error: error.message });
    return summary;
  }
}

/**
 * Refresh all stock
 * Fetches stock from ERPNext, compares hashes, updates cache and streams only if changed
 * @returns {Promise<object>} Summary object
 */
async function refreshAllStock() {
  const summary = {
    total: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
  };

  try {
    const products = await fetchPublishedWebsiteItems();
    const { parseCustomVariant } = require('../stock/stock');
    const referenceWarehouses = await getWarehouseReferenceArray();

    logger.info('Starting full stock refresh', {
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
            // Fetch stock from ERPNext
            const warehousesWithStock = await fetchItemStock(itemCode);
            const availabilityArray = buildAvailabilityArray(
              warehousesWithStock,
              referenceWarehouses
            );

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
                  return { itemCode, changed: false };
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
            }

            changed = true;

            // Update cache
            const updatedAt = Date.now().toString();
            await setCacheHash('stock', itemCode, stockData, {
              data_hash: newHash,
              updated_at: updatedAt,
              version,
            });

            // Also update simple key
            const { setStockAvailability } = require('../redis/cache');
            await setStockAvailability(itemCode, availabilityArray);

            // Add stream entry only if changed
            await addStreamEntry('stock', itemCode, newHash, version);

            return { itemCode, changed: true };
          } catch (error) {
            throw { itemCode, error: error.message };
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

    logger.info('Full stock refresh completed', summary);
    return summary;
  } catch (error) {
    logger.error('Full stock refresh failed', {
      error: error.message,
    });
    summary.errors.push({ error: error.message });
    return summary;
  }
}

/**
 * Refresh all hero images
 * Fetches hero images from ERPNext, downloads and converts to base64, compares hashes, updates cache and streams only if changed
 * @returns {Promise<object>} Summary object
 */
async function refreshAllHero() {
  const summary = {
    updated: 0,
    unchanged: 0,
    errors: [],
  };

  try {
    const entityId = 'hero';

    logger.info('Starting full hero refresh');

    // Fetch hero images from ERPNext
    const fileUrls = await fetchHeroImages();

    if (!fileUrls || fileUrls.length === 0) {
      logger.warn('No hero images found in ERPNext');
      return summary;
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
    if (existing && existing.data_hash === newHash) {
      summary.unchanged = 1;
      logger.info('Hero refresh: no change detected');
      return summary;
    }

    // Update cache
    const updatedAt = Date.now().toString();
    let version = '1';
    if (existing) {
      version = await incrementCacheHashVersion('hero', entityId);
      if (!version) {
        version = (parseInt(existing.version) + 1).toString();
      }
    }

    const success = await setCacheHash('hero', entityId, transformedData, {
      data_hash: newHash,
      updated_at: updatedAt,
      version,
    });

    if (!success) {
      throw new Error('Failed to update hero cache');
    }

    // Add stream entry only if changed
    await addStreamEntry('hero', entityId, newHash, version);

    summary.updated = 1;
    logger.info('Hero refresh completed', summary);
    return summary;
  } catch (error) {
    logger.error('Full hero refresh failed', {
      error: error.message,
    });
    summary.errors.push({ error: error.message });
    return summary;
  }
}

/**
 * Refresh all bundle images
 * Fetches bundle images from ERPNext, downloads and converts to base64, compares hashes, updates cache and streams only if changed
 * @returns {Promise<object>} Summary object
 */
async function refreshAllBundle() {
  const summary = {
    updated: 0,
    unchanged: 0,
    errors: [],
  };

  try {
    const entityId = 'bundle';

    logger.info('Starting full bundle refresh');

    // Fetch bundle images from ERPNext
    const fileUrls = await fetchBundleImages();

    if (!fileUrls || fileUrls.length === 0) {
      logger.warn('No bundle images found in ERPNext');
      return summary;
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
    if (existing && existing.data_hash === newHash) {
      summary.unchanged = 1;
      logger.info('Bundle refresh: no change detected');
      return summary;
    }

    // Update cache
    const updatedAt = Date.now().toString();
    let version = '1';
    if (existing) {
      version = await incrementCacheHashVersion('bundle', entityId);
      if (!version) {
        version = (parseInt(existing.version) + 1).toString();
      }
    }

    const success = await setCacheHash('bundle', entityId, transformedData, {
      data_hash: newHash,
      updated_at: updatedAt,
      version,
    });

    if (!success) {
      throw new Error('Failed to update bundle cache');
    }

    // Add stream entry only if changed
    await addStreamEntry('bundle', entityId, newHash, version);

    summary.updated = 1;
    logger.info('Bundle refresh completed', summary);
    return summary;
  } catch (error) {
    logger.error('Full bundle refresh failed', {
      error: error.message,
    });
    summary.errors.push({ error: error.message });
    return summary;
  }
}

/**
 * Refresh all App Home data
 * Fetches App Home from ERPNext, transforms, compares hashes, updates cache and streams only if changed
 * @returns {Promise<object>} Summary object
 */
async function refreshAllHome() {
  const summary = {
    updated: 0,
    unchanged: 0,
    errors: [],
  };

  try {
    const entityId = 'home';

    logger.info('Starting full home refresh');

    // Fetch App Home from ERPNext
    const appHomeData = await fetchAppHome();

    if (!appHomeData) {
      logger.warn('App Home not found in ERPNext');
      return summary;
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
    if (existing && existing.data_hash === newHash) {
      summary.unchanged = 1;
      logger.info('Home refresh: no change detected');
      return summary;
    }

    // Update cache
    const updatedAt = Date.now().toString();
    let version = '1';
    if (existing) {
      version = await incrementCacheHashVersion('home', entityId);
      if (!version) {
        version = (parseInt(existing.version) + 1).toString();
      }
    }

    const success = await setCacheHash('home', entityId, transformedData, {
      data_hash: newHash,
      updated_at: updatedAt,
      version,
    });

    if (!success) {
      throw new Error('Failed to update home cache');
    }

    // Add stream entry only if changed
    await addStreamEntry('home', entityId, newHash, version);

    summary.updated = 1;
    logger.info('Home refresh completed', summary);
    return summary;
  } catch (error) {
    logger.error('Full home refresh failed', {
      error: error.message,
    });
    summary.errors.push({ error: error.message });
    return summary;
  }
}

/**
 * Perform full refresh of all entity types
 * Only adds stream entries if hash differences detected
 * @returns {Promise<object>} Combined summary
 */
async function performFullRefresh() {
  logger.info('Starting full refresh of all entities');

  const [productsSummary, pricesSummary, stockSummary, heroSummary, bundleSummary, homeSummary] = await Promise.all([
    refreshAllProducts(),
    refreshAllPrices(),
    refreshAllStock(),
    refreshAllHero(),
    refreshAllBundle(),
    refreshAllHome(),
  ]);

  const combinedSummary = {
    products: productsSummary,
    prices: pricesSummary,
    stock: stockSummary,
    hero: heroSummary,
    bundle: bundleSummary,
    home: homeSummary,
    timestamp: new Date().toISOString(),
  };

  logger.info('Full refresh completed', combinedSummary);
  return combinedSummary;
}

module.exports = {
  refreshAllProducts,
  refreshAllPrices,
  refreshAllStock,
  refreshAllHero,
  refreshAllBundle,
  refreshAllHome,
  performFullRefresh,
};
