const express = require('express');
const { updateAllPrices } = require('../services/price/price');
const { logger } = require('../services/logger');
const { handleAsyncErrors } = require('../utils/error-utils');
const { InternalServerError } = require('../utils/errors');

const router = express.Router();

/**
 * POST /api/price/update-all
 * Trigger bulk price update for all published products
 * Returns summary of update operation
 */
router.post(
  '/update-all',
  handleAsyncErrors(async (req, res) => {
    logger.info('Bulk price update requested');

    try {
      const summary = await updateAllPrices();

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
      throw new InternalServerError('Failed to update prices');
    }
  })
);

module.exports = router;

