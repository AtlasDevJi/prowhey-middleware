const { logger } = require('../services/logger');
const { isOperationalError, formatErrorForLogging } = require('../utils/error-utils');
const { InternalServerError } = require('../utils/errors');

/**
 * Centralized error handler middleware
 * Catches all errors and formats consistent responses
 * @param {Error} err - Error object
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next middleware
 */
function errorHandler(err, req, res, _next) {
  // Determine if error is operational (expected) or programming (unexpected)
  const isOperational = isOperationalError(err);

  // If not operational, wrap in InternalServerError
  // Include original error message in development
  const error = isOperational
    ? err
    : new InternalServerError(process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred');

  // Log error with context
  const errorData = formatErrorForLogging(error, req);
  logger.error('Request error', errorData);

  // Determine if we're in development mode
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Build error response
  const response = {
    success: false,
    error: getErrorTypeName(error),
    code: error.code,
    message: error.message,
  };

  // Add details if available
  if (error.details) {
    response.details = error.details;
  }

  // Add development-only fields
  if (isDevelopment) {
    response.path = req.path;
    response.method = req.method;
    response.timestamp = new Date().toISOString();

    // Add stack trace for non-operational errors or if explicitly requested
    if (!isOperational || process.env.INCLUDE_STACK_TRACES === 'true') {
      response.stack = error.stack;
    }
  }

  // Send error response
  res.status(error.statusCode || 500).json(response);
}

/**
 * Get human-readable error type name
 * @param {Error} error - Error object
 * @returns {string} Error type name
 */
function getErrorTypeName(error) {
  const errorTypeMap = {
    VALIDATION_ERROR: 'Validation Error',
    UNAUTHORIZED_ERROR: 'Unauthorized',
    FORBIDDEN_ERROR: 'Forbidden',
    NOT_FOUND_ERROR: 'Not Found',
    CONFLICT_ERROR: 'Conflict',
    RATE_LIMIT_ERROR: 'Too Many Requests',
    INTERNAL_SERVER_ERROR: 'Internal Server Error',
  };

  return errorTypeMap[error.code] || 'Error';
}

module.exports = {
  errorHandler,
};

