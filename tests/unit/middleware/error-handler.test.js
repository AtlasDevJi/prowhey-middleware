const { errorHandler } = require('../../../src/middleware/error-handler');
const {
  ValidationError,
  NotFoundError,
  InternalServerError,
} = require('../../../src/utils/errors');
const { logger } = require('../../../src/services/logger');

// Mock logger
jest.mock('../../../src/services/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('Error Handler Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      path: '/api/test',
      method: 'POST',
      deviceId: 'device-123',
      ip: '127.0.0.1',
      get: jest.fn(() => null),
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    next = jest.fn();

    process.env.NODE_ENV = 'test';
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  test('should handle ValidationError', () => {
    const error = new ValidationError('Validation failed', {
      fields: [{ field: 'email', message: 'Invalid' }],
    });

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Validation Error',
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: {
          fields: [{ field: 'email', message: 'Invalid' }],
        },
      })
    );
    expect(logger.error).toHaveBeenCalled();
  });

  test('should handle NotFoundError', () => {
    const error = new NotFoundError('Resource not found');

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Not Found',
        code: 'NOT_FOUND_ERROR',
        message: 'Resource not found',
      })
    );
  });

  test('should wrap non-operational errors in InternalServerError', () => {
    const error = new Error('Programming error');

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Internal Server Error',
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      })
    );
  });

  test('should include development fields in development mode', () => {
    process.env.NODE_ENV = 'development';
    const error = new ValidationError('Validation failed');

    errorHandler(error, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/test',
        method: 'POST',
        timestamp: expect.any(String),
      })
    );
  });

  test('should exclude development fields in production mode', () => {
    process.env.NODE_ENV = 'production';
    const error = new ValidationError('Validation failed');

    errorHandler(error, req, res, next);

    const response = res.json.mock.calls[0][0];
    expect(response.path).toBeUndefined();
    expect(response.method).toBeUndefined();
    expect(response.timestamp).toBeUndefined();
    expect(response.stack).toBeUndefined();
  });

  test('should include stack trace for non-operational errors in development', () => {
    process.env.NODE_ENV = 'development';
    const error = new Error('Programming error');

    errorHandler(error, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        stack: expect.any(String),
      })
    );
  });

  test('should not include stack trace in production', () => {
    process.env.NODE_ENV = 'production';
    const error = new Error('Programming error');

    errorHandler(error, req, res, next);

    const response = res.json.mock.calls[0][0];
    expect(response.stack).toBeUndefined();
  });
});

