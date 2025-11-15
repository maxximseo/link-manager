/**
 * Site controller
 * Handles site-related business logic
 */

const siteService = require('../services/site.service');
const logger = require('../config/logger');
const { validatePagination } = require('../utils/validators');

// Get all sites for user
const getSites = async (req, res) => {
  try {
    const { page, limit } = validatePagination(req.query, {
      maxLimit: 100,
      defaultLimit: 20,
      defaultPage: 1
    });
    const recalculate = req.query.recalculate === 'true';

    const result = await siteService.getUserSites(req.user.id, page, limit, recalculate);

    res.json(result);
  } catch (error) {
    logger.error('Get sites error:', error);

    if (error.message.includes('Page number') || error.message.includes('Limit cannot')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to fetch sites' });
  }
};

// Get single site
const getSite = async (req, res) => {
  try {
    const siteId = req.params.id;
    const userId = req.user.id;
    
    const site = await siteService.getSiteById(siteId, userId);
    
    if (!site) {
      return res.status(404).json({ error: 'Site not found' });
    }
    
    res.json(site);
  } catch (error) {
    logger.error('Get site error:', error);
    res.status(500).json({ error: 'Failed to fetch site' });
  }
};

// Create new site
const createSite = async (req, res) => {
  try {
    const { site_url, api_key, max_links, max_articles, site_type, allow_articles, is_public, available_for_purchase } = req.body;

    // Validate required fields
    if (!site_url || typeof site_url !== 'string' || site_url.trim().length === 0) {
      return res.status(400).json({ error: 'Site URL is required' });
    }

    // Validate URL format
    const urlPattern = /^https?:\/\/.+/;
    if (!urlPattern.test(site_url)) {
      return res.status(400).json({ error: 'Site URL must be a valid HTTP/HTTPS URL' });
    }

    // Validate site_type
    if (site_type && !['wordpress', 'static_php'].includes(site_type)) {
      return res.status(400).json({ error: 'Site type must be wordpress or static_php' });
    }

    // Validate API key length (VARCHAR(100) in database)
    if (api_key && (typeof api_key !== 'string' || api_key.length > 100)) {
      return res.status(400).json({ error: 'API key must be less than 100 characters' });
    }

    // Validate numeric fields
    if (max_links !== undefined && (typeof max_links !== 'number' || max_links < 0)) {
      return res.status(400).json({ error: 'Max links must be a positive number' });
    }

    if (max_articles !== undefined && (typeof max_articles !== 'number' || max_articles < 0)) {
      return res.status(400).json({ error: 'Max articles must be a positive number' });
    }

    // Validate allow_articles if provided
    if (allow_articles !== undefined && typeof allow_articles !== 'boolean') {
      return res.status(400).json({ error: 'Allow articles must be a boolean value' });
    }

    // Validate is_public if provided
    if (is_public !== undefined && typeof is_public !== 'boolean') {
      return res.status(400).json({ error: 'is_public must be a boolean value' });
    }

    const site = await siteService.createSite({
      site_url: site_url.trim(),
      api_key,
      max_links,
      max_articles,
      site_type,
      allow_articles,
      is_public,
      userId: req.user.id
    });

    res.json(site);
  } catch (error) {
    logger.error('Create site error:', error);
    res.status(500).json({ error: 'Failed to create site' });
  }
};

// Update site
const updateSite = async (req, res) => {
  try {
    const siteId = req.params.id;
    const userId = req.user.id;
    const { site_url, site_name, api_key, max_links, max_articles, site_type, allow_articles, is_public } = req.body;

    // Validate URL format if provided
    if (site_url) {
      const urlPattern = /^https?:\/\/.+/;
      if (!urlPattern.test(site_url)) {
        return res.status(400).json({ error: 'Site URL must be a valid HTTP/HTTPS URL' });
      }
    }

    // Validate site_type if provided
    if (site_type && !['wordpress', 'static_php'].includes(site_type)) {
      return res.status(400).json({ error: 'Site type must be wordpress or static_php' });
    }

    // Validate numeric fields
    if (max_links !== undefined && (typeof max_links !== 'number' || max_links < 0)) {
      return res.status(400).json({ error: 'Max links must be a positive number' });
    }

    if (max_articles !== undefined && (typeof max_articles !== 'number' || max_articles < 0)) {
      return res.status(400).json({ error: 'Max articles must be a positive number' });
    }

    // Validate allow_articles if provided
    if (allow_articles !== undefined && typeof allow_articles !== 'boolean') {
      return res.status(400).json({ error: 'Allow articles must be a boolean value' });
    }

    // Validate is_public if provided
    if (is_public !== undefined && typeof is_public !== 'boolean') {
      return res.status(400).json({ error: 'is_public must be a boolean value' });
    }

    const site = await siteService.updateSite(siteId, userId, {
      site_url,
      site_name,
      api_key,
      max_links,
      max_articles,
      site_type,
      allow_articles,
      is_public
    });

    if (!site) {
      return res.status(404).json({ error: 'Site not found' });
    }

    res.json(site);
  } catch (error) {
    logger.error('Update site error:', error);
    res.status(500).json({ error: 'Failed to update site' });
  }
};

// Delete site with automatic refunds
const deleteSite = async (req, res) => {
  try {
    const siteId = req.params.id;
    const userId = req.user.id;

    const result = await siteService.deleteSite(siteId, userId);

    if (!result.deleted) {
      return res.status(404).json({ error: result.error || 'Site not found' });
    }

    // Return detailed refund information for frontend
    res.json({
      success: true,
      message: 'Site deleted successfully',
      placementsCount: result.placementsCount,
      refundedCount: result.refundedCount,
      totalRefunded: result.totalRefunded,
      tierChanged: result.tierChanged,
      newTier: result.newTier,
      refundDetails: result.refundDetails
    });
  } catch (error) {
    logger.error('Delete site error:', error);
    res.status(500).json({ error: 'Failed to delete site: ' + error.message });
  }
};

// Recalculate site statistics
const recalculateStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    await siteService.recalculateSiteStats(userId);
    
    res.json({ message: 'Site statistics recalculated successfully' });
  } catch (error) {
    logger.error('Recalculate stats error:', error);
    res.status(500).json({ error: 'Failed to recalculate statistics' });
  }
};

// Get marketplace sites (public + owned)
const getMarketplaceSites = async (req, res) => {
  try {
    const userId = req.user.id;
    const sites = await siteService.getMarketplaceSites(userId);

    res.json({ data: sites });
  } catch (error) {
    logger.error('Get marketplace sites error:', error);
    res.status(500).json({ error: 'Failed to get marketplace sites' });
  }
};

module.exports = {
  getSites,
  getSite,
  getMarketplaceSites,
  createSite,
  updateSite,
  deleteSite,
  recalculateStats
};