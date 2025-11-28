/**
 * Authentication routes
 * Handles login and user authentication
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/auth.controller');

// Rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Temporary increase from 5 to 50 for login issues
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for registration
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Max 5 registration attempts per hour
  message: 'Too many registration attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for token refresh (more lenient)
const refreshLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 refresh attempts per minute
  message: 'Too many refresh attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Login endpoint
router.post('/login', loginLimiter, authController.login);

// Register endpoint
router.post('/register', registerLimiter, authController.register);

// Verify email endpoint
router.get('/verify-email/:token', authController.verifyEmail);

module.exports = router;