const jwt = require('jsonwebtoken');
const {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRY,
  JWT_REFRESH_EXPIRY,
} = require('../config/auth');
const { getUserById } = require('../services/auth/user-storage');
const { UnauthorizedError } = require('../utils/errors');
const { logger } = require('../services/logger');

/**
 * Generate access token
 * @param {object} payload - Token payload (userId, email, username)
 * @returns {string} JWT access token
 */
function generateAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRY,
  });
}

/**
 * Generate refresh token
 * @param {object} payload - Token payload (userId, email, username)
 * @returns {string} JWT refresh token
 */
function generateRefreshToken(payload) {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRY,
  });
}

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @param {string} secret - Secret key
 * @returns {object|null} Decoded token payload or null
 */
function verifyToken(token, secret) {
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn('Token expired', { error: error.message });
    } else if (error.name === 'JsonWebTokenError') {
      logger.warn('Invalid token', { error: error.message });
    } else {
      logger.error('Token verification failed', { error: error.message });
    }
    return null;
  }
}

/**
 * Express middleware to authenticate requests using JWT
 * Attaches user to req.user if valid token is provided
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next middleware
 */
async function authenticate(req, res, next) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = verifyToken(token, JWT_SECRET);
    if (!decoded) {
      throw new UnauthorizedError('Invalid or expired token');
    }

    // Get user from database
    const user = await getUserById(decoded.userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Check if user is verified
    if (!user.isVerified) {
      throw new UnauthorizedError('Account not verified');
    }

    // Check if user is deleted
    if (user.deleted) {
      throw new UnauthorizedError('Account has been deleted');
    }

    // Attach user to request
    req.user = user;
    req.userId = user.id;

    next();
  } catch (error) {
    // If it's already an AppError, pass it through
    if (error.isOperational) {
      return next(error);
    }
    // Otherwise, wrap in UnauthorizedError
    next(new UnauthorizedError('Authentication failed'));
  }
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  authenticate,
  JWT_SECRET,
  JWT_REFRESH_SECRET,
};

