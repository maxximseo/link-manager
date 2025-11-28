/**
 * Authentication controller
 * Handles authentication business logic
 */

const authService = require('../services/auth.service');
const logger = require('../config/logger');

// Login controller
const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const result = await authService.authenticateUser(username, password);
    
    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }
    
    logger.info('User logged in:', username);
    res.json({
      token: result.token,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      user: result.user
    });
    
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
};

// Register controller
const register = async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    // Username validation
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters long' });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    }

    // Email validation (if provided)
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
    }

    const result = await authService.registerUser(username, email, password);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    logger.info('User registered:', username);
    res.status(201).json({
      message: result.message,
      user: result.user
    });

  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
};

// Verify email controller
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const result = await authService.verifyEmail(token);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    logger.info('Email verified successfully');
    res.json({ message: result.message });

  } catch (error) {
    logger.error('Email verification error:', error);
    res.status(500).json({ error: 'Server error during email verification' });
  }
};

// Refresh token controller
const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const result = await authService.refreshAccessToken(token);

    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }

    res.json({
      token: result.token,
      expiresIn: result.expiresIn,
      user: result.user
    });

  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({ error: 'Server error during token refresh' });
  }
};

module.exports = {
  login,
  register,
  verifyEmail,
  refreshToken
};