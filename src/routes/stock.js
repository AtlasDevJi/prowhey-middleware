const express = require('express');
const { updateAllStock } = require('../services/stock/stock');
const { logger } = require('../services/logger');

const router = express.Router();

/**
 * POST /api/stock/update-all
 * Trigger bulk stock update for all published products
 * Processes ALL flavors (not just first) since each flavor has its own stock
 * Returns summary of update operation
 */
router.post('/update-all', async (req, res) => {
  try {
    logger.info('Bulk stock update requested');

    const summary = await updateAllStock();

    return res.json({
      success: true,
      ...summary,
    });
  } catch (error) {
    logger.error('Bulk stock update error', {
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to update stock availability',
    });
  }
});

module.exports = router;

