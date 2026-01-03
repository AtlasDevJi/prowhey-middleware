const { createRateLimiter } = require('../../../src/middleware/rate-limit');
const rateLimit = require('express-rate-limit');

// Mock express-rate-limit
jest.mock('express-rate-limit');

describe('Rate Limit Middleware Factory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock rateLimit to return a middleware function
    rateLimit.mockImplementation((config) => {
      return (req, res, next) => {
        // Simulate rate limit check
        if (req.shouldBlock) {
          return config.handler(req, res);
        }
        next();
      };
    });
  });

  test('should create rate limiter with correct configuration', () => {
    const config = {
      windowMs: 60000,
      max: 30,
    };

    createRateLimiter(config, 'analytics');

    expect(rateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        windowMs: 60000,
        max: 30,
        keyGenerator: expect.any(Function),
        handler: expect.any(Function),
      })
    );
  });

  test('should use device ID in key generator', () => {
    const config = {
      windowMs: 60000,
      max: 30,
    };

    createRateLimiter(config, 'analytics');

    const callArgs = rateLimit.mock.calls[0][0];
    const keyGenerator = callArgs.keyGenerator;

    const req = {
      deviceId: 'device-abc123',
    };

    const key = keyGenerator(req);
    expect(key).toBe('device-abc123:analytics');
  });

  test('should handle missing device ID in key generator', () => {
    const config = {
      windowMs: 60000,
      max: 30,
    };

    createRateLimiter(config, 'analytics');

    const callArgs = rateLimit.mock.calls[0][0];
    const keyGenerator = callArgs.keyGenerator;

    const req = {};

    const key = keyGenerator(req);
    expect(key).toBe('unknown:analytics');
  });

  test('should return 429 with Retry-After in handler', () => {
    const config = {
      windowMs: 60000,
      max: 30,
    };

    createRateLimiter(config, 'analytics');

    const callArgs = rateLimit.mock.calls[0][0];
    const handler = callArgs.handler;

    const req = {
      deviceId: 'device-abc123',
      path: '/api/analytics',
      rateLimit: {
        resetTime: Date.now() + 30000, // 30 seconds from now
      },
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
    };

    handler(req, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: expect.any(Number),
        limit: 30,
        remaining: 0,
        reset: expect.any(Number),
      })
    );
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
  });
});

