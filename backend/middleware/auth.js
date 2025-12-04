/**
 * Authentication middleware
 * Verifies JWT tokens and sets user context
 */

const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

const authMiddleware = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'No token, authorization denied', code: 'NO_TOKEN' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: decoded.userId,
      username: decoded.username,
      role: decoded.role
    };
    next();
  } catch (error) {
    // SECURITY: Differentiate JWT error types for better client handling
    logger.error('Auth middleware error:', { name: error.name, message: error.message });

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token has expired', code: 'TOKEN_EXPIRED' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token is invalid', code: 'INVALID_TOKEN' });
    }
    if (error.name === 'NotBeforeError') {
      return res.status(401).json({ error: 'Token not yet active', code: 'TOKEN_NOT_ACTIVE' });
    }

    res.status(401).json({ error: 'Token is not valid', code: 'INVALID_TOKEN' });
  }
};

module.exports = authMiddleware;
