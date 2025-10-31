/**
 * CSRF Protection Middleware
 * Implements Double Submit Cookie pattern for CSRF protection
 */

const crypto = require('crypto');
const logger = require('../config/logger');

// Generate CSRF token
const generateCsrfToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Middleware to generate and set CSRF token
const csrfProtection = (req, res, next) => {
  // Skip CSRF for API endpoints using JWT (they're already protected)
  if (req.path.startsWith('/api/')) {
    return next();
  }

  // Skip for GET, HEAD, OPTIONS (safe methods)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Get token from header or body
  const tokenFromHeader = req.headers['x-csrf-token'];
  const tokenFromBody = req.body?._csrf;
  const tokenFromCookie = req.cookies?.csrf_token;

  // Check if token exists
  if (!tokenFromHeader && !tokenFromBody) {
    logger.warn('CSRF token missing in request', {
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    return res.status(403).json({ error: 'CSRF token missing' });
  }

  // Verify token matches cookie
  const providedToken = tokenFromHeader || tokenFromBody;
  if (providedToken !== tokenFromCookie) {
    logger.warn('CSRF token mismatch', {
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  next();
};

// Endpoint to get CSRF token
const getCsrfToken = (req, res) => {
  const token = generateCsrfToken();

  // Set cookie with CSRF token
  res.cookie('csrf_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });

  res.json({ csrfToken: token });
};

module.exports = {
  csrfProtection,
  getCsrfToken,
  generateCsrfToken
};
