const express = require('express');
const { setCachedPrice } = require('../services/price/price');
const { deleteCache } = require('../services/redis/cache');
const { logger } = require('../services/logger');

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
router.post('/price-update', async (req, res) => {
  try {
    const { itemCode, price, erpnextName, sizeUnit, invalidateCache } = req.body;

    // Validate required fields
    if (!erpnextName || !sizeUnit || price === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'erpnextName, sizeUnit, and price are required',
      });
    }

    // Validate price is a number
    const priceNum = parseFloat(price);
    if (isNaN(priceNum)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'price must be a valid number',
      });
    }

    // Update price in Redis
    const success = await setCachedPrice(erpnextName, sizeUnit, priceNum);

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
      price: priceNum,
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
      price: priceNum,
    });
  } catch (error) {
    logger.error('Webhook price update error', {
      error: error.message,
      body: req.body,
    });
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to process price update',
    });
  }
});

module.exports = router;

