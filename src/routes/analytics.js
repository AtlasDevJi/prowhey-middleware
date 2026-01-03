const express = require('express');
const router = express.Router();
const {
  incrementProductViews,
  addProductRating,
  addProductComment,
} = require('../services/analytics/analytics');
const { logger } = require('../services/logger');

/**
 * POST /api/analytics/product/:name/view
 * Increment product views count
 * Returns new view count
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002)
 */
router.post('/product/:name/view', async (req, res) => {
  try {
    // URL decode name (ERPNext name field, e.g., WEB-ITM-0002)
    const name = decodeURIComponent(req.params.name);

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'name is required',
      });
    }

    const views = await incrementProductViews(name);

    return res.json({
      success: true,
      views,
    });
  } catch (error) {
    logger.error('View increment error', {
      error: error.message,
      params: req.params,
    });
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to increment views',
    });
  }
});

/**
 * POST /api/analytics/product/:name/rating
 * Add product rating vote (1-5 stars)
 * Body: { starRating: 1-5 }
 * Returns updated rating breakdown and review count
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002)
 */
router.post('/product/:name/rating', async (req, res) => {
  try {
    // URL decode name (ERPNext name field, e.g., WEB-ITM-0002)
    const name = decodeURIComponent(req.params.name);

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'name is required',
      });
    }

    const { starRating } = req.body;

    if (!starRating || ![1, 2, 3, 4, 5].includes(parseInt(starRating, 10))) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'starRating must be a number between 1 and 5',
      });
    }

    const rating = parseInt(starRating, 10);
    const result = await addProductRating(name, rating);

    return res.json({
      success: true,
      ratingBreakdown: result.ratingBreakdown,
      reviewCount: result.reviewCount,
    });
  } catch (error) {
    logger.error('Rating add error', {
      error: error.message,
      params: req.params,
      body: req.body,
    });
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to add rating',
    });
  }
});

/**
 * POST /api/analytics/product/:name/comment
 * Add product comment
 * Body: { text: string, author?: string, timestamp?: string, ... }
 * Returns updated comments array
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002)
 */
router.post('/product/:name/comment', async (req, res) => {
  try {
    // URL decode name (ERPNext name field, e.g., WEB-ITM-0002)
    const name = decodeURIComponent(req.params.name);

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'name is required',
      });
    }

    const { text, author, timestamp, ...otherFields } = req.body;

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Comment text is required',
      });
    }

    const comment = {
      text: text.trim(),
      author: author || 'anonymous',
      timestamp: timestamp || new Date().toISOString(),
      ...otherFields,
    };

    const comments = await addProductComment(name, comment);

    return res.json({
      success: true,
      comments,
    });
  } catch (error) {
    logger.error('Comment add error', {
      error: error.message,
      params: req.params,
      body: req.body,
    });
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to add comment',
    });
  }
});

module.exports = router;

