/**
 * User service
 * Handles user profile and password management
 */

const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const logger = require('../config/logger');

/**
 * Get user profile by user ID
 */
const getProfile = async userId => {
  try {
    // Calculate total_spent from transactions: (purchase + renewal) - refunds
    const result = await query(
      `SELECT u.id, u.username, u.email, u.display_name, u.role, u.created_at, u.last_login,
              u.balance, u.current_discount, u.referral_code,
              GREATEST(0, COALESCE(ABS((
                SELECT SUM(amount)
                FROM transactions t
                WHERE t.user_id = u.id AND t.type IN ('purchase', 'renewal', 'slot_rental', 'slot_rental_renewal')
              )), 0) - COALESCE((
                SELECT SUM(amount)
                FROM transactions t
                WHERE t.user_id = u.id AND t.type = 'refund'
              ), 0)) as total_spent
       FROM users u
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: 'User not found'
      };
    }

    return {
      success: true,
      data: result.rows[0]
    };
  } catch (error) {
    logger.error('Get profile service error:', error);
    return {
      success: false,
      error: 'Database error while fetching profile'
    };
  }
};

/**
 * Update user profile
 * Uses COALESCE pattern for partial updates
 */
const updateProfile = async (userId, { email, display_name }) => {
  try {
    // Check if email is being changed and if it's already taken
    if (email !== undefined && email !== null && email !== '') {
      const emailCheck = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [
        email,
        userId
      ]);

      if (emailCheck.rows.length > 0) {
        return {
          success: false,
          error: 'Email is already in use by another account'
        };
      }
    }

    // Update profile using COALESCE for partial updates
    const result = await query(
      `UPDATE users
       SET email = COALESCE($1, email),
           display_name = COALESCE($2, display_name),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, username, email, display_name, role`,
      [email || null, display_name || null, userId]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: 'User not found'
      };
    }

    logger.info(`Profile updated for user ID ${userId}`);

    return {
      success: true,
      data: result.rows[0]
    };
  } catch (error) {
    logger.error('Update profile service error:', error);
    return {
      success: false,
      error: 'Database error while updating profile'
    };
  }
};

/**
 * Change user password
 */
const changePassword = async (userId, currentPassword, newPassword) => {
  try {
    // Get current password hash
    const result = await query('SELECT password FROM users WHERE id = $1', [userId]);

    if (result.rows.length === 0) {
      return {
        success: false,
        error: 'User not found'
      };
    }

    const user = result.rows[0];

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return {
        success: false,
        error: 'Current password is incorrect'
      };
    }

    // Hash new password
    const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;
    const hashedPassword = await bcrypt.hash(newPassword, bcryptRounds);

    // Update password
    await query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [
      hashedPassword,
      userId
    ]);

    logger.info(`Password changed for user ID ${userId}`);

    return {
      success: true
    };
  } catch (error) {
    logger.error('Change password service error:', error);
    return {
      success: false,
      error: 'Database error while changing password'
    };
  }
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword
};
