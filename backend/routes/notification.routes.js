/**
 * Notification routes
 * Handles user notifications
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { query } = require('../config/database');
const logger = require('../config/logger');
const cache = require('../services/cache.service');

/**
 * GET /api/notifications
 * Get user notifications (OPTIMIZED: Redis cache + single query)
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    const offset = (page - 1) * limit;
    const userId = req.user.id;

    // Try cache first (60 second TTL)
    const cacheKey = `notifications:${userId}:p${page}:l${limit}:u${unreadOnly}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Single optimized query with counts
    const result = await query(
      `
      SELECT
        n.*,
        (SELECT COUNT(*) FROM notifications WHERE user_id = $1) as total_count,
        (SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false) as unread_count
      FROM notifications n
      WHERE n.user_id = $1 ${unreadOnly === 'true' ? 'AND n.read = false' : ''}
      ORDER BY n.created_at DESC
      LIMIT $2 OFFSET $3
    `,
      [userId, parseInt(limit), parseInt(offset)]
    );

    const total = parseInt(result.rows[0]?.total_count || 0);
    const unread = parseInt(result.rows[0]?.unread_count || 0);

    // Remove count columns from response
    const notifications = result.rows.map(({ total_count, unread_count, ...n }) => n);

    const response = {
      success: true,
      data: notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        unread,
        pages: Math.ceil(total / limit)
      }
    };

    // Cache for 60 seconds
    await cache.set(cacheKey, response, 60);

    res.json(response);
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
    const result = await query(
      `
      SELECT COUNT(*) as count
      FROM notifications
      WHERE user_id = $1 AND read = false
    `,
      [req.user.id]
    );

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
    const result = await query(
      `
      UPDATE notifications
      SET read = true
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `,
      [notificationId, req.user.id]
    );

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
    const result = await query(
      `
      UPDATE notifications
      SET read = true
      WHERE user_id = $1 AND read = false
      RETURNING COUNT(*) as count
    `,
      [req.user.id]
    );

    // Clear notification cache for this user
    await cache.delPattern(`notifications:${req.user.id}:*`);

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
 * DELETE /api/notifications/all
 * Delete all notifications for current user
 */
router.delete('/all', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `
      DELETE FROM notifications
      WHERE user_id = $1
    `,
      [req.user.id]
    );

    // Clear notification cache for this user
    await cache.delPattern(`notifications:${req.user.id}:*`);

    res.json({
      success: true,
      data: {
        deletedCount: result.rowCount || 0
      }
    });
  } catch (error) {
    logger.error('Failed to delete all notifications', {
      userId: req.user.id,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to delete notifications' });
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

    const result = await query(
      `
      DELETE FROM notifications
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `,
      [notificationId, req.user.id]
    );

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
