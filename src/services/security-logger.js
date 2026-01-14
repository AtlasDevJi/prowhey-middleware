const { logger } = require('./logger');

/**
 * Security event logger
 * Logs security-related events separately for monitoring
 */
class SecurityLogger {
  /**
   * Log authentication attempt
   */
  static logAuthAttempt(userId, email, success, reason = null) {
    logger.warn('Authentication attempt', {
      type: 'auth_attempt',
      userId,
      email,
      success,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log rate limit violation
   */
  static logRateLimitViolation(deviceId, endpoint, ip) {
    logger.warn('Rate limit violation', {
      type: 'rate_limit_violation',
      deviceId,
      endpoint,
      ip,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log suspicious request pattern
   */
  static logSuspiciousActivity(deviceId, pattern, details) {
    logger.error('Suspicious activity detected', {
      type: 'suspicious_activity',
      deviceId,
      pattern,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log certificate validation failure
   */
  static logCertificateFailure(deviceId, reason) {
    logger.error('Certificate validation failure', {
      type: 'certificate_failure',
      deviceId,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log security configuration change
   */
  static logSecurityConfigChange(change, adminId) {
    logger.info('Security configuration changed', {
      type: 'security_config_change',
      change,
      adminId,
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = { SecurityLogger };

