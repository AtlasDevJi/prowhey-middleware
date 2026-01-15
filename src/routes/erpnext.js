const express = require('express');
const { createErpnextClient } = require('../services/erpnext/client');
const { logger } = require('../services/logger');
const { handleAsyncErrors } = require('../utils/error-utils');

const router = express.Router();

/**
 * GET /api/erpnext/ping
 * Lightweight endpoint to validate ERPNext connectivity and credentials
 * Performs a minimal API call to verify connection
 */
router.get(
  '/ping',
  handleAsyncErrors(async (req, res) => {
    try {
      const client = createErpnextClient();
      const startTime = Date.now();

      // Make minimal API call using direct resource access (same pattern as Postman)
      // Try to fetch a known Website Item - if it doesn't exist (404), that's ok, we just want to verify connectivity
      // If it's a 500, that means ERPNext itself has an issue
      // Encode the doctype properly (spaces become %20)
      const encodedDoctype = encodeURIComponent('Website Item');
      try {
        await client.get(`/api/resource/${encodedDoctype}/WEB-ITM-0002`);
      } catch (error) {
        // 404 is acceptable (item doesn't exist), but 500 means ERPNext error
        if (error.response?.status === 404) {
          // Item doesn't exist, but ERPNext is reachable - that's fine for ping
          const latencyMs = Date.now() - startTime;
          return res.json({
            ok: true,
            latencyMs,
            message: 'ERPNext connection successful (item not found, but API is reachable)',
            note: 'WEB-ITM-0002 not found, but this confirms ERPNext API is working',
          });
        }
        // Re-throw other errors (500, auth errors, etc.)
        throw error;
      }

      const latencyMs = Date.now() - startTime;

      return res.json({
        ok: true,
        latencyMs,
        message: 'ERPNext connection successful',
      });
    } catch (error) {
      const isAuthError = error.response?.status === 401 || error.response?.status === 403;
      const message = isAuthError
        ? `ERPNext authentication failed: ${error.message}`
        : `ERPNext connection failed: ${error.message}`;

      logger.error('ERPNext ping failed', {
        error: error.message,
        status: error.response?.status,
        responseData: error.response?.data,
        url: error.config?.url,
      });

      return res.status(isAuthError ? 401 : 500).json({
        ok: false,
        error: message,
        status: error.response?.status,
      });
    }
  })
);

module.exports = router;
