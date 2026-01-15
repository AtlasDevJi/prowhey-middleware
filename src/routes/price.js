const express = require('express');
const { updateAllPrices, updateItemPrice } = require('../services/price/price');
const { getItemPrice, getCacheHash, getCacheHashData } = require('../services/redis/cache');
const { fetchItemPrices } = require('../services/erpnext/client');
const { computeDataHash } = require('../services/sync/hash-computer');
const { logger } = require('../services/logger');
const { handleAsyncErrors } = require('../utils/error-utils');
const { InternalServerError, NotFoundError } = require('../utils/errors');

const router = express.Router();

/**
 * GET /api/price/:itemCode
 * Get price for a specific item code
 * Returns only the price array [retail, wholesale]
 */
router.get(
  '/:itemCode',
  handleAsyncErrors(async (req, res) => {
    const { itemCode } = req.params;

    if (!itemCode) {
      throw new NotFoundError('Item code required');
    }

    try {
      // Check Redis hash cache first
      const cached = await getCacheHash('price', itemCode);

      if (cached) {
        logger.info('Price cache hit', { itemCode });
        const priceData = await getCacheHashData('price', itemCode);
        return res.json({
          success: true,
          itemCode,
          prices: priceData.prices,
        });
      }

      // Cache miss - fetch from ERPNext
      logger.info('Price cache miss, fetching from ERPNext', { itemCode });

      // Fetch prices from ERPNext
      const { retail, wholesale } = await fetchItemPrices(itemCode);

      // Build price array: [retail, wholesale] (use 0 if price not found)
      const priceArray = [
        retail !== null && retail !== undefined ? retail : 0,
        wholesale !== null && wholesale !== undefined ? wholesale : 0,
      ];

      // Prepare price data for hash computation
      const priceData = { itemCode, prices: priceArray };

      // Compute hash
      const newHash = computeDataHash(priceData);

      // Cache the price data
      const updatedAt = Date.now().toString();
      const version = '1';
      const { setCacheHash, setItemPrice } = require('../services/redis/cache');
      await setCacheHash('price', itemCode, priceData, {
        data_hash: newHash,
        updated_at: updatedAt,
        version,
      });
      await setItemPrice(itemCode, priceArray);

      logger.info('Price data cached', { itemCode });

      return res.json({
        success: true,
        itemCode,
        prices: priceArray,
      });
    } catch (error) {
      if (error.isOperational) {
        throw error;
      }
      throw new InternalServerError('Failed to fetch item price');
    }
  })
);

/**
 * POST /api/price/update-all
 * Trigger bulk price update for all published products
 * Returns summary of update operation
 */
router.post(
  '/update-all',
  handleAsyncErrors(async (req, res) => {
    logger.info('Bulk price snapshot requested');

    try {
      const summary = await updateAllPrices();

      // Return summary (matches stock refresh format)
      return res.json({
        success: true,
        total: summary.total || 0,
        updated: summary.updated || 0,
        unchanged: summary.unchanged || 0,
        errors: summary.errors || [],
      });
    } catch (error) {
      // If it's already an AppError, re-throw it
      if (error.isOperational) {
        throw error;
      }
      // Otherwise, wrap in InternalServerError
      throw new InternalServerError('Failed to update prices');
    }
  })
);

module.exports = router;

