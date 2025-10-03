/**
 * Site controller
 * Handles site-related business logic
 */

const siteService = require('../services/site.service');
const logger = require('../config/logger');

// Get all sites for user
const getSites = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 0;
    const recalculate = req.query.recalculate === 'true';
    
    const result = await siteService.getUserSites(req.user.id, page, limit, recalculate);
    
    res.json(result);
  } catch (error) {
    logger.error('Get sites error:', error);
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
    const { site_url, api_key, max_links, max_articles } = req.body;
    
    // Validate required fields
    if (!site_url || typeof site_url !== 'string' || site_url.trim().length === 0) {
      return res.status(400).json({ error: 'Site URL is required' });
    }
    
    // Validate URL format
    const urlPattern = /^https?:\/\/.+/;
    if (!urlPattern.test(site_url)) {
      return res.status(400).json({ error: 'Site URL must be a valid HTTP/HTTPS URL' });
    }
    
    // Validate numeric fields
    if (max_links !== undefined && (typeof max_links !== 'number' || max_links < 0)) {
      return res.status(400).json({ error: 'Max links must be a positive number' });
    }
    
    if (max_articles !== undefined && (typeof max_articles !== 'number' || max_articles < 0)) {
      return res.status(400).json({ error: 'Max articles must be a positive number' });
    }
    
    const site = await siteService.createSite({
      site_url: site_url.trim(),
      api_key,
      max_links,
      max_articles,
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
    const { site_url, site_name, api_key, max_links, max_articles } = req.body;
    
    // Validate URL format if provided
    if (site_url) {
      const urlPattern = /^https?:\/\/.+/;
      if (!urlPattern.test(site_url)) {
        return res.status(400).json({ error: 'Site URL must be a valid HTTP/HTTPS URL' });
      }
    }
    
    // Validate numeric fields
    if (max_links !== undefined && (typeof max_links !== 'number' || max_links < 0)) {
      return res.status(400).json({ error: 'Max links must be a positive number' });
    }
    
    if (max_articles !== undefined && (typeof max_articles !== 'number' || max_articles < 0)) {
      return res.status(400).json({ error: 'Max articles must be a positive number' });
    }
    
    const site = await siteService.updateSite(siteId, userId, {
      site_url,
      site_name,
      api_key,
      max_links,
      max_articles
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

// Delete site
const deleteSite = async (req, res) => {
  try {
    const siteId = req.params.id;
    const userId = req.user.id;
    
    const deleted = await siteService.deleteSite(siteId, userId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Site not found' });
    }
    
    res.json({ message: 'Site deleted successfully' });
  } catch (error) {
    logger.error('Delete site error:', error);
    res.status(500).json({ error: 'Failed to delete site' });
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

module.exports = {
  getSites,
  getSite,
  createSite,
  updateSite,
  deleteSite,
  recalculateStats
};