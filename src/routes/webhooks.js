const express = require('express');
const { setCachedPrice } = require('../services/price/price');
const { deleteCache } = require('../services/redis/cache');
const { logger } = require('../services/logger');
const { validateRequest } = require('../middleware/validate');
const { webhookPriceUpdateRequestSchema } = require('../config/validation');

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
  async (req, res) => {
    try {
      const { erpnextName, sizeUnit, price, itemCode, invalidateCache } =
        req.validatedBody;

      // Update price in Redis
      const success = await setCachedPrice(erpnextName, sizeUnit, price);

      if (!success) {
        return res.status(500).json({
          success: false,
          error: 'Internal Server Error',
          message: 'Failed to update price',
        });
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
      logger.error('Webhook price update error', {
        error: error.message,
        body: req.validatedBody,
      });
      return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to process price update',
      });
    }
  }
);

module.exports = router;

