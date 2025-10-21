/**
 * Site service
 * Handles site database operations
 */

const { pool, query } = require('../config/database');
const logger = require('../config/logger');
const crypto = require('crypto');

// Get user sites with pagination and statistics
const getUserSites = async (userId, page = 0, limit = 0, recalculate = false) => {
  try {
    const usePagination = page > 0 && limit > 0;
    
    // Optionally recalculate statistics first (batch operation optimization)
    if (recalculate) {
      await recalculateSiteStats(userId);
    }
    
    // Fetch sites data
    let sitesQuery = 'SELECT id, user_id, site_name, site_url, api_key, max_links, max_articles, used_links, used_articles, created_at FROM sites WHERE user_id = $1 ORDER BY created_at DESC';
    const queryParams = [userId];
    
    if (usePagination) {
      const offset = (page - 1) * limit;
      sitesQuery += ' LIMIT $2 OFFSET $3';
      queryParams.push(limit, offset);
    }
    
    const result = await query(sitesQuery, queryParams);
    
    // If pagination is requested, return paginated format
    if (usePagination) {
      // Get total count
      const countResult = await query(
        'SELECT COUNT(*) FROM sites WHERE user_id = $1',
        [userId]
      );
      const total = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(total / limit);
      
      return {
        data: result.rows,
        pagination: {
          page,
          limit,
          total,
          pages: totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        recalculated: recalculate
      };
    } else {
      // Return simple array for backward compatibility
      return result.rows;
    }
  } catch (error) {
    logger.error('Get user sites error:', error);
    throw error;
  }
};

// Create new site
const createSite = async (data) => {
  try {
    const { site_url, api_key, max_links, max_articles, userId } = data;
    
    // Generate cryptographically secure API key if not provided
    const finalApiKey = api_key || `api_${crypto.randomBytes(12).toString('hex')}`;
    const site_name = site_url;
    
    const result = await query(
      'INSERT INTO sites (site_url, site_name, api_key, user_id, max_links, max_articles, used_links, used_articles) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [site_url, site_name, finalApiKey, userId, max_links || 10, max_articles || 30, 0, 0]
    );
    
    return result.rows[0];
  } catch (error) {
    logger.error('Create site error:', error);
    throw error;
  }
};

// Update site
const updateSite = async (siteId, userId, data) => {
  try {
    const { site_url, site_name, api_key, max_links, max_articles } = data;

    const result = await query(
      `UPDATE sites
       SET site_url = COALESCE($1, site_url),
           site_name = COALESCE($2, site_name),
           api_key = COALESCE($3, api_key),
           max_links = COALESCE($4, max_links),
           max_articles = COALESCE($5, max_articles)
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [site_url, site_name, api_key, max_links, max_articles, siteId, userId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Update site error:', error);
    throw error;
  }
};

// Delete site
const deleteSite = async (siteId, userId) => {
  try {
    const result = await query(
      'DELETE FROM sites WHERE id = $1 AND user_id = $2 RETURNING id',
      [siteId, userId]
    );
    
    return result.rows.length > 0;
  } catch (error) {
    logger.error('Delete site error:', error);
    throw error;
  }
};

// Recalculate site statistics
const recalculateSiteStats = async (userId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Batch recalculate all user's sites in single query with explicit transaction
    await client.query(`
      WITH site_stats AS (
        SELECT
          s.id,
          COUNT(DISTINCT CASE WHEN pc.link_id IS NOT NULL THEN pc.id END) as link_count,
          COUNT(DISTINCT CASE WHEN pc.article_id IS NOT NULL THEN pc.id END) as article_count
        FROM sites s
        LEFT JOIN placements p ON s.id = p.site_id
        LEFT JOIN placement_content pc ON p.id = pc.placement_id
        WHERE s.user_id = $1
        GROUP BY s.id
      )
      UPDATE sites s
      SET
        used_links = COALESCE(ss.link_count, 0),
        used_articles = COALESCE(ss.article_count, 0)
      FROM site_stats ss
      WHERE s.id = ss.id AND s.user_id = $1
    `, [userId]);

    await client.query('COMMIT');
    logger.info('Site statistics recalculated successfully', { userId });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Site statistics recalculation failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Get single site
const getSiteById = async (siteId, userId) => {
  try {
    const result = await query(
      'SELECT id, user_id, site_name, site_url, api_key, max_links, max_articles, used_links, used_articles, created_at FROM sites WHERE id = $1 AND user_id = $2',
      [siteId, userId]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Get site by ID error:', error);
    throw error;
  }
};

module.exports = {
  getUserSites,
  createSite,
  updateSite,
  deleteSite,
  recalculateSiteStats,
  getSiteById
};