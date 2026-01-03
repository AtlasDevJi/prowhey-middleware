const {
  isOperationalError,
  getErrorContext,
  formatErrorForLogging,
  handleAsyncErrors,
} = require('../../../src/utils/error-utils');
const { AppError, ValidationError, InternalServerError } = require('../../../src/utils/errors');

describe('Error Utilities', () => {
  describe('isOperationalError', () => {
    test('should return true for AppError instance', () => {
      const error = new ValidationError('Test error');
      expect(isOperationalError(error)).toBe(true);
    });

    test('should return false for standard Error', () => {
      const error = new Error('Test error');
      expect(isOperationalError(error)).toBe(false);
    });

    test('should return false for non-error objects', () => {
      expect(isOperationalError(null)).toBe(false);
      expect(isOperationalError({})).toBe(false);
      expect(isOperationalError('string')).toBe(false);
    });
  });

  describe('getErrorContext', () => {
    test('should extract request context', () => {
      const req = {
        path: '/api/test',
        method: 'POST',
        deviceId: 'device-123',
        ip: '127.0.0.1',
        get: jest.fn((header) => {
          if (header === 'user-agent') return 'test-agent';
          return null;
        }),
        query: { page: '1' },
        params: { id: '123' },
      };

      const context = getErrorContext(req);

      expect(context).toEqual({
        path: '/api/test',
        method: 'POST',
        deviceId: 'device-123',
        ip: '127.0.0.1',
        userAgent: 'test-agent',
        query: { page: '1' },
        params: { id: '123' },
      });
    });

    test('should handle missing optional fields', () => {
      const req = {
        path: '/api/test',
        method: 'GET',
      };

      const context = getErrorContext(req);

      expect(context.deviceId).toBeNull();
      expect(context.ip).toBeNull();
      expect(context.userAgent).toBeNull();
      expect(context.query).toBeNull();
      expect(context.params).toBeNull();
    });
  });

  describe('formatErrorForLogging', () => {
    test('should format AppError for logging', () => {
      const error = new ValidationError('Validation failed', {
        fields: [{ field: 'email', message: 'Invalid' }],
      });

      const formatted = formatErrorForLogging(error);

      expect(formatted).toEqual({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        stack: expect.any(String),
        details: {
          fields: [{ field: 'email', message: 'Invalid' }],
        },
      });
    });

    test('should format error with request context', () => {
      const error = new ValidationError('Validation failed');
      const req = {
        path: '/api/test',
        method: 'POST',
        deviceId: 'device-123',
        ip: '127.0.0.1',
        get: jest.fn(() => null),
      };

      const formatted = formatErrorForLogging(error, req);

      expect(formatted.context).toBeDefined();
      expect(formatted.context.path).toBe('/api/test');
      expect(formatted.context.method).toBe('POST');
    });

    test('should format standard Error', () => {
      const error = new Error('Standard error');

      const formatted = formatErrorForLogging(error);

      expect(formatted).toEqual({
        error: 'Standard error',
        code: 'Error',
        statusCode: 500,
        stack: expect.any(String),
      });
    });
  });

  describe('handleAsyncErrors', () => {
    test('should pass through successful async handler', async () => {
      const handler = jest.fn(async (req, res, next) => {
        res.json({ success: true });
      });

      const wrapped = handleAsyncErrors(handler);
      const req = {};
      const res = { json: jest.fn() };
      const next = jest.fn();

      await wrapped(req, res, next);

      expect(handler).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test('should catch and pass errors to next', async () => {
      const error = new Error('Test error');
      const handler = jest.fn(async () => {
        throw error;
      });

      const wrapped = handleAsyncErrors(handler);
      const req = {};
      const res = {};
      const next = jest.fn();

      await wrapped(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    test('should handle synchronous errors', () => {
      const error = new Error('Sync error');
      const handler = jest.fn(() => {
        throw error;
      });

      const wrapped = handleAsyncErrors(handler);
      const req = {};
      const res = {};
      const next = jest.fn();

      wrapped(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});

