const helmet = require('helmet');

// Check if we should allow localhost CORS (development only)
const isDevelopment = process.env.NODE_ENV === 'development';
const allowLocalhostCORS = process.env.ALLOW_LOCALHOST_CORS === 'true' && isDevelopment;

// Build CSP connectSrc based on environment
const connectSrc = allowLocalhostCORS
  ? ["'self'", 'http://localhost:*', 'http://127.0.0.1:*']
  : ["'self'"];

/**
 * Enhanced security headers configuration
 * Extends basic Helmet with additional security policies
 */
const securityHeaders = helmet({
  // Content Security Policy (for API responses)
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: connectSrc, // Allow localhost in development
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  
  // Strict Transport Security (HSTS) - only in production
  hsts: isDevelopment ? false : {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  
  // X-Frame-Options
  frameguard: {
    action: 'deny',
  },
  
  // X-Content-Type-Options
  noSniff: true,
  
  // X-XSS-Protection
  xssFilter: true,
  
  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
  
  // Permissions Policy
  permittedCrossDomainPolicies: false,
  
  // Expect-CT (Certificate Transparency) - only in production
  expectCt: isDevelopment ? false : {
    maxAge: 86400, // 24 hours
    enforce: true,
  },
  
  // Hide X-Powered-By header
  hidePoweredBy: true,
});

/**
 * Custom security headers middleware
 * Adds additional headers not covered by Helmet
 */
function customSecurityHeaders(req, res, next) {
  // X-Request-ID should already be set by requestIdMiddleware
  // Just ensure it's in response if not already set
  if (!res.getHeader('X-Request-ID') && req.id) {
    res.setHeader('X-Request-ID', req.id);
  }
  
  // X-DNS-Prefetch-Control
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  
  // X-Download-Options (IE8+)
  res.setHeader('X-Download-Options', 'noopen');
  
  // X-Permitted-Cross-Domain-Policies
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  
  // Remove X-Powered-By (Express default) - backup in case Helmet misses it
  res.removeHeader('X-Powered-By');
  
  // API Version header (for client compatibility tracking)
  res.setHeader('X-API-Version', req.apiVersion || 'v1');
  
  next();
}

module.exports = { securityHeaders, customSecurityHeaders };
