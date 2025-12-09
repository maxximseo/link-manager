/**
 * Authentication controller
 * Handles authentication business logic
 */

const authService = require('../services/auth.service');
const logger = require('../config/logger');
const { trackFailedLogin, notifyAdmins } = require('../services/security-alerts.service');

// SECURITY: Admin IP whitelist from environment
const getAdminWhitelist = () => {
  const whitelist = process.env.ADMIN_IP_WHITELIST || '';
  return whitelist
    .split(',')
    .map(ip => ip.trim())
    .filter(ip => ip.length > 0);
};

// Extract real client IP (handles proxies)
const getClientIP = req => {
  // X-Forwarded-For can contain multiple IPs: client, proxy1, proxy2...
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = forwarded.split(',').map(ip => ip.trim());
    return ips[0]; // First IP is the original client
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
};

// Check if IP is in whitelist
const isIPWhitelisted = (ip, whitelist) => {
  if (whitelist.length === 0) return true; // No whitelist = allow all

  // Normalize IPv6 localhost
  const normalizedIP = ip === '::ffff:127.0.0.1' ? '127.0.0.1' : ip;

  return whitelist.some(allowedIP => {
    // Support CIDR notation in future if needed
    return normalizedIP === allowedIP || ip === allowedIP;
  });
};

// Login controller
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await authService.authenticateUser(username, password);

    if (!result.success) {
      // SECURITY: Track failed login attempt (async, don't block response)
      const clientIP = getClientIP(req);
      trackFailedLogin(clientIP, username).catch(err =>
        logger.error('Failed to track failed login', { err: err.message })
      );

      return res.status(401).json({ error: result.error });
    }

    // SECURITY: Admin IP whitelist check
    if (result.user.role === 'admin') {
      const clientIP = getClientIP(req);
      const whitelist = getAdminWhitelist();

      if (!isIPWhitelisted(clientIP, whitelist)) {
        logger.warn('Admin login blocked - IP not in whitelist', {
          username: result.user.username,
          ip: clientIP,
          whitelist
        });

        // Notify other admins about blocked attempt
        notifyAdmins(
          'security_alert',
          'Попытка входа админа с неразрешённого IP',
          `Пользователь "${result.user.username}" попытался войти с IP ${clientIP}. IP не в белом списке.`,
          { username: result.user.username, ip: clientIP, timestamp: new Date().toISOString() }
        ).catch(err => logger.error('Failed to notify about blocked admin login', { err: err.message }));

        // SECURITY: Return generic error to not reveal IP restriction exists
        return res.status(401).json({ error: 'Invalid credentials' });
      }
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
    const { username, email, password, confirmPassword, referralCode } = req.body;

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
      return res
        .status(400)
        .json({ error: 'Username can only contain letters, numbers, and underscores' });
    }

    // Email validation (if provided)
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
    }

    // Referral code validation (if provided)
    if (referralCode && !/^[a-zA-Z0-9_-]+$/.test(referralCode)) {
      return res.status(400).json({ error: 'Invalid referral code format' });
    }

    const result = await authService.registerUser(username, email, password, referralCode || null);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    logger.info('User registered:', username, referralCode ? `(referral: ${referralCode})` : '');
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
