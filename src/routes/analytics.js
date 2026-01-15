const express = require('express');
const router = express.Router();
const {
  incrementProductViews,
  getProductViews,
  addProductRating,
  getProductRatings,
  addProductComment,
  getProductComments,
  trackSearch,
  addToWishlist,
  removeFromWishlist,
  getUserWishlist,
  trackAppSession,
  trackProductInteraction,
  processBatchEvents,
} = require('../services/analytics/analytics');
const { validateRequest } = require('../middleware/validate');
const {
  analyticsViewRequestSchema,
  analyticsRatingRequestSchema,
  analyticsRatingGetRequestSchema,
  analyticsCommentRequestSchema,
  analyticsCommentGetRequestSchema,
  analyticsSearchRequestSchema,
  analyticsWishlistRequestSchema,
  analyticsSessionRequestSchema,
  analyticsInteractionRequestSchema,
  analyticsBatchRequestSchema,
} = require('../config/validation');
const { handleAsyncErrors } = require('../utils/error-utils');
const { InternalServerError } = require('../utils/errors');
const { authenticate, verifyToken, JWT_SECRET } = require('../middleware/auth');
const { getUserById } = require('../services/auth/user-storage');

/**
 * Helper to extract userId from request (optional auth)
 * Tries to extract from req.user first (if authenticate middleware ran)
 * Otherwise, tries to extract from JWT token in Authorization header
 */
async function getUserIdFromRequest(req) {
  // If authenticate middleware already set req.user, use it
  if (req.user?.userId || req.user?.id) {
    return req.user.userId || req.user.id;
  }
  
  // Otherwise, try to extract from token manually (optional auth)
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token, JWT_SECRET);
      if (decoded && decoded.userId) {
        // Optionally verify user exists (lightweight check)
        const user = await getUserById(decoded.userId);
        if (user && user.isVerified && !user.deleted) {
          return decoded.userId;
        }
      }
    }
  } catch (error) {
    // Silently fail - optional auth means we continue without userId
  }
  
  return null;
}

/**
 * POST /api/analytics/product/:name/view
 * Increment product views count
 * Returns new view count
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002)
 * Enhanced to support optional metadata and user tracking
 */
router.post(
  '/product/:name/view',
  validateRequest(analyticsViewRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const name = req.validatedParams.name;
    const userId = await getUserIdFromRequest(req);
    const metadata = req.validatedBody || {};

    try {
      const views = await incrementProductViews(name, userId, metadata);

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
 * GET /api/analytics/product/:name/view
 * Get product view count (public access)
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002)
 */
router.get(
  '/product/:name/view',
  validateRequest(analyticsViewRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const name = req.validatedParams.name;

    try {
      const views = await getProductViews(name);

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
      throw new InternalServerError('Failed to get views');
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

/**
 * GET /api/analytics/product/:name/comment
 * Get product comments (public access)
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002)
 */
router.get(
  '/product/:name/comment',
  validateRequest(analyticsCommentGetRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const name = req.validatedParams.name;

    try {
      const comments = await getProductComments(name);

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
      throw new InternalServerError('Failed to get comments');
    }
  })
);

/**
 * GET /api/analytics/product/:name/rating
 * Get product ratings (public access)
 * Uses ERPNext 'name' field (e.g., WEB-ITM-0002)
 */
router.get(
  '/product/:name/rating',
  validateRequest(analyticsRatingGetRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const name = req.validatedParams.name;

    try {
      const ratings = await getProductRatings(name);

      return res.json({
        success: true,
        ratingBreakdown: ratings.ratingBreakdown,
        reviewCount: ratings.reviewCount,
      });
    } catch (error) {
      // If it's already an AppError, re-throw it
      if (error.isOperational) {
        throw error;
      }
      // Otherwise, wrap in InternalServerError
      throw new InternalServerError('Failed to get ratings');
    }
  })
);

/**
 * POST /api/analytics/batch
 * Process multiple analytics events in one request (analytics-only)
 * Authentication optional
 */
router.post(
  '/batch',
  validateRequest(analyticsBatchRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { events, session_id, device_id } = req.validatedBody;
    const userId = await getUserIdFromRequest(req);

    try {
      const result = await processBatchEvents(events, userId, device_id, session_id);

      return res.json({
        success: true,
        processed: result.processed,
        failed: result.failed,
        errors: result.errors.length > 0 ? result.errors : undefined,
      });
    } catch (error) {
      // If it's already an AppError, re-throw it
      if (error.isOperational) {
        throw error;
      }
      // Otherwise, wrap in InternalServerError
      throw new InternalServerError('Failed to process batch events');
    }
  })
);

/**
 * POST /api/analytics/search
 * Track search event (analytics-only, write-only)
 */
router.post(
  '/search',
  validateRequest(analyticsSearchRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { term, filters, results_count, clicked_results } = req.validatedBody;
    const userId = await getUserIdFromRequest(req);
    const deviceId = req.headers['x-device-id'] || null;
    const sessionId = req.headers['x-session-id'] || null;

    try {
      await trackSearch(
        term,
        filters || {},
        results_count || 0,
        clicked_results || [],
        userId,
        deviceId,
        sessionId
      );

      return res.json({
        success: true,
        message: 'Search tracked successfully',
      });
    } catch (error) {
      // If it's already an AppError, re-throw it
      if (error.isOperational) {
        throw error;
      }
      // Otherwise, wrap in InternalServerError
      throw new InternalServerError('Failed to track search');
    }
  })
);

/**
 * POST /api/analytics/wishlist/add
 * Add product to user wishlist (authenticated)
 */
router.post(
  '/wishlist/add',
  authenticate,
  validateRequest(analyticsWishlistRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { product_name } = req.validatedBody;
    const userId = req.user.userId;

    try {
      const wishlist = await addToWishlist(userId, product_name);

      return res.json({
        success: true,
        wishlist,
      });
    } catch (error) {
      // If it's already an AppError, re-throw it
      if (error.isOperational) {
        throw error;
      }
      // Otherwise, wrap in InternalServerError
      throw new InternalServerError('Failed to add to wishlist');
    }
  })
);

