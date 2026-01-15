// TTL in seconds
// 0 = no expiration (persistent for sync)
const CACHE_TTL = {
  product: 0, // Persistent (no expiration) - sync-based updates
  stock: 0, // Persistent (no expiration) - sync-based updates
  hero: 0, // Persistent (no expiration) - sync-based updates
  bundle: 0, // Persistent (no expiration) - sync-based updates
  home: 0, // Persistent (no expiration) - sync-based updates
  price: 0, // Persistent (no expiration) - sync-based updates
  default: 300, // 5 minutes (for query caches and other temporary data)
};

// Query cache TTL (shorter than entity cache)
const QUERY_CACHE_TTL = {
  product: 300, // 5 minutes
  default: 180, // 3 minutes
};

function getEntityTTL(entityType) {
  // Use nullish coalescing (??) instead of || to handle TTL of 0 correctly
  // 0 is a valid TTL value (persistent), but || treats 0 as falsy
  return CACHE_TTL[entityType] !== undefined ? CACHE_TTL[entityType] : CACHE_TTL.default;
}

function getQueryTTL(entityType) {
  // Use explicit undefined check to handle TTL of 0 correctly
  return QUERY_CACHE_TTL[entityType] !== undefined ? QUERY_CACHE_TTL[entityType] : QUERY_CACHE_TTL.default;
}

module.exports = { getEntityTTL, getQueryTTL, CACHE_TTL, QUERY_CACHE_TTL };


