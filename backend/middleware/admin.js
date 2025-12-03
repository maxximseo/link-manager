/**
 * Admin authorization middleware
 * Verifies that the user has admin role
 *
 * IMPORTANT: This middleware should be used AFTER authMiddleware
 * authMiddleware sets req.user.role, this middleware checks it
 */

const logger = require('../config/logger');

/**
 * Middleware to check if user is admin
 * Returns 403 if user is not admin
 */
const adminMiddleware = (req, res, next) => {
  try {
    // Check if user exists (should be set by authMiddleware)
    if (!req.user) {
      logger.error('Admin middleware: req.user not set. Ensure authMiddleware is used first.');
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user has admin role
    if (req.user.role !== 'admin') {
      logger.warn('Unauthorized admin access attempt', {
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        path: req.path,
        method: req.method
      });

      return res.status(403).json({
        error: 'Access denied',
        message: 'This action requires administrator privileges'
      });
    }

    // User is admin, proceed
    logger.debug('Admin access granted', {
      userId: req.user.id,
      username: req.user.username,
      path: req.path
    });

    next();
  } catch (error) {
    logger.error('Admin middleware error:', error);
    res.status(500).json({ error: 'Authorization check failed' });
  }
};

module.exports = adminMiddleware;
