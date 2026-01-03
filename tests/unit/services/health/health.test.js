const {
  checkRedisHealth,
  checkErpnextHealth,
  getSystemMetrics,
  getOverallHealth,
  checkWithTimeout,
  performHealthCheck,
} = require('../../../../src/services/health/health');
const { getRedisClient } = require('../../../../src/services/redis/client');
const { createErpnextClient } = require('../../../../src/services/erpnext/client');

// Mock dependencies
jest.mock('../../../../src/services/redis/client');
jest.mock('../../../../src/services/erpnext/client');

describe('Health Check Service', () => {
  describe('checkRedisHealth', () => {
    test('should return ok status when Redis is healthy', async () => {
      const mockRedis = {
        ping: jest.fn().mockResolvedValue('PONG'),
      };
      getRedisClient.mockReturnValue(mockRedis);

      const result = await checkRedisHealth();

      expect(result.status).toBe('ok');
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(result.message).toBe('Redis connection healthy');
      expect(mockRedis.ping).toHaveBeenCalled();
    });

    test('should return error status when Redis fails', async () => {
      const mockRedis = {
        ping: jest.fn().mockRejectedValue(new Error('Connection refused')),
      };
      getRedisClient.mockReturnValue(mockRedis);

      const result = await checkRedisHealth();

      expect(result.status).toBe('error');
      expect(result.responseTime).toBeNull();
      expect(result.message).toContain('Redis connection failed');
    });
  });

  describe('checkErpnextHealth', () => {
    test('should return ok status when ERPNext is healthy', async () => {
      const mockClient = {
        get: jest.fn().mockResolvedValue({ data: { data: [] } }),
      };
      createErpnextClient.mockReturnValue(mockClient);

      const result = await checkErpnextHealth();

      expect(result.status).toBe('ok');
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(result.message).toBe('ERPNext connection healthy');
      expect(mockClient.get).toHaveBeenCalledWith(
        '/api/resource/User?limit_page_length=1'
      );
    });

    test('should return error status when ERPNext fails', async () => {
      const mockClient = {
        get: jest.fn().mockRejectedValue(new Error('Network error')),
      };
      createErpnextClient.mockReturnValue(mockClient);

      const result = await checkErpnextHealth();

      expect(result.status).toBe('error');
      expect(result.responseTime).toBeNull();
      expect(result.message).toContain('ERPNext connection failed');
    });

    test('should detect authentication errors', async () => {
      const error = new Error('Unauthorized');
      error.response = { status: 401 };
      const mockClient = {
        get: jest.fn().mockRejectedValue(error),
      };
      createErpnextClient.mockReturnValue(mockClient);

      const result = await checkErpnextHealth();

      expect(result.status).toBe('error');
      expect(result.message).toContain('authentication failed');
    });
  });

  describe('getSystemMetrics', () => {
    test('should return system metrics', () => {
      const metrics = getSystemMetrics();

      expect(metrics).toHaveProperty('memory');
      expect(metrics.memory).toHaveProperty('rss');
      expect(metrics.memory).toHaveProperty('heapTotal');
      expect(metrics.memory).toHaveProperty('heapUsed');
      expect(metrics.memory).toHaveProperty('external');
      expect(metrics).toHaveProperty('nodeVersion');
      expect(metrics).toHaveProperty('environment');
    });
  });

  describe('getOverallHealth', () => {
    test('should return healthy when all components are ok', () => {
      const components = {
        redis: { status: 'ok' },
        erpnext: { status: 'ok' },
      };

      const result = getOverallHealth(components);

      expect(result).toBe('healthy');
    });

    test('should return degraded when one component is error', () => {
      const components = {
        redis: { status: 'error' },
        erpnext: { status: 'ok' },
      };

      const result = getOverallHealth(components);

      expect(result).toBe('degraded');
    });

    test('should return unhealthy when all components are error', () => {
      const components = {
        redis: { status: 'error' },
        erpnext: { status: 'error' },
      };

      const result = getOverallHealth(components);

      expect(result).toBe('unhealthy');
    });

    test('should return degraded when one component is degraded', () => {
      const components = {
        redis: { status: 'ok' },
        erpnext: { status: 'degraded' },
      };

      const result = getOverallHealth(components);

      expect(result).toBe('degraded');
    });
  });

  describe('checkWithTimeout', () => {
    test('should return result when check completes before timeout', async () => {
      const checkFn = jest.fn().mockResolvedValue({
        status: 'ok',
        responseTime: 10,
        message: 'Success',
      });

      const result = await checkWithTimeout(checkFn, 1000, 'TestComponent');

      expect(result.status).toBe('ok');
      expect(result.responseTime).toBe(10);
      expect(checkFn).toHaveBeenCalled();
    });

    test('should return degraded when timeout occurs', async () => {
      const checkFn = jest.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ status: 'ok' }), 2000);
          })
      );

      const result = await checkWithTimeout(checkFn, 100, 'TestComponent');

      expect(result.status).toBe('degraded');
      expect(result.responseTime).toBeNull();
      expect(result.message).toContain('timed out');
    });
  });

  describe('performHealthCheck', () => {
    test('should perform comprehensive health check', async () => {
      const mockRedis = {
        ping: jest.fn().mockResolvedValue('PONG'),
      };
      getRedisClient.mockReturnValue(mockRedis);

      const mockClient = {
        get: jest.fn().mockResolvedValue({ data: { data: [] } }),
      };
      createErpnextClient.mockReturnValue(mockClient);

      const result = await performHealthCheck();

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('components');
      expect(result.components).toHaveProperty('redis');
      expect(result.components).toHaveProperty('erpnext');
      expect(result).toHaveProperty('system');
      expect(result).toHaveProperty('responseTime');
    });

    test('should handle component failures gracefully', async () => {
      const mockRedis = {
        ping: jest.fn().mockRejectedValue(new Error('Redis error')),
      };
      getRedisClient.mockReturnValue(mockRedis);

      const mockClient = {
        get: jest.fn().mockResolvedValue({ data: { data: [] } }),
      };
      createErpnextClient.mockReturnValue(mockClient);

      const result = await performHealthCheck();

      expect(result.status).toBe('degraded');
      expect(result.components.redis.status).toBe('error');
      expect(result.components.erpnext.status).toBe('ok');
    });
  });
});

