/**
 * Notification routes
 * Handles user notifications
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { query } = require('../config/database');
const logger = require('../config/logger');

/**
 * GET /api/notifications
 * Get user notifications
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50, unreadOnly = false } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE user_id = $1';
    const params = [req.user.id];

    if (unreadOnly === 'true') {
      whereClause += ' AND read = false';
    }

    const result = await query(`
      SELECT *
      FROM notifications
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.user.id, limit, offset]);

    // Get total count
    const countResult = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN read = false THEN 1 END) as unread
      FROM notifications
      ${whereClause}
    `, [req.user.id]);

    const total = parseInt(countResult.rows[0].total);
    const unread = parseInt(countResult.rows[0].unread);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        unread,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('Failed to get notifications', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

/**
 * GET /api/notifications/unread-count
 * Get count of unread notifications
 */
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const result = await query(`
      SELECT COUNT(*) as count
      FROM notifications
      WHERE user_id = $1 AND read = false
    `, [req.user.id]);

    res.json({
      success: true,
      data: {
        count: parseInt(result.rows[0].count)
      }
    });

  } catch (error) {
    logger.error('Failed to get unread count', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark notification as read
 */
router.patch('/:id/read', authMiddleware, async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);

    if (isNaN(notificationId)) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }

    // Verify ownership and mark as read
    const result = await query(`
      UPDATE notifications
      SET read = true
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [notificationId, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    logger.error('Failed to mark notification as read', {
      userId: req.user.id,
      notificationId: req.params.id,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/**
 * PATCH /api/notifications/mark-all-read
 * Mark all notifications as read
 */
router.patch('/mark-all-read', authMiddleware, async (req, res) => {
  try {
    const result = await query(`
      UPDATE notifications
      SET read = true
      WHERE user_id = $1 AND read = false
      RETURNING COUNT(*) as count
    `, [req.user.id]);

    res.json({
      success: true,
      data: {
        markedCount: parseInt(result.rowCount || 0)
      }
    });

  } catch (error) {
    logger.error('Failed to mark all notifications as read', {
      userId: req.user.id,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);

    if (isNaN(notificationId)) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }

    const result = await query(`
      DELETE FROM notifications
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [notificationId, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({
      success: true,
      data: {
        deletedId: result.rows[0].id
      }
    });

  } catch (error) {
    logger.error('Failed to delete notification', {
      userId: req.user.id,
      notificationId: req.params.id,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

module.exports = router;
