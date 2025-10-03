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
        'link' as type,
        pl.id,
        pl.url,
        pl.text,
        s.site_url
      FROM project_links pl
      JOIN projects p ON pl.project_id = p.id
      JOIN placement_content pc ON pl.id = pc.link_id
      JOIN placements plc ON pc.placement_id = plc.id
      JOIN sites s ON plc.site_id = s.id
      WHERE s.api_key = $1
      
      UNION ALL
      
      SELECT 
        'article' as type,
        pa.id,
        pa.title as url,
        pa.content as text,
        s.site_url
      FROM project_articles pa
      JOIN projects p ON pa.project_id = p.id
      JOIN placement_content pc ON pa.id = pc.article_id
      JOIN placements plc ON pc.placement_id = plc.id
      JOIN sites s ON plc.site_id = s.id
      WHERE s.api_key = $1
      
      ORDER BY id DESC
    `, [apiKey]);
    
    return result.rows;
  } catch (error) {
    logger.error('Get content by API key error:', error);
    throw error;
  }
};

// Publish article to WordPress
const publishArticle = async (siteUrl, apiKey, articleData) => {
  try {
    const { title, content, slug } = articleData;
    
    const wordpressUrl = `${siteUrl}/wp-json/wp/v2/posts`;
    
    const response = await axios.post(wordpressUrl, {
      title,
      content,
      slug,
      status: 'publish'
    }, {
      auth: {
        username: apiKey.split('_')[1] || 'api',
        password: apiKey
      },
      timeout: 30000
    });
    
    logger.info('Article published to WordPress', {
      siteUrl,
      articleId: response.data.id,
      title
    });
    
    return {
      success: true,
      wordpress_id: response.data.id,
      url: response.data.link
    };
  } catch (error) {
    logger.error('WordPress publish error:', error);
    throw new Error(`Failed to publish to WordPress: ${error.message}`);
  }
};

// Verify WordPress connection
const verifyWordPressConnection = async (siteUrl, apiKey) => {
  try {
    const testUrl = `${siteUrl}/wp-json/wp/v2/posts?per_page=1`;

    const response = await axios.get(testUrl, {
      auth: {
        username: apiKey.split('_')[1] || 'api',
        password: apiKey
      },
      timeout: 10000
    });

    return {
      success: true,
      status: response.status,
      posts_count: response.data.length
    };
  } catch (error) {
    logger.error('WordPress verification error:', error);
    return {
      success: false,
      error: error.message
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