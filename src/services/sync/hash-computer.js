const crypto = require('crypto');
const { logger } = require('../logger');

/**
 * Normalize JSON object for consistent hashing
 * Sorts object keys recursively to ensure consistent hash regardless of key order
 * @param {object} obj - Object to normalize
 * @returns {object} Normalized object
 */
function normalizeObject(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(normalizeObject);
  }

  // Sort keys and recursively normalize values
  const sorted = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    sorted[key] = normalizeObject(obj[key]);
  }

  return sorted;
}

/**
 * Compute SHA-256 hash of data field only
 * Uses normalized JSON stringification for consistency
 * @param {object} data - Data object to hash (only this field is hashed, not metadata)
 * @returns {string} SHA-256 hash in hex format
 */
function computeDataHash(data) {
  try {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be a non-null object');
    }

    // Normalize object (sort keys recursively)
    const normalized = normalizeObject(data);

    // Stringify with sorted keys
    const jsonString = JSON.stringify(normalized);

    // Compute SHA-256 hash
    const hash = crypto.createHash('sha256').update(jsonString).digest('hex');

    return hash;
  } catch (error) {
    logger.error('Hash computation error', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Compare two data hashes
 * @param {string} hash1 - First hash
 * @param {string} hash2 - Second hash
 * @returns {boolean} True if hashes are equal
 */
function compareHashes(hash1, hash2) {
  if (!hash1 || !hash2) {
    return false;
  }
  return hash1 === hash2;
}

module.exports = {
  computeDataHash,
  compareHashes,
  normalizeObject,
};