/**
 * POST /api/analytics/wishlist/remove
 * Remove product from user wishlist (authenticated)
 */
router.post(
  '/wishlist/remove',
  authenticate,
  validateRequest(analyticsWishlistRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { product_name } = req.validatedBody;
    const userId = req.user.userId;

    try {
      const wishlist = await removeFromWishlist(userId, product_name);

      return res.json({
        success: true,
        wishlist,
      });
    } catch (error) {
      // If it's already an AppError, re-throw it
      if (error.isOperational) {
        throw error;
      }
      // Otherwise, wrap in InternalServerError
      throw new InternalServerError('Failed to remove from wishlist');
    }
  })
);

/**
 * GET /api/analytics/wishlist
 * Get user's own wishlist (authenticated only)
 */
router.get(
  '/wishlist',
  authenticate,
  handleAsyncErrors(async (req, res) => {
    const userId = req.user.userId;

    try {
      const wishlist = await getUserWishlist(userId);

      return res.json({
        success: true,
        wishlist,
      });
    } catch (error) {
      // If it's already an AppError, re-throw it
      if (error.isOperational) {
        throw error;
      }
      // Otherwise, wrap in InternalServerError
      throw new InternalServerError('Failed to get wishlist');
    }
  })
);

/**
 * POST /api/analytics/session/open
 * Track app opened event (analytics-only, write-only)
 */
router.post(
  '/session/open',
  validateRequest(analyticsSessionRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { session_id, metadata } = req.validatedBody;
    const userId = await getUserIdFromRequest(req);

    try {
      const result = await trackAppSession('app_open', userId, session_id, metadata || {});

      return res.json({
        success: true,
        sessionId: result.sessionId,
        startTime: result.startTime,
      });
    } catch (error) {
      // If it's already an AppError, re-throw it
      if (error.isOperational) {
        throw error;
      }
      // Otherwise, wrap in InternalServerError
      throw new InternalServerError('Failed to track app open');
    }
  })
);

/**
 * POST /api/analytics/session/close
 * Track app closed event (analytics-only, write-only)
 */
router.post(
  '/session/close',
  validateRequest(analyticsSessionRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { session_id, metadata } = req.validatedBody;
    const userId = await getUserIdFromRequest(req);

    try {
      const result = await trackAppSession('app_close', userId, session_id, metadata || {});

      return res.json({
        success: true,
        sessionId: result.sessionId,
        endTime: result.endTime,
      });
    } catch (error) {
      // If it's already an AppError, re-throw it
      if (error.isOperational) {
        throw error;
      }
      // Otherwise, wrap in InternalServerError
      throw new InternalServerError('Failed to track app close');
    }
  })
);

/**
 * POST /api/analytics/session/heartbeat
 * Track app heartbeat event (analytics-only, write-only)
 */
router.post(
  '/session/heartbeat',
  validateRequest(analyticsSessionRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { session_id, metadata } = req.validatedBody;
    const userId = await getUserIdFromRequest(req);

    try {
      const result = await trackAppSession('heartbeat', userId, session_id, metadata || {});

      return res.json({
        success: true,
        sessionId: result.sessionId,
        lastSeen: result.lastSeen,
      });
    } catch (error) {
      // If it's already an AppError, re-throw it
      if (error.isOperational) {
        throw error;
      }
      // Otherwise, wrap in InternalServerError
      throw new InternalServerError('Failed to track heartbeat');
    }
  })
);

/**
 * POST /api/analytics/interaction
 * Track product interaction (analytics-only, write-only)
 */
router.post(
  '/interaction',
  validateRequest(analyticsInteractionRequestSchema),
  handleAsyncErrors(async (req, res) => {
    const { type, product_name, metadata } = req.validatedBody;
    const userId = await getUserIdFromRequest(req);

    try {
      await trackProductInteraction(type, product_name, metadata || {}, userId);

      return res.json({
        success: true,
        message: 'Interaction tracked successfully',
      });
    } catch (error) {
      // If it's already an AppError, re-throw it
      if (error.isOperational) {
        throw error;
      }
      // Otherwise, wrap in InternalServerError
      throw new InternalServerError('Failed to track interaction');
    }
  })
);

module.exports = router;

