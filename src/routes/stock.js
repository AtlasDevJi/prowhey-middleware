const express = require('express');
const { refreshAllStock } = require('../services/sync/full-refresh');
const { getItemAvailability } = require('../services/stock/stock');
const { getWarehouseReferenceArray } = require('../services/stock/stock');
const { logger } = require('../services/logger');
const { handleAsyncErrors } = require('../utils/error-utils');
const { InternalServerError, NotFoundError } = require('../utils/errors');

const router = express.Router();

/**
 * GET /api/stock/:itemCode
 * Get stock availability for a specific item code
 * Returns only the availability array (warehouse reference fetched separately)
 */
router.get(
  '/:itemCode',
  handleAsyncErrors(async (req, res) => {
    const { itemCode } = req.params;

    if (!itemCode) {
      throw new NotFoundError('Item code required');
    }

    try {
      const availability = await getItemAvailability(itemCode);

      if (availability === null) {
        throw new NotFoundError(`Stock availability not found for item code: ${itemCode}`);
      }

      return res.json({
        success: true,
        itemCode,
        availability,
      });
    } catch (error) {
      if (error.isOperational) {
        throw error;
      }
      throw new InternalServerError('Failed to fetch stock availability');
    }
  })
);

/**
 * GET /api/stock/warehouses/reference
 * Get warehouse reference array
 * App should fetch this once a month since warehouses rarely change
 */
router.get(
  '/warehouses/reference',
  handleAsyncErrors(async (req, res) => {
    try {
      const warehouseReference = await getWarehouseReferenceArray();

      return res.json({
        success: true,
        warehouses: warehouseReference,
        count: warehouseReference.length,
      });
    } catch (error) {
      throw new InternalServerError('Failed to fetch warehouse reference');
    }
  })
);

/**
 * POST /api/stock/update-all
 * Trigger bulk stock snapshot for all published products
 * Processes ALL flavors (not just first) since each flavor has its own stock
 * Uses hash-based change detection - only updates stream if data changed
 * Also detects manual Redis changes by comparing actual data arrays
 * Returns summary of update operation
 */
router.post(
  '/update-all',
  handleAsyncErrors(async (req, res) => {
    logger.info('Bulk stock snapshot requested');

    try {
      const summary = await refreshAllStock();

      // Transform summary to match expected format
      return res.json({
        success: true,
        totalProductsFetched: summary.total || 0,
        productsWithVariants: summary.total || 0, // refreshAllStock doesn't track this separately
        itemsProcessed: summary.total || 0,
        updated: summary.updated || 0,
        unchanged: summary.unchanged || 0,
        failed: summary.errors?.length || 0,
        errors: summary.errors || [],
      });
    } catch (error) {
      // If it's already an AppError, re-throw it
      if (error.isOperational) {
        throw error;
      }
      // Otherwise, wrap in InternalServerError
      throw new InternalServerError('Failed to update stock availability');
    }
  })
);

module.exports = router;

