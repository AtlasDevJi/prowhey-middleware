/**
 * Sanitization utilities for request data
 * Prevents XSS attacks and ensures data integrity
 */

/**
 * Encode HTML entities to prevent XSS
 * @param {string} str - String to encode
 * @returns {string} - HTML-encoded string
 */
function sanitizeHtml(str) {
  if (typeof str !== 'string') {
    return str;
  }

  const htmlEntities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };

  return str.replace(/[&<>"'/]/g, (char) => htmlEntities[char]);
}

/**
 * Sanitize a string: trim, remove null bytes, limit length
 * @param {string} str - String to sanitize
 * @param {number} maxLength - Maximum length (optional)
 * @returns {string} - Sanitized string
 */
function sanitizeString(str, maxLength = null) {
  if (typeof str !== 'string') {
    return str;
  }

  // Trim whitespace
  let sanitized = str.trim();

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Enforce length limit
  if (maxLength !== null && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

/**
 * Sanitize a string with HTML encoding
 * @param {string} str - String to sanitize
 * @param {number} maxLength - Maximum length (optional, applied before encoding)
 * @returns {string} - Sanitized and HTML-encoded string
 */
function sanitizeStringWithHtml(str, maxLength = null) {
  // First trim and remove null bytes
  let sanitized = str.trim().replace(/\0/g, '');
  
  // Apply length limit before HTML encoding
  if (maxLength !== null && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  // Then HTML encode
  return sanitizeHtml(sanitized);
}

/**
 * Sanitize a path parameter
 * URL decode and validate format
 * @param {string} param - Path parameter to sanitize
 * @returns {string} - Sanitized path parameter
 */
function sanitizePathParam(param) {
  if (typeof param !== 'string') {
    return '';
  }

  try {
    // URL decode
    let decoded = decodeURIComponent(param);

    // Remove null bytes and dangerous characters
    decoded = decoded.replace(/\0/g, '').replace(/[<>"']/g, '');

    return decoded.trim();
  } catch (error) {
    // If URL decoding fails, return empty string
    return '';
  }
}

/**
 * Sanitize a number
 * Parse and validate range
 * @param {any} value - Value to sanitize
 * @param {object} options - Options { min, max, decimals }
 * @returns {number|null} - Sanitized number or null if invalid
 */
function sanitizeNumber(value, options = {}) {
  const { min = null, max = null, decimals = null } = options;

  // Parse to number
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);

  if (isNaN(num)) {
    return null;
  }

  // Apply range limits
  if (min !== null && num < min) {
    return null;
  }

  if (max !== null && num > max) {
    return null;
  }

  // Round to specified decimal places
  if (decimals !== null) {
    return parseFloat(num.toFixed(decimals));
  }

  return num;
}

/**
 * Recursively sanitize an object based on schema
 * Only sanitizes string fields, preserves other types
 * @param {object} obj - Object to sanitize
 * @param {object} schema - Zod schema (for reference, not used directly)
 * @returns {object} - Sanitized object
 */
function sanitizeObject(obj, _schema = null) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Sanitize strings (HTML encode for user-generated content)
      sanitized[key] = sanitizeStringWithHtml(value);
    } else if (typeof value === 'number') {
      // Keep numbers as-is (validation handles range checks)
      sanitized[key] = value;
    } else if (typeof value === 'boolean') {
      // Keep booleans as-is
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      // Recursively sanitize array elements
      sanitized[key] = value.map((item) => {
        if (typeof item === 'string') {
          return sanitizeStringWithHtml(item);
        } else if (typeof item === 'object' && item !== null) {
          return sanitizeObject(item);
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeObject(value);
    } else {
      // Preserve other types
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Prevent SQL injection (for any SQL-like queries)
 * Note: We use parameterized queries, but this adds extra protection
 * @param {string} str - String to sanitize
 * @returns {string} - Sanitized string
 */
function sanitizeSQL(str) {
  if (typeof str !== 'string') return str;
  
  // Remove SQL injection patterns
  return str
    .replace(/['";\\]/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
    .replace(/xp_/gi, '')
    .replace(/sp_/gi, '');
}

/**
 * Prevent NoSQL injection
 * @param {object} obj - Object to sanitize
 * @returns {object} - Sanitized object
 */
function sanitizeNoSQL(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    // Prevent MongoDB injection patterns
    if (typeof value === 'string') {
      // Remove $ operators
      sanitized[key] = value.replace(/\$/g, '');
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Prevent command injection
 * @param {string} str - String to sanitize
 * @returns {string} - Sanitized string
 */
function sanitizeCommand(str) {
  if (typeof str !== 'string') return str;
  
  // Remove shell command characters
  return str
    .replace(/[;&|`$(){}[\]]/g, '')
    .replace(/</g, '')
    .replace(/>/g, '');
}

/**
 * Prevent path traversal
 * @param {string} path - Path to sanitize
 * @returns {string} - Sanitized path
 */
function sanitizePath(path) {
  if (typeof path !== 'string') return path;
  
  // Remove path traversal patterns
  return path
    .replace(/\.\./g, '')
    .replace(/\/\//g, '/')
    .replace(/^\/+/, '');
}

module.exports = {
  sanitizeHtml,
  sanitizeString,
  sanitizeStringWithHtml,
  sanitizePathParam,
  sanitizeNumber,
  sanitizeObject,
  sanitizeSQL,
  sanitizeNoSQL,
  sanitizeCommand,
  sanitizePath,
};

