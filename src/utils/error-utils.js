const { AppError } = require('./errors');

/**
 * Check if error is an operational error (AppError instance)
 * @param {Error} error - Error to check
 * @returns {boolean} True if operational error
 */
function isOperationalError(error) {
  if (error instanceof AppError) {
    return error.isOperational === true;
  }
  return false;
}

/**
 * Extract request context for error logging
 * @param {object} req - Express request object
 * @returns {object} Request context
 */
function getErrorContext(req) {
  return {
    path: req.path,
    method: req.method,
    deviceId: req.deviceId || null,
    ip: req.ip || req.connection?.remoteAddress || null,
    userAgent: req.get('user-agent') || null,
    query: Object.keys(req.query || {}).length > 0 ? req.query : null,
    params: Object.keys(req.params || {}).length > 0 ? req.params : null,
  };
}

/**
 * Format error for logging
 * @param {Error} error - Error to format
 * @param {object} req - Express request object (optional)
 * @returns {object} Formatted error data
 */
function formatErrorForLogging(error, req = null) {
  const formatted = {
    error: error.message,
    code: error.code || error.constructor?.name || 'UNKNOWN_ERROR',
    statusCode: error.statusCode || 500,
    stack: error.stack,
  };

  if (req) {
    formatted.context = getErrorContext(req);
  }

  // Add details if available
  if (error.details) {
    formatted.details = error.details;
  }

  return formatted;
}

/**
 * Wrapper for async route handlers to catch errors
 * Automatically passes errors to Express error handler
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped route handler
 */
function handleAsyncErrors(fn) {
  return (req, res, next) => {
    try {
      Promise.resolve(fn(req, res, next)).catch(next);
    } catch (error) {
      // Handle synchronous errors
      next(error);
    }
  };
}

module.exports = {
  isOperationalError,
  getErrorContext,
  formatErrorForLogging,
  handleAsyncErrors,
};

