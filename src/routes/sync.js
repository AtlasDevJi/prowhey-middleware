const express = require('express');
const {
  processSync,
  processFastSync,
  processMediumSync,
  processSlowSync,
} = require('../services/sync/sync-handler');
const { logger } = require('../services/logger');
const { handleAsyncErrors } = require('../utils/error-utils');
const { ValidationError } = require('../utils/errors');
const { z } = require('zod');

const router = express.Router();

/**
 * Sync request body schema
 */
const syncRequestSchema = z.object({
  lastSync: z
    .record(z.string(), z.string())
    .optional()
    .default({}), // Object mapping entityType to stream ID
  entityTypes: z.array(z.string()).optional(), // Optional filter
  limit: z.number().int().min(1).max(1000).optional().default(100),
  userId: z.string().optional(), // For notification filtering
  userGroups: z.array(z.string()).optional(), // For notification filtering
  userRegion: z.string().optional(), // For notification filtering
});

/**
 * POST /api/sync/check
 * Unified sync endpoint - checks all entity types
 */
router.post(
  '/check',
  handleAsyncErrors(async (req, res) => {
    try {
      const validated = syncRequestSchema.parse({
        lastSync: req.body.lastSync,
        entityTypes: req.body.entityTypes,
        limit: req.body.limit,
        userId: req.body.userId,
        userGroups: req.body.userGroups,
        userRegion: req.body.userRegion,
      });

      const result = await processSync(
        validated.lastSync,
        validated.entityTypes,
        validated.limit
      );

      logger.info('Sync check completed', {
        inSync: result.inSync,
        updateCount: result.updates?.length || 0,
      });

      return res.json(result);
    } catch (error) {
      if (error.name === 'ZodError') {
        throw new ValidationError('Invalid sync request', error.errors);
      }
      throw error;
    }
  })
);

/**
 * POST /api/sync/check-fast
 * Fast-frequency sync endpoint (views, comments, user profile)
 */
router.post(
  '/check-fast',
  handleAsyncErrors(async (req, res) => {
    try {
      const validated = syncRequestSchema.parse({
        lastSync: req.body.lastSync,
        limit: req.body.limit,
      });

      const result = await processFastSync(validated.lastSync, validated.limit);

      return res.json(result);
    } catch (error) {
      if (error.name === 'ZodError') {
        throw new ValidationError('Invalid sync request', error.errors);
      }
      throw error;
    }
  })
);

/**
 * POST /api/sync/check-medium
 * Medium-frequency sync endpoint (stock, notifications, announcements)
 */
router.post(
  '/check-medium',
  handleAsyncErrors(async (req, res) => {
    try {
      const validated = syncRequestSchema.parse({
        lastSync: req.body.lastSync,
        limit: req.body.limit,
        userId: req.body.userId,
        userGroups: req.body.userGroups,
        userRegion: req.body.userRegion,
      });

      const result = await processMediumSync(validated.lastSync, validated.limit);

      return res.json(result);
    } catch (error) {
      if (error.name === 'ZodError') {
        throw new ValidationError('Invalid sync request', error.errors);
      }
      throw error;
    }
  })
);

/**
 * POST /api/sync/check-slow
 * Low-frequency sync endpoint (products, prices, hero list)
 */
router.post(
  '/check-slow',
  handleAsyncErrors(async (req, res) => {
    try {
      const validated = syncRequestSchema.parse({
        lastSync: req.body.lastSync,
        limit: req.body.limit,
      });

      const result = await processSlowSync(validated.lastSync, validated.limit);

      return res.json(result);
    } catch (error) {
      if (error.name === 'ZodError') {
        throw new ValidationError('Invalid sync request', error.errors);
      }
      throw error;
    }
  })
);

module.exports = router;
