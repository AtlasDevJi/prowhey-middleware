const request = require('supertest');
const express = require('express');
const healthRoutes = require('../../../src/routes/health');
const { performHealthCheck } = require('../../../src/services/health/health');

// Mock health check service
jest.mock('../../../src/services/health/health');

const app = express();
app.use(express.json());
app.use('/health', healthRoutes);

describe('Health Check Route Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return 200 OK with health status', async () => {
    performHealthCheck.mockResolvedValue({
      status: 'healthy',
      timestamp: '2024-01-03T12:00:00.000Z',
      uptime: 3600,
      components: {
        redis: {
          status: 'ok',
          responseTime: 5,
          message: 'Redis connection healthy',
        },
        erpnext: {
          status: 'ok',
          responseTime: 120,
          message: 'ERPNext connection healthy',
        },
      },
      system: {
        memory: {
          rss: 52428800,
          heapTotal: 20971520,
          heapUsed: 15728640,
          external: 1048576,
        },
        nodeVersion: 'v18.17.0',
        environment: 'development',
      },
      responseTime: 125,
    });

    const response = await request(app).get('/health').expect(200);

    expect(response.body).toEqual({
      status: 'healthy',
      timestamp: '2024-01-03T12:00:00.000Z',
      uptime: 3600,
      components: {
        redis: {
          status: 'ok',
          responseTime: 5,
          message: 'Redis connection healthy',
        },
        erpnext: {
          status: 'ok',
          responseTime: 120,
          message: 'ERPNext connection healthy',
        },
      },
      system: {
        memory: {
          rss: 52428800,
          heapTotal: 20971520,
          heapUsed: 15728640,
          external: 1048576,
        },
        nodeVersion: 'v18.17.0',
        environment: 'development',
      },
      responseTime: 125,
    });
  });

  test('should return degraded status when Redis is unavailable', async () => {
    performHealthCheck.mockResolvedValue({
      status: 'degraded',
      timestamp: '2024-01-03T12:00:00.000Z',
      uptime: 3600,
      components: {
        redis: {
          status: 'error',
          responseTime: null,
          message: 'Redis connection failed: Connection refused',
        },
        erpnext: {
          status: 'ok',
          responseTime: 120,
          message: 'ERPNext connection healthy',
        },
      },
      system: {
        memory: {
          rss: 52428800,
          heapTotal: 20971520,
          heapUsed: 15728640,
          external: 1048576,
        },
        nodeVersion: 'v18.17.0',
        environment: 'development',
      },
      responseTime: 125,
    });

    const response = await request(app).get('/health').expect(200);

    expect(response.body.status).toBe('degraded');
    expect(response.body.components.redis.status).toBe('error');
    expect(response.body.components.erpnext.status).toBe('ok');
  });

  test('should return degraded status when ERPNext is unavailable', async () => {
    performHealthCheck.mockResolvedValue({
      status: 'degraded',
      timestamp: '2024-01-03T12:00:00.000Z',
      uptime: 3600,
      components: {
        redis: {
          status: 'ok',
          responseTime: 5,
          message: 'Redis connection healthy',
        },
        erpnext: {
          status: 'error',
          responseTime: null,
          message: 'ERPNext connection failed: Network error',
        },
      },
      system: {
        memory: {
          rss: 52428800,
          heapTotal: 20971520,
          heapUsed: 15728640,
          external: 1048576,
        },
        nodeVersion: 'v18.17.0',
        environment: 'development',
      },
      responseTime: 125,
    });

    const response = await request(app).get('/health').expect(200);

    expect(response.body.status).toBe('degraded');
    expect(response.body.components.redis.status).toBe('ok');
    expect(response.body.components.erpnext.status).toBe('error');
  });

  test('should return unhealthy status when all components fail', async () => {
    performHealthCheck.mockResolvedValue({
      status: 'unhealthy',
      timestamp: '2024-01-03T12:00:00.000Z',
      uptime: 3600,
      components: {
        redis: {
          status: 'error',
          responseTime: null,
          message: 'Redis connection failed: Connection refused',
        },
        erpnext: {
          status: 'error',
          responseTime: null,
          message: 'ERPNext connection failed: Network error',
        },
      },
      system: {
        memory: {
          rss: 52428800,
          heapTotal: 20971520,
          heapUsed: 15728640,
          external: 1048576,
        },
        nodeVersion: 'v18.17.0',
        environment: 'development',
      },
      responseTime: 125,
    });

    const response = await request(app).get('/health').expect(200);

    expect(response.body.status).toBe('unhealthy');
    expect(response.body.components.redis.status).toBe('error');
    expect(response.body.components.erpnext.status).toBe('error');
  });

  test('should handle health check processing errors', async () => {
    performHealthCheck.mockRejectedValue(new Error('Health check failed'));

    const response = await request(app).get('/health').expect(200);

    expect(response.body.status).toBe('unhealthy');
    expect(response.body.error).toBe('Health check processing failed');
    expect(response.body.message).toBe('Health check failed');
  });

  test('should include all required fields in response', async () => {
    performHealthCheck.mockResolvedValue({
      status: 'healthy',
      timestamp: '2024-01-03T12:00:00.000Z',
      uptime: 3600,
      components: {
        redis: { status: 'ok', responseTime: 5, message: 'OK' },
        erpnext: { status: 'ok', responseTime: 120, message: 'OK' },
      },
      system: {
        memory: { rss: 52428800, heapTotal: 20971520, heapUsed: 15728640, external: 1048576 },
        nodeVersion: 'v18.17.0',
        environment: 'development',
      },
      responseTime: 125,
    });

    const response = await request(app).get('/health').expect(200);

    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
    expect(response.body).toHaveProperty('components');
    expect(response.body).toHaveProperty('system');
    expect(response.body).toHaveProperty('responseTime');
    expect(response.body.components).toHaveProperty('redis');
    expect(response.body.components).toHaveProperty('erpnext');
    expect(response.body.system).toHaveProperty('memory');
    expect(response.body.system).toHaveProperty('nodeVersion');
    expect(response.body.system).toHaveProperty('environment');
  });
});

