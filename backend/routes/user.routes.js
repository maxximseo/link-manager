/**
 * User routes
 * Handles user profile and password management
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../middleware/auth');
const userController = require('../controllers/user.controller');

// Rate limiting for profile updates
const profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Max 20 profile updates per 15 minutes
  message: 'Too many profile update attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting for password changes
const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Max 5 password change attempts per hour
  message: 'Too many password change attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// All routes require authentication
router.use(authMiddleware);

// Get current user profile
router.get('/profile', userController.getProfile);

// Update user profile (email, display_name)
router.patch('/profile', profileLimiter, userController.updateProfile);

// Change password
router.post('/change-password', passwordLimiter, userController.changePassword);

module.exports = router;
