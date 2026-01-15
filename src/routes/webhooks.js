const express = require('express');
const { setCachedPrice } = require('../services/price/price');
const { deleteCache } = require('../services/redis/cache');
const { processWebhook } = require('../services/webhooks/unified-handler');
const { logger } = require('../services/logger');
const { validateRequest } = require('../middleware/validate');
const {
  webhookPriceUpdateRequestSchema,
  webhookErpnextRequestSchema,
} = require('../config/validation');
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

/**
 * POST /api/webhooks/erpnext
 * Unified webhook endpoint for ERPNext to notify changes
 * Supports product, price, and stock entity types
 * Body format:
 * {
 *   entity_type: "product" | "price" | "stock",
 *   // For product:
 *   erpnextName: "WEB-ITM-0002",
 *   // For price:
 *   erpnextName: "WEB-ITM-0002",
 *   sizeUnit: "5lb",
 *   price: 29.99,
 *   // For stock:
 *   itemCode: "ITEM-001",
 *   availability: [0,0,1,0,1]
 * }
 */
router.post(
  '/erpnext',
  validateRequest(webhookErpnextRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { entity_type, ...payload } = req.validatedBody;

    try {
      // Process webhook using unified handler
      const result = await processWebhook(entity_type, payload);

      if (result.error) {
        throw new InternalServerError(result.error);
      }

      return res.json({
        success: true,
        message: `${entity_type} webhook processed successfully`,
        changed: result.changed,
        version: result.version,
        streamId: result.streamId,
        entity_type,
      });
    } catch (error) {
      // If it's already an AppError, re-throw it
      if (error.isOperational) {
        throw error;
      }
      // Otherwise, wrap in InternalServerError
      throw new InternalServerError(`Failed to process ${entity_type} webhook`);
    }
  })
);

module.exports = router;

