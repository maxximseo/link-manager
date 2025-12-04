/**
 * WordPress controller
 * Handles WordPress integration business logic
 */

const wordpressService = require('../services/wordpress.service');
const siteService = require('../services/site.service');
const { handleError, handleSmartError } = require('../utils/errorHandler');

// Get content by API key (for WordPress plugin)
const getContent = async (req, res) => {
  try {
    // SECURITY: Read API key from header instead of URL to prevent logging
    const apiKey = req.headers['x-api-key'] || req.query.api_key; // Support both for backward compatibility

    if (!apiKey) {
      return res
        .status(400)
        .json({ error: 'API key is required in X-API-Key header or api_key query parameter' });
    }

    const content = await wordpressService.getContentByApiKey(apiKey);

    res.json(content);
  } catch (error) {
    return handleError(res, error, 'Failed to fetch content', 500);
  }
};

// Publish article to WordPress
const publishArticle = async (req, res) => {
  try {
    const { site_id, article_id } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!site_id || !article_id) {
      return res.status(400).json({
        error: 'Site ID and Article ID are required'
      });
    }

    // Get site details
    const site = await wordpressService.getSiteById(site_id, userId);
    if (!site) {
      return res.status(404).json({ error: 'Site not found' });
    }

    // Get article details
    const article = await wordpressService.getArticleById(article_id, userId);
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Publish to WordPress via plugin
    const result = await wordpressService.publishArticle(site.site_url, site.api_key, {
      title: article.title,
      content: article.content,
      slug: article.slug || article.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    });

    // Update placement with WordPress post ID if successful
    if (result.success && result.post_id) {
      await wordpressService.updatePlacementWithPostId(site_id, article_id, result.post_id);
    }

    res.json(result);
  } catch (error) {
    return handleSmartError(res, error, 'Failed to publish article', 500);
  }
};

// Verify WordPress connection
const verifyConnection = async (req, res) => {
  try {
    // SECURITY: Support API key from header (preferred) or body (backward compatibility)
    const api_key = req.headers['x-api-key'] || req.body.api_key;

    if (!api_key) {
      return res
        .status(400)
        .json({ error: 'API key is required in X-API-Key header or request body' });
    }

    // Get site info by API key
    const result = await wordpressService.getSiteByApiKey(api_key);

    if (!result) {
      return res.json({
        success: false,
        error: 'Invalid API key'
      });
    }

    // Calculate available content
    const availableLinks = result.max_links - result.used_links;
    const availableArticles = result.max_articles - result.used_articles;

    res.json({
      success: true,
      message: 'API key is valid',
      site_name: result.site_name,
      available_links: availableLinks,
      available_articles: availableArticles,
      max_links: result.max_links,
      used_links: result.used_links,
      max_articles: result.max_articles,
      used_articles: result.used_articles
    });
  } catch (error) {
    return handleError(res, error, 'Failed to verify connection', 500);
  }
};

// Generic content endpoint (compatibility)
const handleContent = (req, res) => {
  try {
    // This endpoint handles various WordPress content operations
    // For now, return success with basic info
    res.json({
      message: 'WordPress content endpoint available',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return handleError(res, error, 'WordPress content operation failed', 500);
  }
};

module.exports = {
  getContent,
  publishArticle,
  verifyConnection,
  handleContent
};
