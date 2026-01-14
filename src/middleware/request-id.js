const { v4: uuidv4 } = require('uuid');

/**
 * Request ID middleware
 * Generates or extracts request ID for tracking and logging
 */
function requestIdMiddleware(req, res, next) {
  // Extract from header or generate new
  req.id = req.headers['x-request-id'] || uuidv4();
  
  // Set in response header
  res.setHeader('X-Request-ID', req.id);
  
  next();
}

module.exports = { requestIdMiddleware };

