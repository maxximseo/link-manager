/**
 * User controller
 * Handles user profile and password management
 */

const userService = require('../services/user.service');
const logger = require('../config/logger');

/**
 * Get current user profile
 * GET /api/users/profile
 */
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await userService.getProfile(userId);

    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    res.json({ data: result.data });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

/**
 * Update user profile
 * PATCH /api/users/profile
 */
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { email, display_name } = req.body;

    // Validate email format if provided
    if (email !== undefined && email !== null && email !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
    }

    // Validate display_name length if provided
    if (display_name !== undefined && display_name !== null) {
      if (display_name.length > 100) {
        return res.status(400).json({ error: 'Display name too long (max 100 characters)' });
      }
    }

    const result = await userService.updateProfile(userId, { email, display_name });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ data: result.data, message: 'Profile updated successfully' });
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

/**
 * Change user password
 * POST /api/users/change-password
 */
const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { current_password, new_password } = req.body;

    // Validate required fields
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    // Validate new password length
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Check if new password is same as current
    if (current_password === new_password) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    const result = await userService.changePassword(userId, current_password, new_password);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword
};
