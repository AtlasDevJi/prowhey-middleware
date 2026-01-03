const express = require('express');
const router = express.Router();
const {
  incrementProductViews,
  addProductRating,
  addProductComment,
} = require('../services/analytics/analytics');
const { validateRequest } = require('../middleware/validate');
const {
  analyticsViewRequestSchema,
  analyticsRatingRequestSchema,
  analyticsCommentRequestSchema,
} = require('../config/validation');
const { handleAsyncErrors } = require('../utils/error-utils');
const { InternalServerError } = require('../utils/errors');

/**
 * POST /api/analytics/product/:name/view
 * Increment product views count
 * Returns new view count
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002)
 */
router.post(
  '/product/:name/view',
  validateRequest(analyticsViewRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const name = req.validatedParams.name;

    try {
      const views = await incrementProductViews(name);

      return res.json({
        success: true,
        views,
      });
    } catch (error) {
      // If it's already an AppError, re-throw it
      if (error.isOperational) {
        throw error;
      }
      // Otherwise, wrap in InternalServerError
      throw new InternalServerError('Failed to increment views');
    }
  })
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
  handleAsyncErrors(async (req, res) => {
    const name = req.validatedParams.name;
    const { starRating } = req.validatedBody;

    try {
      const result = await addProductRating(name, starRating);

      return res.json({
        success: true,
        ratingBreakdown: result.ratingBreakdown,
        reviewCount: result.reviewCount,
      });
    } catch (error) {
      // If it's already an AppError, re-throw it
      if (error.isOperational) {
        throw error;
      }
      // Otherwise, wrap in InternalServerError
      throw new InternalServerError('Failed to add rating');
    }
  })
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
  handleAsyncErrors(async (req, res) => {
    const name = req.validatedParams.name;
    const { text, author, timestamp, ...otherFields } = req.validatedBody;

    const comment = {
      text,
      author: author || 'anonymous',
      timestamp: timestamp || new Date().toISOString(),
      ...otherFields,
    };

    try {
      const comments = await addProductComment(name, comment);

      return res.json({
        success: true,
        comments,
      });
    } catch (error) {
      // If it's already an AppError, re-throw it
      if (error.isOperational) {
        throw error;
      }
      // Otherwise, wrap in InternalServerError
      throw new InternalServerError('Failed to add comment');
    }
  })
);

module.exports = router;

