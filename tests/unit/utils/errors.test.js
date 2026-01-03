const {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  InternalServerError,
} = require('../../../src/utils/errors');

describe('Error Classes', () => {
  describe('AppError', () => {
    test('should create error with default values', () => {
      const error = new AppError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('AppError');
      expect(error.isOperational).toBe(true);
      expect(error.details).toBeNull();
    });

    test('should create error with custom values', () => {
      const details = { field: 'email', reason: 'Invalid format' };
      const error = new AppError('Custom error', 400, 'CUSTOM_ERROR', details);

      expect(error.message).toBe('Custom error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('CUSTOM_ERROR');
      expect(error.details).toEqual(details);
    });

    test('should serialize to JSON', () => {
      const details = { field: 'email' };
      const error = new AppError('Test error', 400, 'TEST_ERROR', details);

      const json = error.toJSON();

      expect(json).toEqual({
        code: 'TEST_ERROR',
        message: 'Test error',
        details,
      });
    });

    test('should serialize to JSON without details', () => {
      const error = new AppError('Test error', 400, 'TEST_ERROR');

      const json = error.toJSON();

      expect(json).toEqual({
        code: 'TEST_ERROR',
        message: 'Test error',
      });
      expect(json.details).toBeUndefined();
    });
  });

  describe('ValidationError', () => {
    test('should create validation error with default values', () => {
      const error = new ValidationError();

      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    test('should create validation error with custom message and details', () => {
      const details = { fields: [{ field: 'email', message: 'Invalid' }] };
      const error = new ValidationError('Custom validation error', details);

      expect(error.message).toBe('Custom validation error');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual(details);
    });
  });

  describe('NotFoundError', () => {
    test('should create not found error', () => {
      const error = new NotFoundError('Resource not found');

      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND_ERROR');
    });
  });

  describe('UnauthorizedError', () => {
    test('should create unauthorized error', () => {
      const error = new UnauthorizedError('Unauthorized access');

      expect(error.message).toBe('Unauthorized access');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED_ERROR');
    });
  });

  describe('ForbiddenError', () => {
    test('should create forbidden error', () => {
      const error = new ForbiddenError('Access forbidden');

      expect(error.message).toBe('Access forbidden');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN_ERROR');
    });
  });

  describe('ConflictError', () => {
    test('should create conflict error', () => {
      const error = new ConflictError('Resource conflict');

      expect(error.message).toBe('Resource conflict');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT_ERROR');
    });
  });

  describe('RateLimitError', () => {
    test('should create rate limit error', () => {
      const error = new RateLimitError('Rate limit exceeded');

      expect(error.message).toBe('Rate limit exceeded');
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_ERROR');
    });
  });

  describe('InternalServerError', () => {
    test('should create internal server error', () => {
      const error = new InternalServerError('Server error');

      expect(error.message).toBe('Server error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });
});

