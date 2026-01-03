const express = require('express');
const router = express.Router();
const {
  incrementProductViews,
  addProductRating,
  addProductComment,
} = require('../services/analytics/analytics');
const { logger } = require('../services/logger');
const { validateRequest } = require('../middleware/validate');
const {
  analyticsViewRequestSchema,
  analyticsRatingRequestSchema,
  analyticsCommentRequestSchema,
} = require('../config/validation');

/**
 * POST /api/analytics/product/:name/view
 * Increment product views count
 * Returns new view count
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002)
 */
router.post(
  '/product/:name/view',
  validateRequest(analyticsViewRequestSchema),
  async (req, res) => {
    try {
      const name = req.validatedParams.name;

      const views = await incrementProductViews(name);

      return res.json({
        success: true,
        views,
      });
    } catch (error) {
      logger.error('View increment error', {
        error: error.message,
        params: req.validatedParams,
      });
      return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to increment views',
      });
    }
  }
);

/**
 * POST /api/analytics/product/:name/rating
 * Add product rating vote (1-5 stars)
 * Body: { starRating: 1-5 }
 * Returns updated rating breakdown and review count
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002)
 */
router.post(
  '/product/:name/rating',
  validateRequest(analyticsRatingRequestSchema),
  async (req, res) => {
    try {
      const name = req.validatedParams.name;
      const { starRating } = req.validatedBody;

      const result = await addProductRating(name, starRating);

      return res.json({
        success: true,
        ratingBreakdown: result.ratingBreakdown,
        reviewCount: result.reviewCount,
      });
    } catch (error) {
      logger.error('Rating add error', {
        error: error.message,
        params: req.validatedParams,
        body: req.validatedBody,
      });
      return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to add rating',
      });
    }
  }
);

/**
 * POST /api/analytics/product/:name/comment
 * Add product comment
 * Body: { text: string, author?: string, timestamp?: string, ... }
 * Returns updated comments array
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002)
 */
router.post(
  '/product/:name/comment',
  validateRequest(analyticsCommentRequestSchema),
  async (req, res) => {
    try {
      const name = req.validatedParams.name;
      const { text, author, timestamp, ...otherFields } = req.validatedBody;

      const comment = {
        text,
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
        params: req.validatedParams,
        body: req.validatedBody,
      });
      return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to add comment',
      });
    }
  }
);

module.exports = router;

