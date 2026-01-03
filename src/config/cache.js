// TTL in seconds
const CACHE_TTL = {
  product: 3600, // 1 hour
  default: 300, // 5 minutes
};

// Query cache TTL (shorter than entity cache)
const QUERY_CACHE_TTL = {
  product: 300, // 5 minutes
  default: 180, // 3 minutes
};

function getEntityTTL(entityType) {
  return CACHE_TTL[entityType] || CACHE_TTL.default;
}

function getQueryTTL(entityType) {
  return QUERY_CACHE_TTL[entityType] || QUERY_CACHE_TTL.default;
}

module.exports = { getEntityTTL, getQueryTTL, CACHE_TTL, QUERY_CACHE_TTL };


