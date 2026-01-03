// Load environment-specific config file
const envFile =
  process.env.NODE_ENV === 'production'
    ? '.env.production'
    : '.env.development';

require('dotenv').config({ path: envFile });

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());

// CORS configuration
// For React Native mobile apps: mobile apps don't send Origin headers,
// so we allow requests without origin. For web browsers, we check allowed origins.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['*'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }

      // Allow all origins if configured
      if (allowedOrigins.includes('*')) {
        return callback(null, true);
      }

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Reject origin
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


// API versioning middleware (placeholder for now)
app.use((req, res, next) => {
  const apiVersion = req.headers['api-version'] || 'v1';
  req.apiVersion = apiVersion;
  next();
});

// Device ID extraction middleware (must be before rate limiting)
const { extractDeviceId } = require('./middleware/device-id');
app.use(extractDeviceId);

// Rate limiting configuration
const { getRateLimitConfig } = require('./config/rate-limit');
const { createRateLimiter } = require('./middleware/rate-limit');

// Create rate limiters for different endpoint types
const healthRateLimiter = createRateLimiter(getRateLimitConfig('health'), 'health');
const resourceRateLimiter = createRateLimiter(getRateLimitConfig('resource'), 'resource');
const analyticsRateLimiter = createRateLimiter(getRateLimitConfig('analytics'), 'analytics');
const managementRateLimiter = createRateLimiter(getRateLimitConfig('management'), 'management');
const webhookRateLimiter = createRateLimiter(getRateLimitConfig('webhooks'), 'webhooks');

// Health check routes
const healthRoutes = require('./routes/health');
app.use('/health', healthRateLimiter, healthRoutes);

// Cache middleware - apply before other routes
const { cacheMiddleware } = require('./services/cache/middleware');
app.use('/api/resource', resourceRateLimiter, cacheMiddleware);

// Analytics routes
const analyticsRoutes = require('./routes/analytics');
app.use('/api/analytics', analyticsRateLimiter, analyticsRoutes);

// Price routes
const priceRoutes = require('./routes/price');
app.use('/api/price', managementRateLimiter, priceRoutes);

// Stock routes
const stockRoutes = require('./routes/stock');
app.use('/api/stock', managementRateLimiter, stockRoutes);

// Webhook routes
const webhookRoutes = require('./routes/webhooks');
app.use('/api/webhooks', webhookRateLimiter, webhookRoutes);

// 404 handler - throw NotFoundError
const { NotFoundError } = require('./utils/errors');
app.use((req, res, next) => {
  throw new NotFoundError(`Route ${req.method} ${req.path} not found`);
});

// Error handler middleware (must be last)
const { errorHandler } = require('./middleware/error-handler');
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Unhandled error handlers
const { logger } = require('./services/logger');

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise: promise.toString(),
  });
  // Don't exit - let error handler middleware catch it if possible
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  // Graceful shutdown
  server.close(() => {
    process.exit(1);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

module.exports = app;

