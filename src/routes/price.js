const express = require('express');
const { updateAllPrices } = require('../services/price/price');
const { logger } = require('../services/logger');

const router = express.Router();

/**
 * POST /api/price/update-all
 * Trigger bulk price update for all published products
 * Returns summary of update operation
 */
router.post('/update-all', async (req, res) => {
  try {
    logger.info('Bulk price update requested');
    
    const summary = await updateAllPrices();

    return res.json({
      success: true,
      ...summary,
    });
  } catch (error) {
    logger.error('Bulk price update error', {
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to update prices',
    });
  }
});

module.exports = router;

