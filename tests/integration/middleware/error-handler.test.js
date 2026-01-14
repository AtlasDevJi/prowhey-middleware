const request = require('supertest');
const express = require('express');
const { errorHandler } = require('../../../src/middleware/error-handler');
const {
  ValidationError,
  NotFoundError,
} = require('../../../src/utils/errors');
const { handleAsyncErrors } = require('../../../src/utils/error-utils');

describe('Error Handler Integration Tests', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  test('should handle ValidationError from route', async () => {
    app.post('/test', (_req, _res, _next) => {
      throw new ValidationError('Validation failed', {
        fields: [{ field: 'email', message: 'Invalid' }],
      });
    });
    app.use(errorHandler);

    const response = await request(app).post('/test').expect(400);

    expect(response.body).toEqual({
      success: false,
      error: 'Validation Error',
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: {
        fields: [{ field: 'email', message: 'Invalid' }],
      },
    });
  });

  test('should handle NotFoundError from route', async () => {
    app.get('/test', (_req, _res, _next) => {
      throw new NotFoundError('Resource not found');
    });
    app.use(errorHandler);

    const response = await request(app).get('/test').expect(404);

    expect(response.body).toEqual({
      success: false,
      error: 'Not Found',
      code: 'NOT_FOUND_ERROR',
      message: 'Resource not found',
    });
  });

  test('should handle async errors with handleAsyncErrors', async () => {
    app.post('/test', handleAsyncErrors(async (_req, _res) => {
      throw new ValidationError('Async validation failed');
    }));
    app.use(errorHandler);

    const response = await request(app).post('/test').expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.message).toBe('Async validation failed');
  });

  test('should wrap non-operational errors', async () => {
    app.get('/test', (_req, _res, _next) => {
      throw new Error('Programming error');
    });
    app.use(errorHandler);

    const response = await request(app).get('/test').expect(500);

    expect(response.body).toEqual({
      success: false,
      error: 'Internal Server Error',
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    });
  });

  test('should include development fields in development mode', async () => {
    process.env.NODE_ENV = 'development';

    app.get('/test', (_req, _res, _next) => {
      throw new ValidationError('Test error');
    });
    app.use(errorHandler);

    const response = await request(app).get('/test').expect(400);

    expect(response.body.path).toBe('/test');
    expect(response.body.method).toBe('GET');
    expect(response.body.timestamp).toBeDefined();
  });

  test('should exclude development fields in production mode', async () => {
    process.env.NODE_ENV = 'production';

    app.get('/test', (_req, _res, _next) => {
      throw new ValidationError('Test error');
    });
    app.use(errorHandler);

    const response = await request(app).get('/test').expect(400);

    expect(response.body.path).toBeUndefined();
    expect(response.body.method).toBeUndefined();
    expect(response.body.timestamp).toBeUndefined();
  });

  test('should handle errors without details', async () => {
    app.get('/test', (_req, _res, _next) => {
      throw new NotFoundError('Not found');
    });
    app.use(errorHandler);

    const response = await request(app).get('/test').expect(404);

    expect(response.body.details).toBeUndefined();
  });
});

