/**
 * Notification service
 * Simple wrapper around direct SQL INSERT for notifications table
 */

const { query } = require('../config/database');
const logger = require('../config/logger');

/**
 * Create notification for user
 * @param {number} userId - User ID
 * @param {object} notification - {type, title, message, metadata}
 */
async function create(userId, { type, title, message, metadata = null }) {
  try {
    await query(
      `INSERT INTO notifications (user_id, type, title, message, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [userId, type, title, message, metadata ? JSON.stringify(metadata) : null]
    );
    return true;
  } catch (error) {
    logger.error('Failed to create notification', { userId, type, error: error.message });
    return false;
  }
}

module.exports = {
  create
};
