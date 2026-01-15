// Load environment-specific config file
const envFile =
  process.env.NODE_ENV === 'production'
    ? '.env.production'
    : '.env.development';

require('dotenv').config({ path: envFile });

const express = require('express');
const cors = require('cors');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3001;

// Enhanced security headers
const { securityHeaders, customSecurityHeaders } = require('./middleware/security-headers');
app.use(securityHeaders);
app.use(customSecurityHeaders);

// Request ID middleware (early in chain for tracking)
const { requestIdMiddleware } = require('./middleware/request-id');
app.use(requestIdMiddleware);

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

// Body parsing with enhanced security
app.use(express.json({ 
  limit: '10mb',
  strict: true, // Only parse arrays and objects
  type: 'application/json',
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 100, // Limit number of parameters
}));


// API versioning middleware (placeholder for now)
app.use((req, res, next) => {
  const apiVersion = req.headers['api-version'] || 'v1';
  req.apiVersion = apiVersion;
  next();
});

// Device ID extraction middleware (must be before rate limiting)
const { extractDeviceId } = require('./middleware/device-id');
app.use(extractDeviceId);

// Security monitoring middleware (detects suspicious patterns)
const { securityMonitor } = require('./middleware/security-monitor');
app.use(securityMonitor);

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

// Home routes (hero images and App Home)
const homeRoutes = require('./routes/home');
app.use('/api', resourceRateLimiter, homeRoutes);

// Webhook routes
const webhookRoutes = require('./routes/webhooks');
app.use('/api/webhooks', webhookRateLimiter, webhookRoutes);

// Security routes (certificate info, etc.)
const securityRoutes = require('./routes/security');
app.use('/api/security', securityRoutes);

// Auth routes (rate limiting handled within routes)
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Users routes (for anonymous users and device info)
const usersRoutes = require('./routes/users');
app.use('/api/users', resourceRateLimiter, usersRoutes);

// Sync routes
const syncRoutes = require('./routes/sync');
app.use('/api/sync', resourceRateLimiter, syncRoutes);

// ERPNext routes (ping endpoint for local testing)
const erpnextRoutes = require('./routes/erpnext');
app.use('/api/erpnext', resourceRateLimiter, erpnextRoutes);

// 404 handler - throw NotFoundError
const { NotFoundError } = require('./utils/errors');
app.use((req, _res, _next) => {
  throw new NotFoundError(`Route ${req.method} ${req.path} not found`);
});

// Error handler middleware (must be last)
const { errorHandler } = require('./middleware/error-handler');
app.use(errorHandler);

// Start scheduled full refresh (weekly snapshot)
const { startScheduledFullRefresh } = require('./services/scheduled/full-refresh-scheduler');
if (process.env.ENABLE_SCHEDULED_REFRESH !== 'false') {
  startScheduledFullRefresh();
  console.log('Weekly full refresh scheduler started');
}

// Start scheduled analytics aggregation (daily)
const { startScheduledAggregation } = require('./services/scheduled/analytics-aggregator');
if (process.env.ENABLE_ANALYTICS_AGGREGATION !== 'false') {
  startScheduledAggregation();
  console.log('Analytics aggregation scheduler started');
}

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

