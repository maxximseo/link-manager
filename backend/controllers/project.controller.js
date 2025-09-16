/**
 * Project controller
 * Handles project-related business logic
 */

const projectService = require('../services/project.service');
const logger = require('../config/logger');

// Get all projects for user
const getProjects = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    const result = await projectService.getUserProjects(req.user.userId, page, limit);
    
    if (req.query.page || req.query.limit) {
      // Return paginated response
      res.json(result);
    } else {
      // Return simple array for backward compatibility
      res.json(result.data || result);
    }
  } catch (error) {
    logger.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
};

// Get single project with details
const getProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.userId;
    
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
    const { name, description } = req.body;
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Project name is required' });
    }
    
    if (name.length > 255) {
      return res.status(400).json({ error: 'Project name must be less than 255 characters' });
    }
    
    if (description && description.length > 1000) {
      return res.status(400).json({ error: 'Description must be less than 1000 characters' });
    }
    
    const project = await projectService.createProject({
      name: name.trim(),
      description: description?.trim() || null,
      userId: req.user.userId
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
    const userId = req.user.userId;
    const { name, description } = req.body;
    
    const project = await projectService.updateProject(projectId, userId, { name, description });
    
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
    const userId = req.user.userId;
    
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

// Project links methods (placeholder)
const getProjectLinks = async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
};

const addProjectLink = async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
};

const addProjectLinksBulk = async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
};

const deleteProjectLink = async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
};

// Project articles methods (placeholder)
const getProjectArticles = async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
};

const addProjectArticle = async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
};

const updateProjectArticle = async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
};

const deleteProjectArticle = async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
};

module.exports = {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getProjectLinks,
  addProjectLink,
  addProjectLinksBulk,
  deleteProjectLink,
  getProjectArticles,
  addProjectArticle,
  updateProjectArticle,
  deleteProjectArticle
};