/**
 * Project controller
 * Handles project-related business logic
 */

const projectService = require('../services/project.service');
const logger = require('../config/logger');
const { validatePagination } = require('../utils/validators');

// Get all projects for user
const getProjects = async (req, res) => {
  try {
    const { page, limit } = validatePagination(req.query, {
      maxLimit: 100,
      defaultLimit: 20,
      defaultPage: 1
    });

    const result = await projectService.getUserProjects(req.user.id, page, limit);

    if (req.query.page || req.query.limit) {
      // Return paginated response
      res.json(result);
    } else {
      // Return simple array for backward compatibility
      res.json(result.data || result);
    }
  } catch (error) {
    logger.error('Get projects error:', error);

    if (error.message.includes('Page number') || error.message.includes('Limit cannot')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to fetch projects' });
  }
};

// Get single project with details
const getProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;
    
    const project = await projectService.getProjectWithDetails(projectId, userId);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    logger.error('Get project error:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
};

// Create new project
const createProject = async (req, res) => {
  try {
    const { name, description, main_site_url } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    if (name.length > 255) {
      return res.status(400).json({ error: 'Project name must be less than 255 characters' });
    }

    if (description && description.length > 1000) {
      return res.status(400).json({ error: 'Description must be less than 1000 characters' });
    }

    // Validate main_site_url if provided
    if (main_site_url && main_site_url.trim()) {
      const urlTrimmed = main_site_url.trim();
      if (urlTrimmed.length > 500) {
        return res.status(400).json({ error: 'URL must be less than 500 characters' });
      }
      // Basic URL validation
      try {
        new URL(urlTrimmed);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid URL format' });
      }
    }

    const project = await projectService.createProject({
      name: name.trim(),
      description: description?.trim() || null,
      main_site_url: main_site_url?.trim() || null,
      userId: req.user.id
    });

    res.json(project);
  } catch (error) {
    logger.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
};

// Update project
const updateProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;
    const { name, description, main_site_url } = req.body;

    // Validate main_site_url if provided
    if (main_site_url && main_site_url.trim()) {
      const urlTrimmed = main_site_url.trim();
      if (urlTrimmed.length > 500) {
        return res.status(400).json({ error: 'URL must be less than 500 characters' });
      }
      // Basic URL validation
      try {
        new URL(urlTrimmed);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid URL format' });
      }
    }

    const project = await projectService.updateProject(projectId, userId, {
      name,
      description,
      main_site_url: main_site_url?.trim() || null
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    logger.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
};

// Delete project
const deleteProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;
    
    const deleted = await projectService.deleteProject(projectId, userId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    logger.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
};

// Project links methods
const getProjectLinks = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;
    
    const links = await projectService.getProjectLinks(projectId, userId);
    
    if (links === null) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(links);
  } catch (error) {
    logger.error('Get project links error:', error);
    res.status(500).json({ error: 'Failed to fetch project links' });
  }
};

const addProjectLink = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;
    const { url, anchor_text, position, usage_limit, html_context } = req.body;

    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return res.status(400).json({ error: 'Valid URL is required' });
    }

    // Validate html_context if provided
    if (html_context) {
      if (html_context.length < 30) {
        return res.status(400).json({ error: 'HTML context must be at least 30 characters' });
      }
      if (html_context.length > 250) {
        return res.status(400).json({ error: 'HTML context must not exceed 250 characters' });
      }
      if (!/<a\s+href=["'][^"']+["'][^>]*>[^<]+<\/a>/i.test(html_context)) {
        return res.status(400).json({ error: 'HTML context must contain an <a> tag' });
      }
    }

    const link = await projectService.addProjectLink(projectId, userId, {
      url,
      anchor_text,
      position,
      usage_limit: usage_limit || 1,
      html_context
    });

    if (link === null) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(link);
  } catch (error) {
    logger.error('Add project link error:', error);

    // Return specific error message for duplicate anchor text
    if (error.message && error.message.includes('Duplicate anchor text')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to add project link' });
  }
};

const updateProjectLink = async (req, res) => {
  try {
    const projectId = req.params.id;
    const linkId = req.params.linkId;
    const userId = req.user.id;
    const { url, anchor_text, usage_limit } = req.body;

    const link = await projectService.updateProjectLink(projectId, linkId, userId, {
      url,
      anchor_text,
      usage_limit
    });

    if (link === null) {
      return res.status(404).json({ error: 'Project or link not found' });
    }

    res.json(link);
  } catch (error) {
    logger.error('Update project link error:', error);
    res.status(500).json({ error: 'Failed to update project link' });
  }
};

