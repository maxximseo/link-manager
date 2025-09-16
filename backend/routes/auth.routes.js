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

// Login endpoint
router.post('/login', loginLimiter, authController.login);

module.exports = router;