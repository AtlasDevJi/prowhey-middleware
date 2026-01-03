const express = require('express');
const { updateAllStock } = require('../services/stock/stock');
const { logger } = require('../services/logger');
const { handleAsyncErrors } = require('../utils/error-utils');
const { InternalServerError } = require('../utils/errors');

const router = express.Router();

/**
 * POST /api/stock/update-all
 * Trigger bulk stock update for all published products
 * Processes ALL flavors (not just first) since each flavor has its own stock
 * Returns summary of update operation
 */
router.post(
  '/update-all',
  handleAsyncErrors(async (req, res) => {
    logger.info('Bulk stock update requested');

    try {
      const summary = await updateAllStock();

      return res.json({
        success: true,
        ...summary,
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

