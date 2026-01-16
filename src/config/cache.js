// TTL in seconds
// Friday-only entities: Calculate dynamically (seconds to next Friday 11 PM)
// Stock: 7 days (604800 seconds) - backup safety net
// Other: Use default
const CACHE_TTL = {
  product: 'friday', // Friday-only entity - calculate dynamically
  price: 'friday', // Friday-only entity - calculate dynamically
  hero: 'friday', // Friday-only entity - calculate dynamically
  home: 'friday', // Friday-only entity - calculate dynamically
  stock: 604800, // 7 days (1 week) - backup safety net
  bundle: 'friday', // Friday-only entity - calculate dynamically
  message: 0, // Messages persist indefinitely (no TTL)
  default: 300, // 5 minutes (for query caches and other temporary data)
};

// Query cache TTL (shorter than entity cache)
const QUERY_CACHE_TTL = {
  product: 300, // 5 minutes
  default: 180, // 3 minutes
};

const { calculateTTLToNextFriday } = require('../utils/ttl-calculator');

function getEntityTTL(entityType) {
  // Use nullish coalescing (??) instead of || to handle TTL of 0 correctly
  // 0 is a valid TTL value (persistent), but || treats 0 as falsy
  return CACHE_TTL[entityType] !== undefined ? CACHE_TTL[entityType] : CACHE_TTL.default;
}

/**
 * Get entity TTL with date-based calculation for Friday-only entities
 * For Friday-only entities (product, price, hero, home, bundle): calculates seconds until next Friday 11 PM
 * For stock: returns 7 days (604800 seconds)
 * For message: returns 0 (persistent, no expiration)
 * For others: uses default TTL
 * @param {string} entityType - Entity type
 * @returns {number} TTL in seconds (0 means persistent, no expiration)
 */
function getEntityTTLWithDate(entityType) {
  const ttlConfig = CACHE_TTL[entityType];
  
  if (ttlConfig === 'friday') {
    // Friday-only entity - calculate seconds until next Friday 11 PM
    return calculateTTLToNextFriday(23); // 11 PM
  }
  
  if (ttlConfig !== undefined && typeof ttlConfig === 'number') {
    // Fixed TTL value (e.g., stock = 604800, message = 0 for persistent)
    return ttlConfig;
  }
  
  // Default TTL
  return CACHE_TTL.default;
}

function getQueryTTL(entityType) {
  // Use explicit undefined check to handle TTL of 0 correctly
  return QUERY_CACHE_TTL[entityType] !== undefined ? QUERY_CACHE_TTL[entityType] : QUERY_CACHE_TTL.default;
}

module.exports = { getEntityTTL, getEntityTTLWithDate, getQueryTTL, CACHE_TTL, QUERY_CACHE_TTL };


