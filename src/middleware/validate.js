const { z } = require('zod');
const { logger } = require('../services/logger');
const { sanitizeObject, sanitizePathParam } = require('../utils/sanitize');

/**
 * Format Zod validation errors into user-friendly format
 * @param {z.ZodError} error - Zod validation error
 * @returns {Array} - Array of error objects
 */
function formatValidationErrors(error) {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }));
}

/**
 * Validation middleware factory
 * Validates req.params, req.body, and req.query against a Zod schema
 * Sanitizes validated data and attaches to req.validated
 * @param {z.ZodSchema} schema - Zod schema for validation
 * @returns {Function} - Express middleware function
 */
function validateRequest(schema) {
  return async (req, res, next) => {
    try {
      // Prepare data for validation
      const dataToValidate = {
        params: req.params || {},
        body: req.body || {},
        query: req.query || {},
      };

      // Sanitize path parameters
      if (dataToValidate.params) {
        for (const [key, value] of Object.entries(dataToValidate.params)) {
          if (typeof value === 'string') {
            dataToValidate.params[key] = sanitizePathParam(value);
          }
        }
      }

      // Validate against schema
      const result = schema.safeParse(dataToValidate);

      if (!result.success) {
        const errors = formatValidationErrors(result.error);

        logger.warn('Request validation failed', {
          path: req.path,
          method: req.method,
          errors,
        });

        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Request validation failed',
          errors,
        });
      }

      // Sanitize validated data
      const validated = result.data;

      // Sanitize body (user-generated content)
      if (validated.body && typeof validated.body === 'object') {
        validated.body = sanitizeObject(validated.body);
      }

      // Attach sanitized and validated data to request
      req.validated = validated;
      req.validatedParams = validated.params;
      req.validatedBody = validated.body;
      req.validatedQuery = validated.query;

      next();
    } catch (error) {
      logger.error('Validation middleware error', {
        path: req.path,
        method: req.method,
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Validation processing failed',
      });
    }
  };
}

module.exports = {
  validateRequest,
  formatValidationErrors,
};

