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
      user: result.user
    });
    
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
};

module.exports = {
  login
};