/**
 * Authentication service
 * Handles user authentication and JWT token generation
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../config/database');
const logger = require('../config/logger');

// Validate JWT secret is provided and strong enough
if (!process.env.JWT_SECRET) {
  logger.error('JWT_SECRET is not set in environment variables. This is a security risk.');
  throw new Error('JWT_SECRET environment variable is required for security. Please set it in .env file.');
}

// Check secret strength (minimum 32 characters)
if (process.env.JWT_SECRET.length < 32) {
  logger.error('JWT_SECRET is too short. Must be at least 32 characters for security.');
  throw new Error('JWT_SECRET must be at least 32 characters long. Please use a stronger secret in .env file.');
}

// Warn about weak common secrets
const weakSecrets = ['your-secret-key', 'secret', 'changeme', 'password', '12345', 'test'];
if (weakSecrets.some(weak => process.env.JWT_SECRET.toLowerCase().includes(weak))) {
  logger.error('JWT_SECRET appears to be a common/weak value. This is a security risk.');
  throw new Error('JWT_SECRET appears to be weak. Please use a cryptographically random secret.');
}

// Authenticate user with username and password
const authenticateUser = async (username, password) => {
  try {
    const result = await query(
      'SELECT id, username, password, role FROM users WHERE username = $1',
      [username]
    );
    const user = result.rows[0];

    // Protection against timing attacks: always run bcrypt.compare
    // Use dummy hash if user doesn't exist to maintain constant time
    const dummyHash = '$2a$10$aaaaaaaaaaaaaaaaaaaaaeOHyXMO/lUEyXfRF6lQAoF5q3D3vQFOO'; // Dummy bcrypt hash
    const hash = user?.password || dummyHash;
    const isMatch = await bcrypt.compare(password, hash);

    // Check both user existence and password match
    if (!user || !isMatch) {
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