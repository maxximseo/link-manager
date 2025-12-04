/**
 * Security Alerts Service
 * Monitors and notifies admins about security-related events:
 * - Anomalous transaction amounts
 * - Failed login attempts from same IP
 * - Server 500 errors
 */

const { query } = require('../config/database');
const logger = require('../config/logger');

// Configuration thresholds
const THRESHOLDS = {
  ANOMALOUS_TRANSACTION_MIN: 1000, // Transaction amount > $1000 triggers alert
  FAILED_LOGINS_MAX: 5, // 5+ failed attempts triggers alert
  FAILED_LOGINS_WINDOW: 15 * 60 * 1000, // 15 minutes window
  ERROR_500_DEBOUNCE: 60 * 1000 // Don't send more than 1 alert per minute for same error
};

// In-memory stores for tracking
const failedLoginAttempts = new Map(); // IP -> [{timestamp, username}]
const recentErrors = new Map(); // errorKey -> timestamp (for debouncing)

/**
 * Notify all admin users about a security event
 * @param {string} type - Notification type ('security_alert', 'error_alert')
 * @param {string} title - Alert title
 * @param {string} message - Alert message
 * @param {object} metadata - Additional data (stored as JSONB)
 */
async function notifyAdmins(type, title, message, metadata = {}) {
  try {
    // Find all admin users
    const admins = await query("SELECT id FROM users WHERE role = 'admin'");

    if (admins.rows.length === 0) {
      logger.warn('No admin users found to notify');
      return;
    }

    // Send notification to each admin
    for (const admin of admins.rows) {
      await query(
        `INSERT INTO notifications (user_id, type, title, message, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [admin.id, type, title, message, JSON.stringify(metadata)]
      );
    }

    logger.warn('Security alert sent to admins', {
      type,
      title,
      adminCount: admins.rows.length,
      metadata
    });
  } catch (error) {
    // Don't throw - alerting failure shouldn't break main flow
    logger.error('Failed to send admin notification', {
      type,
      title,
      error: error.message
    });
  }
}

/**
 * Check and alert on anomalous transaction amounts
 * Call this after successful transactions (deposit, purchase)
 * @param {number} userId - User ID who made the transaction
 * @param {number} amount - Transaction amount
 * @param {string} transactionType - Type of transaction ('deposit', 'purchase')
 */
async function checkAnomalousTransaction(userId, amount, transactionType) {
  try {
    if (parseFloat(amount) >= THRESHOLDS.ANOMALOUS_TRANSACTION_MIN) {
      // Get username for context
      const userResult = await query('SELECT username FROM users WHERE id = $1', [userId]);
      const username = userResult.rows[0]?.username || `User #${userId}`;

      await notifyAdmins(
        'security_alert',
        'Аномальная транзакция',
        `Транзакция на сумму $${parseFloat(amount).toFixed(2)} (тип: ${transactionType}) от пользователя "${username}" (ID: ${userId})`,
        {
          userId,
          username,
          amount: parseFloat(amount),
          transactionType,
          threshold: THRESHOLDS.ANOMALOUS_TRANSACTION_MIN,
          timestamp: new Date().toISOString()
        }
      );
    }
  } catch (error) {
    logger.error('Failed to check anomalous transaction', {
      userId,
      amount,
      transactionType,
      error: error.message
    });
  }
}

/**
 * Track failed login attempts and alert when threshold is reached
 * @param {string} ip - Client IP address
 * @param {string} username - Username that was attempted
 */
async function trackFailedLogin(ip, username) {
  try {
    const now = Date.now();

    // Initialize array for this IP if needed
    if (!failedLoginAttempts.has(ip)) {
      failedLoginAttempts.set(ip, []);
    }

    const attempts = failedLoginAttempts.get(ip);

    // Filter to only recent attempts within the time window
    const recentAttempts = attempts.filter(
      a => now - a.timestamp < THRESHOLDS.FAILED_LOGINS_WINDOW
    );

    // Add current attempt
    recentAttempts.push({ timestamp: now, username: username || 'unknown' });
    failedLoginAttempts.set(ip, recentAttempts);

    // Check if threshold is reached
    if (recentAttempts.length >= THRESHOLDS.FAILED_LOGINS_MAX) {
      const usernames = [...new Set(recentAttempts.map(a => a.username))];

      await notifyAdmins(
        'security_alert',
        'Подозрительная активность: множественные неудачные логины',
        `IP ${ip}: ${recentAttempts.length} неудачных попыток входа за последние 15 минут. Логины: ${usernames.join(', ')}`,
        {
          ip,
          attemptCount: recentAttempts.length,
          usernames,
          windowMinutes: 15,
          timestamp: new Date().toISOString()
        }
      );

      // Reset counter after alerting to prevent alert spam
      failedLoginAttempts.set(ip, []);
    }

    // Cleanup: Remove IPs with no recent activity to prevent memory leak
    if (Math.random() < 0.01) {
      // 1% chance to clean up
      cleanupOldEntries();
    }
  } catch (error) {
    logger.error('Failed to track failed login', {
      ip,
      username,
      error: error.message
    });
  }
}

/**
 * Notify admins about 500 errors (with debouncing)
 * @param {Error} error - The error object
 * @param {object} req - Express request object (optional)
 */
async function notify500Error(error, req) {
  try {
    const errorKey = `${error?.message || 'unknown'}:${req?.path || 'unknown'}`;
    const now = Date.now();

    // Check debounce - don't spam admins with same error
    if (recentErrors.has(errorKey)) {
      const lastNotified = recentErrors.get(errorKey);
      if (now - lastNotified < THRESHOLDS.ERROR_500_DEBOUNCE) {
        return; // Skip - recently notified about this error
      }
    }

    recentErrors.set(errorKey, now);

    const metadata = {
      path: req?.path || 'unknown',
      method: req?.method || 'unknown',
      ip: req?.ip || req?.connection?.remoteAddress || 'unknown',
      userId: req?.user?.id || null,
      errorMessage: error?.message || 'Unknown error',
      errorName: error?.name || 'Error',
      stack: error?.stack?.substring(0, 500) || null,
      timestamp: new Date().toISOString()
    };

    await notifyAdmins(
      'error_alert',
      'Ошибка сервера 500',
      `${metadata.errorName}: ${metadata.errorMessage} на ${metadata.method} ${metadata.path}`,
      metadata
    );

    // Cleanup old error entries periodically
    if (recentErrors.size > 100) {
      cleanupRecentErrors();
    }
  } catch (notifyError) {
    logger.error('Failed to send 500 error notification', {
      originalError: error?.message,
      notifyError: notifyError.message
    });
  }
}

/**
 * Cleanup old failed login entries to prevent memory leak
 */
function cleanupOldEntries() {
  const now = Date.now();
  for (const [ip, attempts] of failedLoginAttempts.entries()) {
    const recentAttempts = attempts.filter(
      a => now - a.timestamp < THRESHOLDS.FAILED_LOGINS_WINDOW
    );
    if (recentAttempts.length === 0) {
      failedLoginAttempts.delete(ip);
    } else {
      failedLoginAttempts.set(ip, recentAttempts);
    }
  }
}

/**
 * Cleanup old error entries to prevent memory leak
 */
function cleanupRecentErrors() {
  const now = Date.now();
  for (const [key, timestamp] of recentErrors.entries()) {
    if (now - timestamp > THRESHOLDS.ERROR_500_DEBOUNCE * 10) {
      recentErrors.delete(key);
    }
  }
}

module.exports = {
  notifyAdmins,
  checkAnomalousTransaction,
  trackFailedLogin,
  notify500Error,
  THRESHOLDS
};
