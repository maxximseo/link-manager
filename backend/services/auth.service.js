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
  throw new Error(
    'JWT_SECRET environment variable is required for security. Please set it in .env file.'
  );
}

// Check secret strength (minimum 32 characters)
if (process.env.JWT_SECRET.length < 32) {
  logger.error('JWT_SECRET is too short. Must be at least 32 characters for security.');
  throw new Error(
    'JWT_SECRET must be at least 32 characters long. Please use a stronger secret in .env file.'
  );
}

// Warn about weak common secrets (only flag exact matches of very weak values)
const weakSecrets = [
  'your-secret-key',
  'changeme',
  'password',
  '12345',
  'test123',
  'admin',
  'secret'
];
const secretLower = process.env.JWT_SECRET.toLowerCase();
if (weakSecrets.includes(secretLower)) {
  logger.error('JWT_SECRET is a common weak value. This is a security risk.');
  throw new Error('JWT_SECRET is too weak. Please use a cryptographically random secret.');
}

// Authenticate user with username and password
const authenticateUser = async (username, password) => {
  try {
    const result = await query(
      'SELECT id, username, password, role, failed_login_attempts, account_locked_until FROM users WHERE username = $1',
      [username]
    );
    const user = result.rows[0];

    // Protection against timing attacks: always run bcrypt.compare
    // Use dummy hash if user doesn't exist to maintain constant time
    const dummyHash = '$2a$10$aaaaaaaaaaaaaaaaaaaaaeOHyXMO/lUEyXfRF6lQAoF5q3D3vQFOO'; // Dummy bcrypt hash
    const hash = user?.password || dummyHash;
    const isMatch = await bcrypt.compare(password, hash);

    // If user doesn't exist, return error immediately (no need to update DB)
    if (!user) {
      return {
        success: false,
        error: 'Invalid credentials'
      };
    }

    // Check if account is locked
    if (user.account_locked_until) {
      const lockExpiry = new Date(user.account_locked_until);
      const now = new Date();

      if (lockExpiry > now) {
        const minutesRemaining = Math.ceil((lockExpiry - now) / 60000);
        return {
          success: false,
          error: `Account is locked due to too many failed login attempts. Try again in ${minutesRemaining} minute(s).`
        };
      } else {
        // Lock expired, reset failed attempts
        await query(
          'UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL WHERE id = $1',
          [user.id]
        );
      }
    }

    // Check password match
    if (!isMatch) {
      // Increment failed login attempts
      const newAttempts = (user.failed_login_attempts || 0) + 1;

      if (newAttempts >= 5) {
        // Lock account for 30 minutes
        const lockUntil = new Date(Date.now() + 30 * 60 * 1000);
        await query(
          'UPDATE users SET failed_login_attempts = $1, account_locked_until = $2 WHERE id = $3',
          [newAttempts, lockUntil, user.id]
        );

        logger.warn(`Account locked for user ${username} after ${newAttempts} failed attempts`);

        return {
          success: false,
          error: 'Too many failed login attempts. Account locked for 30 minutes.'
        };
      } else {
        // Just increment the counter
        await query('UPDATE users SET failed_login_attempts = $1 WHERE id = $2', [
          newAttempts,
          user.id
        ]);

        const attemptsRemaining = 5 - newAttempts;
        return {
          success: false,
          error: `Invalid credentials. ${attemptsRemaining} attempt(s) remaining before account lock.`
        };
      }
    }

    // Successful login - reset failed attempts and update last login
    await query(
      'UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL, last_login = NOW() WHERE id = $1',
      [user.id]
    );

    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role
    };

    // Short-lived access token (1 hour) - reduces risk if token is stolen
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Long-lived refresh token (7 days) - for automatic token renewal
    const refreshPayload = {
      userId: user.id,
      type: 'refresh'
    };
    const refreshToken = jwt.sign(refreshPayload, process.env.JWT_SECRET, { expiresIn: '7d' });

    logger.info(`Successful login for user ${username}`);

    return {
      success: true,
      token: accessToken,
      refreshToken,
      expiresIn: 3600, // 1 hour in seconds
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

// Register new user
const registerUser = async (username, email, password) => {
  try {
    // Check if username already exists
    const usernameCheck = await query('SELECT id FROM users WHERE username = $1', [username]);

    if (usernameCheck.rows.length > 0) {
      return {
        success: false,
        error: 'Username already exists'
      };
    }

    // Check if email already exists
    if (email) {
      const emailCheck = await query('SELECT id FROM users WHERE email = $1', [email]);

      if (emailCheck.rows.length > 0) {
        return {
          success: false,
          error: 'Email already registered'
        };
      }
    }

    // Hash password
    const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;
    const hashedPassword = await bcrypt.hash(password, bcryptRounds);

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Insert new user
    const result = await query(
      `INSERT INTO users (username, email, password, role, email_verified, verification_token, balance, total_spent, current_discount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, username, email, role`,
      [username, email, hashedPassword, 'user', false, verificationToken, 0.0, 0.0, 0]
    );

    const newUser = result.rows[0];

    logger.info(`New user registered: ${username}`);

    // In production, you would send verification email here
    // For now, we return the token for manual verification

    return {
      success: true,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role
      },
      verificationToken: verificationToken, // Remove this in production, send via email instead
      message: 'User registered successfully. Please verify your email.'
    };
  } catch (error) {
    logger.error('Registration service error:', error);
    return {
      success: false,
      error: 'Database error during registration'
    };
  }
};

// Verify email with token
const verifyEmail = async token => {
  try {
    const result = await query('SELECT id, username FROM users WHERE verification_token = $1', [
      token
    ]);

    if (result.rows.length === 0) {
      return {
        success: false,
        error: 'Invalid or expired verification token'
      };
    }

    const user = result.rows[0];

    // Mark email as verified and clear token
    await query('UPDATE users SET email_verified = true, verification_token = NULL WHERE id = $1', [
      user.id
    ]);

    logger.info(`Email verified for user: ${user.username}`);

    return {
      success: true,
      message: 'Email verified successfully. You can now login.'
    };
  } catch (error) {
    logger.error('Email verification error:', error);
    return {
      success: false,
      error: 'Database error during email verification'
    };
  }
};

// Refresh access token using refresh token
const refreshAccessToken = async refreshToken => {
  try {
    // Verify the refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    // Check if it's actually a refresh token
    if (decoded.type !== 'refresh') {
      return {
        success: false,
        error: 'Invalid token type'
      };
    }

    // Fetch user data from database to ensure user still exists and is active
    const result = await query(
      'SELECT id, username, role, account_locked_until FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: 'User not found'
      };
    }

    const user = result.rows[0];

    // Check if account is locked
    if (user.account_locked_until && new Date(user.account_locked_until) > new Date()) {
      return {
        success: false,
        error: 'Account is locked'
      };
    }

    // Generate new access token
    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role
    };

    const newAccessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    logger.info(`Token refreshed for user ${user.username}`);

    return {
      success: true,
      token: newAccessToken,
      expiresIn: 3600,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return {
        success: false,
        error: 'Refresh token expired'
      };
    }
    if (error.name === 'JsonWebTokenError') {
      return {
        success: false,
        error: 'Invalid refresh token'
      };
    }
    logger.error('Token refresh error:', error);
    return {
      success: false,
      error: 'Failed to refresh token'
    };
  }
};

module.exports = {
  authenticateUser,
  registerUser,
  verifyEmail,
  refreshAccessToken
};
