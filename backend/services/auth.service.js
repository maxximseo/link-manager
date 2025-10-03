/**
 * Authentication service
 * Handles user authentication and JWT token generation
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../config/database');
const logger = require('../config/logger');

// Generate JWT secret if not provided
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  logger.info('Generated JWT secret');
}

// Authenticate user with username and password
const authenticateUser = async (username, password) => {
  try {
    const result = await query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (result.rows.length === 0) {
      return {
        success: false,
        error: 'Invalid credentials'
      };
    }
    
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return {
        success: false,
        error: 'Invalid credentials'
      };
    }
    
    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role
    };
    
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    return {
      success: true,
      token,
      user: { 
        id: user.id, 
        username: user.username, 
        role: user.role 
      }
    };
    
  } catch (error) {
    logger.error('Authentication service error:', error);
    return {
      success: false,
      error: 'Database error during authentication'
    };
  }
};

module.exports = {
  authenticateUser
};