const addProjectLinksBulk = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;
    const { links } = req.body;

    // Validate each link's html_context if provided
    if (Array.isArray(links)) {
      for (const link of links) {
        if (link.html_context) {
          if (link.html_context.length < 30 || link.html_context.length > 250) {
            return res.status(400).json({
              error: `HTML context must be 30-250 characters. Got ${link.html_context.length} for: ${link.anchor_text}`
            });
          }
          if (!/<a\s+href=["'][^"']+["'][^>]*>[^<]+<\/a>/i.test(link.html_context)) {
            return res.status(400).json({
              error: `HTML context must contain an <a> tag for: ${link.anchor_text}`
            });
          }
        }
      }
    }

    const result = await projectService.addProjectLinksBulk(projectId, userId, links);

    if (result === null) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Build message with duplicate info
    let message = `Successfully imported ${result.summary.imported} links`;
    if (result.summary.duplicates > 0) {
      message += `. Skipped ${result.summary.duplicates} duplicate${result.summary.duplicates > 1 ? 's' : ''}`;
    }

    res.json({
      message,
      links: result.imported,
      duplicates: result.duplicates,
      summary: result.summary
    });
  } catch (error) {
    logger.error('Bulk add project links error:', error);
    res.status(500).json({ error: error.message || 'Failed to bulk import links' });
  }
};

const deleteProjectLink = async (req, res) => {
  try {
    // Only admins can delete links
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Only admins can delete links.' });
    }

    const projectId = req.params.id;
    const linkId = req.params.linkId;
    const userId = req.user.id;

    const deleted = await projectService.deleteProjectLink(projectId, linkId, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Project link not found' });
    }

    res.json({ message: 'Project link deleted successfully' });
  } catch (error) {
    logger.error('Delete project link error:', error);
    res.status(500).json({ error: 'Failed to delete project link' });
  }
};

// Project articles methods
const getProjectArticles = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;
    
    const articles = await projectService.getProjectArticles(projectId, userId);
    
    if (articles === null) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(articles);
  } catch (error) {
    logger.error('Get project articles error:', error);
    res.status(500).json({ error: 'Failed to fetch project articles' });
  }
};

const addProjectArticle = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;
    const { title, content, excerpt, meta_title, meta_description, featured_image, slug, tags, category } = req.body;
    
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Article title is required' });
    }
    
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Article content is required' });
    }
    
    const article = await projectService.addProjectArticle(projectId, userId, {
      title: title.trim(),
      content: content.trim(),
      excerpt,
      meta_title,
      meta_description,
      featured_image,
      slug,
      tags,
      category
    });
    
    if (article === null) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(article);
  } catch (error) {
    logger.error('Add project article error:', error);
    res.status(500).json({ error: 'Failed to add project article' });
  }
};

const updateProjectArticle = async (req, res) => {
  try {
    const projectId = req.params.id;  // Route uses /:id not /:projectId
    const articleId = req.params.articleId;
    const userId = req.user.id;
    const { title, content, excerpt, meta_title, meta_description, featured_image, slug, tags, category } = req.body;
    
    const article = await projectService.updateProjectArticle(projectId, articleId, userId, {
      title,
      content,
      excerpt,
      meta_title,
      meta_description,
      featured_image,
      slug,
      tags,
      category
    });
    
    if (article === null) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    res.json(article);
  } catch (error) {
    logger.error('Update project article error:', error);
    res.status(500).json({ error: 'Failed to update project article' });
  }
};

const deleteProjectArticle = async (req, res) => {
  try {
    // Only admins can delete articles
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Only admins can delete articles.' });
    }

    const projectId = req.params.id;
    const articleId = req.params.articleId;
    const userId = req.user.id;

    const deleted = await projectService.deleteProjectArticle(projectId, articleId, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Article not found' });
    }

    res.json({ message: 'Project article deleted successfully' });
  } catch (error) {
    logger.error('Delete project article error:', error);
    res.status(500).json({ error: 'Failed to delete project article' });
  }
};

module.exports = {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getProjectLinks,
  addProjectLink,
  updateProjectLink,
  addProjectLinksBulk,
  deleteProjectLink,
  getProjectArticles,
  addProjectArticle,
  updateProjectArticle,
  deleteProjectArticle
};