/**
 * Entity type to ERPNext doctype mapping
 */
const ENTITY_TYPE_TO_DOCTYPE = {
  product: 'Website Item',
  default: 'Website Item',
};

/**
 * Get ERPNext doctype for entity type
 */
function getDoctype(entityType) {
  return ENTITY_TYPE_TO_DOCTYPE[entityType] || ENTITY_TYPE_TO_DOCTYPE.default;
}

/**
 * Extract entity type and ID from path
 */
function extractEntityFromPath(path) {
  const parts = path.replace(/^\//, '').split('/');
  if (parts.length === 0) {
    return { entityType: null, doctype: null, entityId: null };
  }

  const doctype = parts[0];
  const entityId = parts.length > 1 ? parts[1] : null;

  // Map doctype to entity type
  const doctypeToEntityType = {
    'Website Item': 'product',
    Item: 'product',
  };

  const entityType = doctypeToEntityType[doctype] || doctype.toLowerCase();

  return { entityType, doctype, entityId };
}

/**
 * Generate cache key for entity
 */
function getCacheKey(entityType, entityId) {
  return `${entityType}:${entityId}`;
}

/**
 * Generate cache key for query
 */
function getQueryCacheKey(entityType, queryHash) {
  return `${entityType}:query:${queryHash}`;
}

module.exports = {
  ENTITY_TYPE_TO_DOCTYPE,
  getDoctype,
  extractEntityFromPath,
  getCacheKey,
  getQueryCacheKey,
};

