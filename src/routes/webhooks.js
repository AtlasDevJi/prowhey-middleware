const express = require('express');
const { setCachedPrice } = require('../services/price/price');
const { deleteCache } = require('../services/redis/cache');
const { logger } = require('../services/logger');
const { validateRequest } = require('../middleware/validate');
const { webhookPriceUpdateRequestSchema } = require('../config/validation');
const { handleAsyncErrors } = require('../utils/error-utils');
const { InternalServerError } = require('../utils/errors');

const router = express.Router();

/**
 * POST /api/webhooks/price-update
 * Webhook endpoint for ERPNext to notify price changes
 * Body format: {
 *   itemCode: string,
 *   price: number,
 *   erpnextName: string,  // ERPNext name field (e.g., WEB-ITM-0002)
 *   sizeUnit: string      // Size identifier (e.g., "5lb", "120caps")
 * }
 * 
 * Optionally can invalidate product cache:
 * {
 *   itemCode: string,
 *   price: number,
 *   erpnextName: string,
 *   sizeUnit: string,
 *   invalidateCache: boolean  // If true, invalidate product cache
 * }
 */
router.post(
  '/price-update',
  validateRequest(webhookPriceUpdateRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { erpnextName, sizeUnit, price, itemCode, invalidateCache } =
      req.validatedBody;

    try {
      // Update price in Redis
      const success = await setCachedPrice(erpnextName, sizeUnit, price);

      if (!success) {
        throw new InternalServerError('Failed to update price');
      }

      logger.info('Price updated via webhook', {
        erpnextName,
        sizeUnit,
        itemCode,
        price,
      });

      // Optionally invalidate product cache
      if (invalidateCache) {
        // Invalidate product cache using erpnextName as entityId
        await deleteCache('product', erpnextName);
        logger.info('Product cache invalidated', {
          erpnextName,
        });
      }

      return res.json({
        success: true,
        message: 'Price updated successfully',
        erpnextName,
        sizeUnit,
        price,
      });
    } catch (error) {
      // If it's already an AppError, re-throw it
      if (error.isOperational) {
        throw error;
      }
      // Otherwise, wrap in InternalServerError
      throw new InternalServerError('Failed to process price update');
    }
  })
);

module.exports = router;

