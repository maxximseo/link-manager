/**
 * WordPress service
 * Handles WordPress integration operations
 */

const { query } = require('../config/database');
const logger = require('../config/logger');
const axios = require('axios');
const cache = require('./cache.service');

// Get content by API key (with Redis caching)
const getContentByApiKey = async (apiKey) => {
  try {
    // Check cache first (5 minutes TTL)
    const cacheKey = `wp:content:${apiKey}`;
    const cached = await cache.get(cacheKey);

    if (cached) {
      logger.debug('WordPress content served from cache', { apiKey });
      return cached;
    }

    // Get all content for sites with this API key
    const result = await query(`
      SELECT
        pl.id,
        pl.url,
        pl.anchor_text
      FROM project_links pl
      JOIN placement_content pc ON pl.id = pc.link_id
      JOIN placements plc ON pc.placement_id = plc.id
      JOIN sites s ON plc.site_id = s.id
      WHERE s.api_key = $1
        AND pc.link_id IS NOT NULL
      ORDER BY pc.id DESC
    `, [apiKey]);

    // Format response for WordPress plugin
    const links = result.rows.map(row => ({
      url: row.url,
      anchor_text: row.anchor_text,
      position: '' // Position can be added later if needed
    }));

    const response = {
      links: links,
      articles: [] // Articles are published separately via REST API
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, response, 300);
    logger.debug('WordPress content cached', { apiKey, linksCount: links.length });

    return response;
  } catch (error) {
    logger.error('Get content by API key error:', error);
    throw error;
  }
};

// Publish article to WordPress via Link Manager plugin
const publishArticle = async (siteUrl, apiKey, articleData) => {
  try {
    const { title, content, slug } = articleData;

    // Use Link Manager plugin REST API endpoint
    const pluginUrl = `${siteUrl}/wp-json/link-manager/v1/create-article`;

    const response = await axios.post(pluginUrl, {
      title,
      content,
      slug,
      api_key: apiKey
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      timeout: 30000
    });

    if (response.data.success) {
      logger.info('Article published to WordPress via plugin', {
        siteUrl,
        articleId: response.data.post_id,
        title
      });

      return {
        success: true,
        wordpress_id: response.data.post_id,
        url: response.data.post_url
      };
    } else {
      throw new Error(response.data.error || 'Failed to publish article');
    }
  } catch (error) {
    logger.error('WordPress publish error:', error);
    throw new Error(`Failed to publish to WordPress: ${error.response?.data?.error || error.message}`);
  }
};

// Delete article from WordPress via Link Manager plugin
const deleteArticle = async (siteUrl, apiKey, wordpressPostId) => {
  try {
    if (!wordpressPostId) {
      logger.warn('No WordPress post ID provided for deletion');
      return { success: false, error: 'No WordPress post ID' };
    }

    // Use Link Manager plugin REST API endpoint
    const pluginUrl = `${siteUrl}/wp-json/link-manager/v1/delete-article/${wordpressPostId}`;

    const response = await axios.delete(pluginUrl, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      timeout: 30000
    });

    if (response.data.success) {
      logger.info('Article deleted from WordPress via plugin', {
        siteUrl,
        postId: wordpressPostId
      });

      return {
        success: true,
        post_id: wordpressPostId
      };
    } else {
      throw new Error(response.data.error || 'Failed to delete article');
    }
  } catch (error) {
    // Don't throw error if post doesn't exist (404) - it's already deleted
    if (error.response?.status === 404) {
      logger.info('Article already deleted from WordPress', { wordpressPostId });
      return { success: true, post_id: wordpressPostId, already_deleted: true };
    }

    logger.error('WordPress delete error:', error);
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

// Verify WordPress connection via Link Manager plugin
const verifyWordPressConnection = async (siteUrl, apiKey) => {
  try {
    // Check if Link Manager plugin REST API is available
    const testUrl = `${siteUrl}/wp-json/link-manager/v1/create-article`;

    const response = await axios.options(testUrl, {
      timeout: 10000
    });

    return {
      success: true,
      status: response.status,
      message: 'Link Manager plugin is active'
    };
  } catch (error) {
    logger.error('WordPress verification error:', error);
    return {
      success: false,
      error: error.message || 'Link Manager plugin not found or not activated'
    };
  }
};

// Get site by API key
const getSiteByApiKey = async (apiKey) => {
  try {
    const result = await query(
      'SELECT id, site_url, site_name, max_links, used_links, max_articles, used_articles FROM sites WHERE api_key = $1',
      [apiKey]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Get site by API key error:', error);
    throw error;
  }
};

// Get site by ID
const getSiteById = async (siteId, userId) => {
  try {
    const result = await query(
      'SELECT id, site_url, site_name, api_key FROM sites WHERE id = $1 AND user_id = $2',
      [siteId, userId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Get site by ID error:', error);
    throw error;
  }
};

// Get article by ID
const getArticleById = async (articleId, userId) => {
  try {
    const result = await query(
      `SELECT pa.id, pa.title, pa.content, pa.slug
       FROM project_articles pa
       JOIN projects p ON pa.project_id = p.id
       WHERE pa.id = $1 AND p.user_id = $2`,
      [articleId, userId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Get article by ID error:', error);
    throw error;
  }
};

// Update placement with WordPress post ID
const updatePlacementWithPostId = async (siteId, articleId, wordpressPostId) => {
  try {
    await query(
      `UPDATE placements
       SET wordpress_post_id = $1, status = 'placed'
       WHERE site_id = $2
         AND id IN (
           SELECT placement_id
           FROM placement_content
           WHERE article_id = $3
         )`,
      [wordpressPostId, siteId, articleId]
    );

    logger.info('Placement updated with WordPress post ID', { siteId, articleId, wordpressPostId });
  } catch (error) {
    logger.error('Update placement with post ID error:', error);
    throw error;
  }
};

module.exports = {
  getContentByApiKey,
  publishArticle,
  deleteArticle,
  verifyWordPressConnection,
  getSiteByApiKey,
  getSiteById,
  getArticleById,
  updatePlacementWithPostId
};