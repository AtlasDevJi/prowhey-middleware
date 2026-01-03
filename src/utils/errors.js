/**
 * Base error class for application errors
 * All custom errors extend this class
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || this.constructor.name;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Serialize error to JSON format
   * @returns {object} JSON representation of error
   */
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * Validation error (400)
 * Used for input validation failures
 */
class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Unauthorized error (401)
 * Used for authentication failures
 */
class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details = null) {
    super(message, 401, 'UNAUTHORIZED_ERROR', details);
  }
}

/**
 * Forbidden error (403)
 * Used for authorization failures
 */
class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details = null) {
    super(message, 403, 'FORBIDDEN_ERROR', details);
  }
}

/**
 * Not found error (404)
 * Used when resource is not found
 */
class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details = null) {
    super(message, 404, 'NOT_FOUND_ERROR', details);
  }
}

/**
 * Conflict error (409)
 * Used for resource conflicts (duplicates, etc.)
 */
class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details = null) {
    super(message, 409, 'CONFLICT_ERROR', details);
  }
}

/**
 * Rate limit error (429)
 * Used when rate limit is exceeded
 */
class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', details = null) {
    super(message, 429, 'RATE_LIMIT_ERROR', details);
  }
}

/**
 * Internal server error (500)
 * Used for unexpected server errors
 */
class InternalServerError extends AppError {
  constructor(message = 'Internal server error', details = null) {
    super(message, 500, 'INTERNAL_SERVER_ERROR', details);
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalServerError,
};

