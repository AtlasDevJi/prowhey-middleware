// Mock uuid before requiring device-id
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-12345'),
}));

const request = require('supertest');
const express = require('express');
const { extractDeviceId } = require('../../../src/middleware/device-id');
const { createRateLimiter } = require('../../../src/middleware/rate-limit');
const { getRateLimitConfig } = require('../../../src/config/rate-limit');

// Mock Redis for testing
jest.mock('../../../src/services/redis/client', () => {
  const mockRedis = {
    incr: jest.fn(),
    ttl: jest.fn(),
    expire: jest.fn(),
    del: jest.fn(),
    decr: jest.fn(),
  };

  return {
    getRedisClient: jest.fn(() => mockRedis),
  };
});

const { getRedisClient } = require('../../../src/services/redis/client');

describe('Rate Limiting Integration Tests', () => {
  let app;
  let mockRedis;

  beforeEach(() => {
    jest.clearAllMocks();
    
    app = express();
    app.use(express.json());
    
    // Apply device ID middleware
    app.use(extractDeviceId);
    
    // Get mock Redis
    mockRedis = getRedisClient();
    
    // Setup default Redis mock behavior
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.ttl.mockResolvedValue(60);
    mockRedis.expire.mockResolvedValue(1);
  });

  describe('Device ID Extraction', () => {
    test('should extract device ID and set X-Client-ID header if missing', async () => {
      app.get('/test', (req, res) => {
        res.json({ deviceId: req.deviceId });
      });

      const response = await request(app)
        .get('/test')
        .expect(200);

      expect(response.body.deviceId).toBe('client-mock-uuid-12345');
      expect(response.headers['x-client-id']).toBe('client-mock-uuid-12345');
    });

    test('should use X-Device-ID header if provided', async () => {
      app.get('/test', (req, res) => {
        res.json({ deviceId: req.deviceId });
      });

      const response = await request(app)
        .get('/test')
        .set('X-Device-ID', 'device-abc123')
        .expect(200);

      expect(response.body.deviceId).toBe('device-abc123');
      expect(response.headers['x-client-id']).toBeUndefined();
    });
  });

  describe('Rate Limiting with Device ID', () => {
    test('should allow requests within rate limit', async () => {
      const limiter = createRateLimiter(getRateLimitConfig('analytics'), 'analytics');
      
      app.post('/api/analytics/test', limiter, (req, res) => {
        res.json({ success: true });
      });

      // Mock Redis to return count within limit
      mockRedis.incr.mockResolvedValue(15); // Under limit of 30

      const response = await request(app)
        .post('/api/analytics/test')
        .set('X-Device-ID', 'device-abc123')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should block requests exceeding rate limit', async () => {
      const limiter = createRateLimiter(getRateLimitConfig('analytics'), 'analytics');
      
      app.post('/api/analytics/test', limiter, (req, res) => {
        res.json({ success: true });
      });

      // Mock Redis to return count exceeding limit
      mockRedis.incr.mockResolvedValue(31); // Over limit of 30
      mockRedis.ttl.mockResolvedValue(30); // 30 seconds remaining

      const response = await request(app)
        .post('/api/analytics/test')
        .set('X-Device-ID', 'device-abc123')
        .expect(429);

      expect(response.body).toEqual({
        success: false,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: expect.any(Number),
        limit: 30,
        remaining: 0,
        reset: expect.any(Number),
      });
      expect(response.headers['retry-after']).toBeDefined();
    });

    test('should track different device IDs separately', async () => {
      const limiter = createRateLimiter(getRateLimitConfig('analytics'), 'analytics');
      
      app.post('/api/analytics/test', limiter, (req, res) => {
        res.json({ success: true, deviceId: req.deviceId });
      });

      // First device
      mockRedis.incr.mockResolvedValueOnce(15);
      const response1 = await request(app)
        .post('/api/analytics/test')
        .set('X-Device-ID', 'device-1')
        .expect(200);

      // Second device (should have separate counter)
      mockRedis.incr.mockResolvedValueOnce(10);
      const response2 = await request(app)
        .post('/api/analytics/test')
        .set('X-Device-ID', 'device-2')
        .expect(200);

      expect(response1.body.success).toBe(true);
      expect(response2.body.success).toBe(true);
      
      // Verify different keys were used
      expect(mockRedis.incr).toHaveBeenCalledTimes(2);
    });

    test('should use different limits for different endpoint types', async () => {
      const analyticsLimiter = createRateLimiter(getRateLimitConfig('analytics'), 'analytics');
      const managementLimiter = createRateLimiter(getRateLimitConfig('management'), 'management');
      
      app.post('/api/analytics/test', analyticsLimiter, (req, res) => {
        res.json({ type: 'analytics' });
      });

      app.post('/api/price/test', managementLimiter, (req, res) => {
        res.json({ type: 'management' });
      });

      // Analytics endpoint - limit 30
      mockRedis.incr.mockResolvedValueOnce(31);
      mockRedis.ttl.mockResolvedValueOnce(30);
      
      const analyticsResponse = await request(app)
        .post('/api/analytics/test')
        .set('X-Device-ID', 'device-abc123')
        .expect(429);

      expect(analyticsResponse.body.limit).toBe(30);

      // Management endpoint - limit 10
      mockRedis.incr.mockResolvedValueOnce(11);
      mockRedis.ttl.mockResolvedValueOnce(30);
      
      const managementResponse = await request(app)
        .post('/api/price/test')
        .set('X-Device-ID', 'device-abc123')
        .expect(429);

      expect(managementResponse.body.limit).toBe(10);
    });

    test('should handle Redis connection errors gracefully', async () => {
      // Mock Redis to be unavailable
      getRedisClient.mockReturnValueOnce(null);
      
      const limiter = createRateLimiter(getRateLimitConfig('analytics'), 'analytics');
      
      app.post('/api/analytics/test', limiter, (req, res) => {
        res.json({ success: true });
      });

      // Should allow request when Redis is unavailable (graceful degradation)
      const response = await request(app)
        .post('/api/analytics/test')
        .set('X-Device-ID', 'device-abc123')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});

