const express = require('express');
const { handleAsyncErrors } = require('../utils/error-utils');
const { NotFoundError, InternalServerError } = require('../utils/errors');
const { getCacheHashData, setCacheHash, getCacheHash } = require('../services/redis/cache');
const { fetchHeroImages, fetchBundleImages, fetchAppHome } = require('../services/erpnext/client');
const { transformHeroImages, transformBundleImages, transformAppHome } = require('../services/cache/transformer');
const { computeDataHash } = require('../services/sync/hash-computer');
const { logger } = require('../services/logger');

const router = express.Router();

/**
 * GET /api/hero
 * Get hero images (cached, with detail-page caching strategy)
 * Returns array of base64-encoded hero images
 */
router.get(
  '/hero',
  handleAsyncErrors(async (req, res) => {
    const entityId = 'hero';

    try {
      // Check Redis hash cache first
      const cached = await getCacheHash('hero', entityId);

      if (cached) {
        logger.info('Hero cache hit', { entityId });
        const heroData = await getCacheHashData('hero', entityId);
        return res.json({
          success: true,
          ...heroData,
        });
      }

      // Cache miss - fetch from ERPNext
      logger.info('Hero cache miss, fetching from ERPNext', { entityId });

      // Fetch hero images from ERPNext
      const fileUrls = await fetchHeroImages();

      if (!fileUrls || fileUrls.length === 0) {
        throw new NotFoundError('No hero images found');
      }

      // Wrap in ERPNext response format for transformer
      const erpnextData = {
        data: fileUrls.map((url) => ({ file_url: url })),
      };

      // Transform (downloads images and converts to base64)
      const transformedData = await transformHeroImages(erpnextData);

      // Compute hash
      const newHash = computeDataHash(transformedData);

      // Cache the transformed data
      const updatedAt = Date.now().toString();
      const version = '1';
      await setCacheHash('hero', entityId, transformedData, {
        data_hash: newHash,
        updated_at: updatedAt,
        version,
      });

      logger.info('Hero data cached', { entityId, imageCount: transformedData.heroImages?.length || 0 });

      return res.json({
        success: true,
        ...transformedData,
      });
    } catch (error) {
      if (error.isOperational) {
        throw error;
      }
      throw new InternalServerError('Failed to fetch hero images');
    }
  })
);

/**
 * GET /api/home
 * Get App Home data (cached, with detail-page caching strategy)
 * Returns App Home data with parsed JSON fields
 */
router.get(
  '/home',
  handleAsyncErrors(async (req, res) => {
    const entityId = 'home';

    try {
      // Check Redis hash cache first
      const cached = await getCacheHash('home', entityId);

      if (cached) {
        logger.info('Home cache hit', { entityId });
        const homeData = await getCacheHashData('home', entityId);
        return res.json({
          success: true,
          ...homeData,
        });
      }

      // Cache miss - fetch from ERPNext
      logger.info('Home cache miss, fetching from ERPNext', { entityId });

      // Fetch App Home from ERPNext
      const appHomeData = await fetchAppHome();

      if (!appHomeData) {
        throw new NotFoundError('App Home data not found');
      }

      // Wrap in ERPNext response format for transformer
      const erpnextData = { data: appHomeData };

      // Transform (parses JSON strings)
      const transformedData = await transformAppHome(erpnextData);

      if (!transformedData) {
        throw new InternalServerError('Failed to transform App Home data');
      }

      // Compute hash
      const newHash = computeDataHash(transformedData);

      // Cache the transformed data
      const updatedAt = Date.now().toString();
      const version = '1';
      await setCacheHash('home', entityId, transformedData, {
        data_hash: newHash,
        updated_at: updatedAt,
        version,
      });

      logger.info('Home data cached', { entityId });

      return res.json({
        success: true,
        ...transformedData,
      });
    } catch (error) {
      if (error.isOperational) {
        throw error;
      }
      throw new InternalServerError('Failed to fetch App Home data');
    }
  })
);

/**
 * GET /api/bundle
 * Get bundle images (cached, with detail-page caching strategy)
 * Returns array of base64-encoded bundle images
 */
router.get(
  '/bundle',
  handleAsyncErrors(async (req, res) => {
    const entityId = 'bundle';

    try {
      // Check Redis hash cache first
      const cached = await getCacheHash('bundle', entityId);

      if (cached) {
        logger.info('Bundle cache hit', { entityId });
        const bundleData = await getCacheHashData('bundle', entityId);
        return res.json({
          success: true,
          ...bundleData,
        });
      }

      // Cache miss - fetch from ERPNext
      logger.info('Bundle cache miss, fetching from ERPNext', { entityId });

      // Fetch bundle images from ERPNext
      const fileUrls = await fetchBundleImages();

      if (!fileUrls || fileUrls.length === 0) {
        throw new NotFoundError('No bundle images found');
      }

      // Wrap in ERPNext response format for transformer
      const erpnextData = {
        data: fileUrls.map((url) => ({ file_url: url })),
      };

      // Transform (downloads images and converts to base64)
      const transformedData = await transformBundleImages(erpnextData);

      // Compute hash
      const newHash = computeDataHash(transformedData);

      // Cache the transformed data
      const updatedAt = Date.now().toString();
      const version = '1';
      await setCacheHash('bundle', entityId, transformedData, {
        data_hash: newHash,
        updated_at: updatedAt,
        version,
      });

      logger.info('Bundle data cached', { entityId, imageCount: transformedData.bundleImages?.length || 0 });

      return res.json({
        success: true,
        ...transformedData,
      });
    } catch (error) {
      if (error.isOperational) {
        throw error;
      }
      throw new InternalServerError('Failed to fetch bundle images');
    }
  })
);

module.exports = router;
