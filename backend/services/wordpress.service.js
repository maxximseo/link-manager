/**
 * WordPress service
 * Handles WordPress integration operations
 */

const { query } = require('../config/database');
const logger = require('../config/logger');
const axios = require('axios');

// Get content by API key
const getContentByApiKey = async (apiKey) => {
  try {
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

    return {
      links: links,
      articles: [] // Articles are published separately via REST API
    };
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

module.exports = {
  getContentByApiKey,
  publishArticle,
  verifyWordPressConnection,
  getSiteByApiKey
};