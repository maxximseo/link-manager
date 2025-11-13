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
    let sitesQuery = 'SELECT id, user_id, site_name, site_url, api_key, site_type, max_links, max_articles, used_links, used_articles, created_at FROM sites WHERE user_id = $1 ORDER BY created_at DESC';
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
    const { site_url, api_key, max_links, max_articles, userId, site_type, allow_articles } = data;

    // SECURITY: Validate URL format
    if (!site_url) {
      throw new Error('Site URL is required');
    }

    try {
      const parsedUrl = new URL(site_url);
      // Only allow HTTP and HTTPS protocols
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Only HTTP and HTTPS protocols are allowed');
      }
      // Check for valid hostname
      if (!parsedUrl.hostname || parsedUrl.hostname.length < 3) {
        throw new Error('Invalid hostname in URL');
      }
    } catch (urlError) {
      if (urlError.message.includes('Invalid URL')) {
        throw new Error('Invalid site URL format. Must be a valid HTTP or HTTPS URL.');
      }
      throw urlError;
    }

    // Determine site type (default: wordpress)
    const finalSiteType = site_type || 'wordpress';

    // Validate site_type
    if (!['wordpress', 'static_php'].includes(finalSiteType)) {
      throw new Error('Invalid site_type. Must be wordpress or static_php');
    }

    // Both site types now use API key authentication
    let finalApiKey = api_key;
    let finalMaxArticles = max_articles;
    let finalAllowArticles = allow_articles;

    if (finalSiteType === 'static_php') {
      // Static PHP sites: generate API key if not provided
      finalApiKey = api_key || `api_${crypto.randomBytes(12).toString('hex')}`;
      // Static PHP sites only support links, not articles
      finalMaxArticles = 0;
      finalAllowArticles = false; // Force to false for static sites
    } else {
      // WordPress sites: generate API key if not provided
      finalApiKey = api_key || `api_${crypto.randomBytes(12).toString('hex')}`;
      finalMaxArticles = max_articles || 30;
      // Default to true if not specified for WordPress
      finalAllowArticles = allow_articles !== undefined ? allow_articles : true;
    }

    const site_name = site_url;

    const result = await query(
      'INSERT INTO sites (site_url, site_name, api_key, site_type, user_id, max_links, max_articles, used_links, used_articles, allow_articles) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [site_url, site_name, finalApiKey, finalSiteType, userId, max_links || 10, finalMaxArticles, 0, 0, finalAllowArticles]
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
    const { site_url, site_name, api_key, max_links, max_articles, site_type } = data;

    // SECURITY: Validate URL format if provided
    if (site_url) {
      try {
        const parsedUrl = new URL(site_url);
        // Only allow HTTP and HTTPS protocols
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          throw new Error('Only HTTP and HTTPS protocols are allowed');
        }
        // Check for valid hostname
        if (!parsedUrl.hostname || parsedUrl.hostname.length < 3) {
          throw new Error('Invalid hostname in URL');
        }
      } catch (urlError) {
        if (urlError.message.includes('Invalid URL')) {
          throw new Error('Invalid site URL format. Must be a valid HTTP or HTTPS URL.');
        }
        throw urlError;
      }
    }

    // Validate site_type if provided
    if (site_type && !['wordpress', 'static_php'].includes(site_type)) {
      throw new Error('Invalid site_type. Must be wordpress or static_php');
    }

    // For static_php sites, force max_articles to 0
    let finalMaxArticles = max_articles;
    if (site_type === 'static_php') {
      finalMaxArticles = 0;
    }

    const result = await query(
      `UPDATE sites
       SET site_url = COALESCE($1, site_url),
           site_name = COALESCE($2, site_name),
           api_key = COALESCE($3, api_key),
           max_links = COALESCE($4, max_links),
           max_articles = COALESCE($5, max_articles),
           site_type = COALESCE($6, site_type)
       WHERE id = $7 AND user_id = $8
       RETURNING *`,
      [site_url, site_name, api_key, max_links, finalMaxArticles, site_type, siteId, userId]
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
      'SELECT id, user_id, site_name, site_url, api_key, site_type, max_links, max_articles, used_links, used_articles, created_at FROM sites WHERE id = $1 AND user_id = $2',
      [siteId, userId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Get site by ID error:', error);
    throw error;
  }
};

// Get site by domain (for static PHP widget)
const getSiteByDomain = async (domain) => {
  try {
    // Normalize domain: remove protocol, www, trailing slash, path
    const normalizedDomain = domain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '');

    // Try to find site by exact domain match
    // Normalize site_url the same way: remove protocol, www, and path
    const result = await query(
      `SELECT id, user_id, site_name, site_url, site_type, max_links, max_articles, used_links, used_articles, created_at
       FROM sites
       WHERE LOWER(
         REGEXP_REPLACE(
           REGEXP_REPLACE(
             REGEXP_REPLACE(site_url, '^https?://', ''),
             '^www\\.', ''
           ),
           '/.*$', ''
         )
       ) = $1
       AND site_type = 'static_php'
       LIMIT 1`,
      [normalizedDomain]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Get site by domain error:', error);
    throw error;
  }
};

module.exports = {
  getUserSites,
  createSite,
  updateSite,
  deleteSite,
  recalculateSiteStats,
  getSiteById,
  getSiteByDomain
};