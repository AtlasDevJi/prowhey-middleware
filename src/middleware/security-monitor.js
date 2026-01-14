const { SecurityLogger } = require('../services/security-logger');

/**
 * Security monitoring middleware
 * Detects suspicious request patterns
 */
function securityMonitor(req, res, next) {
  // Check for suspicious patterns in request
  const suspiciousPatterns = [
    { pattern: /\.\./, name: 'path_traversal' }, // Path traversal
    { pattern: /<script/i, name: 'xss_attempt' }, // XSS attempts
    { pattern: /union.*select/i, name: 'sql_injection' }, // SQL injection
    { pattern: /\$where/i, name: 'nosql_injection' }, // NoSQL injection
    { pattern: /;.*rm.*-rf/i, name: 'command_injection' }, // Command injection
    { pattern: /eval\(/i, name: 'code_injection' }, // Code injection
    { pattern: /javascript:/i, name: 'javascript_protocol' }, // JavaScript protocol
  ];

  const requestString = JSON.stringify({
    path: req.path,
    body: req.body,
    query: req.query,
    params: req.params,
  });

  for (const { pattern, name } of suspiciousPatterns) {
    if (pattern.test(requestString)) {
      SecurityLogger.logSuspiciousActivity(
        req.deviceId || 'unknown',
        name,
        {
          pattern: pattern.toString(),
          path: req.path,
          method: req.method,
          ip: req.ip,
        }
      );
      // Continue processing (let validation/sanitization handle it)
      break;
    }
  }

  next();
}

module.exports = { securityMonitor };

