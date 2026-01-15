const { getRedisClient } = require('../redis/client');
const { createErpnextClient } = require('../erpnext/client');

/**
 * Check Redis connection health
 * @returns {Promise<object>} Health status with response time
 */
async function checkRedisHealth() {
  try {
    const redis = getRedisClient();
    const startTime = Date.now();
    
    // Use PING command to verify connectivity
    await redis.ping();
    
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'ok',
      responseTime,
      message: 'Redis connection healthy',
    };
  } catch (error) {
    return {
      status: 'error',
      responseTime: null,
      message: `Redis connection failed: ${error.message}`,
    };
  }
}

/**
 * Check ERPNext connection health
 * @returns {Promise<object>} Health status with response time
 */
async function checkErpnextHealth() {
  try {
    const client = createErpnextClient();
    const startTime = Date.now();
    
    // Make lightweight API call to check connectivity
    // Using direct resource access (more reliable than query API)
    await client.get('/api/resource/User?limit_page_length=1');
    
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'ok',
      responseTime,
      message: 'ERPNext connection healthy',
    };
  } catch (error) {
    // Check if it's an authentication error vs connection error
    const isAuthError = error.response?.status === 401 || error.response?.status === 403;
    const message = isAuthError
      ? `ERPNext authentication failed: ${error.message}`
      : `ERPNext connection failed: ${error.message}`;
    
    return {
      status: 'error',
      responseTime: null,
      message,
    };
  }
}

/**
 * Get system metrics
 * @returns {object} System metrics
 */
function getSystemMetrics() {
  const memory = process.memoryUsage();
  
  return {
    memory: {
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      external: memory.external,
    },
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development',
  };
}

/**
 * Get overall health status based on component statuses
 * @param {object} components - Component health statuses
 * @returns {string} Overall health status ('healthy', 'degraded', 'unhealthy')
 */
function getOverallHealth(components) {
  const { redis, erpnext } = components;
  
  // If both are ok, system is healthy
  if (redis.status === 'ok' && erpnext.status === 'ok') {
    return 'healthy';
  }
  
  // If both are error, system is unhealthy
  if (redis.status === 'error' && erpnext.status === 'error') {
    return 'unhealthy';
  }
  
  // Otherwise, system is degraded (one component failing)
  return 'degraded';
}

/**
 * Check health with timeout
 * @param {Function} checkFn - Health check function
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} componentName - Name of component being checked
 * @returns {Promise<object>} Health status
 */
async function checkWithTimeout(checkFn, timeoutMs, componentName) {
  return Promise.race([
    checkFn(),
    new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          status: 'degraded',
          responseTime: null,
          message: `${componentName} health check timed out after ${timeoutMs}ms`,
        });
      }, timeoutMs);
    }),
  ]);
}

/**
 * Perform comprehensive health check
 * @returns {Promise<object>} Complete health check response
 */
async function performHealthCheck() {
  const startTime = Date.now();
  
  // Run health checks in parallel with timeouts
  const [redisHealth, erpnextHealth] = await Promise.all([
    checkWithTimeout(checkRedisHealth, 2000, 'Redis'),
    checkWithTimeout(checkErpnextHealth, 5000, 'ERPNext'),
  ]);
  
  // Get system metrics
  const systemMetrics = getSystemMetrics();
  
  // Determine overall health
  const components = {
    redis: redisHealth,
    erpnext: erpnextHealth,
  };
  
  const overallStatus = getOverallHealth(components);
  
  // Calculate total health check time
  const totalTime = Date.now() - startTime;
  
  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    components,
    system: systemMetrics,
    responseTime: totalTime,
  };
}

module.exports = {
  checkRedisHealth,
  checkErpnextHealth,
  getSystemMetrics,
  getOverallHealth,
  checkWithTimeout,
  performHealthCheck,
};

