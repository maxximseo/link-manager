/**
 * WordPress controller
 * Handles WordPress integration business logic
 */

const wordpressService = require('../services/wordpress.service');
const logger = require('../config/logger');

// Get content by API key (for WordPress plugin)
const getContent = async (req, res) => {
  try {
    const apiKey = req.params.api_key;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }
    
    const content = await wordpressService.getContentByApiKey(apiKey);
    
    res.json(content);
  } catch (error) {
    logger.error('Get WordPress content error:', error);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
};

// Publish article to WordPress
const publishArticle = async (req, res) => {
  try {
    const { site_url, api_key, title, content, slug } = req.body;
    
    // Validate required fields
    if (!site_url || !api_key || !title || !content) {
      return res.status(400).json({ 
        error: 'Site URL, API key, title, and content are required' 
      });
    }
    
    // Validate URL format
    const urlPattern = /^https?:\/\/.+/;
    if (!urlPattern.test(site_url)) {
      return res.status(400).json({ error: 'Site URL must be a valid HTTP/HTTPS URL' });
    }
    
    const result = await wordpressService.publishArticle(site_url, api_key, {
      title,
      content,
      slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    });
    
    res.json(result);
  } catch (error) {
    logger.error('WordPress publish error:', error);
    res.status(500).json({ error: error.message || 'Failed to publish article' });
  }
};

// Verify WordPress connection
const verifyConnection = async (req, res) => {
  try {
    const { api_key } = req.body;

    if (!api_key) {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Get site info by API key
    const result = await wordpressService.getSiteByApiKey(api_key);

    if (!result) {
      return res.json({
        success: false,
        error: 'Site not found with this API key'
      });
    }

    res.json({
      success: true,
      site: result
    });
  } catch (error) {
    logger.error('WordPress verify error:', error);
    res.status(500).json({ error: 'Failed to verify connection' });
  }
};

// Generic content endpoint (compatibility)
const handleContent = async (req, res) => {
  try {
    // This endpoint handles various WordPress content operations
    // For now, return success with basic info
    res.json({ 
      message: 'WordPress content endpoint available',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('WordPress content error:', error);
    res.status(500).json({ error: 'WordPress content operation failed' });
  }
};

module.exports = {
  getContent,
  publishArticle,
  verifyConnection,
  handleContent
};