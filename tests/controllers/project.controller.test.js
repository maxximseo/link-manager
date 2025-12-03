/**
 * Project Controller Tests
 */

const projectController = require('../../backend/controllers/project.controller');

// Mock dependencies
jest.mock('../../backend/services/project.service');
jest.mock('../../backend/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

const projectService = require('../../backend/services/project.service');

describe('Project Controller', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = {
      body: {},
      params: {},
      query: {},
      user: { id: 1, username: 'testuser', role: 'user' }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('getProjects', () => {
    it('should return paginated projects', async () => {
      mockReq.query = { page: '1', limit: '20' };
      const mockResult = {
        data: [{ id: 1, name: 'Project 1' }],
        pagination: { page: 1, limit: 20, total: 1, pages: 1 }
      };
      projectService.getUserProjects.mockResolvedValue(mockResult);

      await projectController.getProjects(mockReq, mockRes);

      expect(projectService.getUserProjects).toHaveBeenCalledWith(1, 1, 20);
      expect(mockRes.json).toHaveBeenCalledWith(mockResult);
    });

    it('should return simple array without pagination params', async () => {
      mockReq.query = {};
      const mockProjects = [{ id: 1, name: 'Project 1' }];
      projectService.getUserProjects.mockResolvedValue({ data: mockProjects });

      await projectController.getProjects(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(mockProjects);
    });

    it('should return 500 on service error', async () => {
      mockReq.query = {};
      projectService.getUserProjects.mockRejectedValue(new Error('Database error'));

      await projectController.getProjects(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getProject', () => {
    it('should return project with details', async () => {
      mockReq.params = { id: '1' };
      const mockProject = { id: 1, name: 'Project 1', links: [], articles: [] };
      projectService.getProjectWithDetails.mockResolvedValue(mockProject);

      await projectController.getProject(mockReq, mockRes);

      expect(projectService.getProjectWithDetails).toHaveBeenCalledWith('1', 1);
      expect(mockRes.json).toHaveBeenCalledWith(mockProject);
    });

    it('should return 404 if project not found', async () => {
      mockReq.params = { id: '999' };
      projectService.getProjectWithDetails.mockResolvedValue(null);

      await projectController.getProject(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Project not found' });
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { id: '1' };
      projectService.getProjectWithDetails.mockRejectedValue(new Error('Database error'));

      await projectController.getProject(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('createProject', () => {
    it('should create project successfully', async () => {
      mockReq.body = { name: 'New Project', description: 'Description' };
      const mockProject = { id: 1, name: 'New Project', description: 'Description' };
      projectService.createProject.mockResolvedValue(mockProject);

      await projectController.createProject(mockReq, mockRes);

      expect(projectService.createProject).toHaveBeenCalledWith({
        name: 'New Project',
        description: 'Description',
        main_site_url: null,
        userId: 1
      });
      expect(mockRes.json).toHaveBeenCalledWith(mockProject);
    });

    it('should return 400 if name is missing', async () => {
      mockReq.body = { description: 'Description' };

      await projectController.createProject(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Project name is required' });
    });

    it('should return 400 if name is empty string', async () => {
      mockReq.body = { name: '   ' };

      await projectController.createProject(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Project name is required' });
    });

    it('should return 400 if name is too long', async () => {
      mockReq.body = { name: 'a'.repeat(256) };

      await projectController.createProject(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Project name must be less than 255 characters'
      });
    });

    it('should return 400 if description is too long', async () => {
      mockReq.body = { name: 'Project', description: 'a'.repeat(1001) };

      await projectController.createProject(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Description must be less than 1000 characters'
      });
    });

    it('should return 400 if main_site_url is invalid', async () => {
      mockReq.body = { name: 'Project', main_site_url: 'invalid-url' };

      await projectController.createProject(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid URL format' });
    });

    it('should return 400 if main_site_url is too long', async () => {
      mockReq.body = { name: 'Project', main_site_url: 'https://example.com/' + 'a'.repeat(500) };

      await projectController.createProject(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'URL must be less than 500 characters'
      });
    });

    it('should accept valid main_site_url', async () => {
      mockReq.body = { name: 'Project', main_site_url: 'https://example.com' };
      projectService.createProject.mockResolvedValue({ id: 1, name: 'Project' });

      await projectController.createProject(mockReq, mockRes);

      expect(projectService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ main_site_url: 'https://example.com' })
      );
    });

    it('should return 500 on service error', async () => {
      mockReq.body = { name: 'Project' };
      projectService.createProject.mockRejectedValue(new Error('Database error'));

      await projectController.createProject(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updateProject', () => {
    it('should update project successfully', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { name: 'Updated Name' };
      const mockProject = { id: 1, name: 'Updated Name' };
      projectService.updateProject.mockResolvedValue(mockProject);

      await projectController.updateProject(mockReq, mockRes);

      expect(projectService.updateProject).toHaveBeenCalledWith('1', 1, {
        name: 'Updated Name',
        description: undefined,
        main_site_url: null
      });
      expect(mockRes.json).toHaveBeenCalledWith(mockProject);
    });

    it('should return 404 if project not found', async () => {
      mockReq.params = { id: '999' };
      mockReq.body = { name: 'Name' };
      projectService.updateProject.mockResolvedValue(null);

      await projectController.updateProject(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Project not found' });
    });

    it('should return 400 if URL is invalid', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { main_site_url: 'invalid-url' };

      await projectController.updateProject(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid URL format' });
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { name: 'Name' };
      projectService.updateProject.mockRejectedValue(new Error('Database error'));

      await projectController.updateProject(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('deleteProject', () => {
    it('should delete project successfully', async () => {
      mockReq.params = { id: '1' };
      projectService.deleteProject.mockResolvedValue(true);

      await projectController.deleteProject(mockReq, mockRes);

      expect(projectService.deleteProject).toHaveBeenCalledWith('1', 1);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Project deleted successfully' });
    });

    it('should return 404 if project not found', async () => {
      mockReq.params = { id: '999' };
      projectService.deleteProject.mockResolvedValue(false);

      await projectController.deleteProject(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Project not found' });
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { id: '1' };
      projectService.deleteProject.mockRejectedValue(new Error('Database error'));

      await projectController.deleteProject(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getProjectLinks', () => {
    it('should return project links', async () => {
      mockReq.params = { id: '1' };
      const mockLinks = [{ id: 1, url: 'https://example.com', anchor_text: 'Test' }];
      projectService.getProjectLinks.mockResolvedValue(mockLinks);

      await projectController.getProjectLinks(mockReq, mockRes);

      expect(projectService.getProjectLinks).toHaveBeenCalledWith('1', 1);
      expect(mockRes.json).toHaveBeenCalledWith(mockLinks);
    });

    it('should return 404 if project not found', async () => {
      mockReq.params = { id: '999' };
      projectService.getProjectLinks.mockResolvedValue(null);

      await projectController.getProjectLinks(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Project not found' });
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { id: '1' };
      projectService.getProjectLinks.mockRejectedValue(new Error('Database error'));

      await projectController.getProjectLinks(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('addProjectLink', () => {
    it('should add link successfully', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { url: 'https://example.com', anchor_text: 'Test' };
      const mockLink = { id: 1, url: 'https://example.com', anchor_text: 'Test' };
      projectService.addProjectLink.mockResolvedValue(mockLink);

      await projectController.addProjectLink(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(mockLink);
    });

    it('should return 400 if URL is missing', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { anchor_text: 'Test' };

      await projectController.addProjectLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Valid URL is required' });
    });

    it('should return 400 if URL does not start with http', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { url: 'example.com' };

      await projectController.addProjectLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Valid URL is required' });
    });

    it('should return 400 if html_context is too short', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = {
        url: 'https://example.com',
        html_context: 'short'
      };

      await projectController.addProjectLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'HTML context must be at least 30 characters'
      });
    });

    it('should return 400 if html_context is too long', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = {
        url: 'https://example.com',
        html_context: 'a'.repeat(251)
      };

      await projectController.addProjectLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'HTML context must not exceed 250 characters'
      });
    });

    it('should return 400 if html_context does not contain <a> tag', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = {
        url: 'https://example.com',
        html_context: 'This is some text without an anchor tag but long enough'
      };

      await projectController.addProjectLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'HTML context must contain an <a> tag'
      });
    });

    it('should accept valid html_context with <a> tag', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = {
        url: 'https://example.com',
        html_context: 'Check out this <a href="https://example.com">amazing link</a> for more info'
      };
      projectService.addProjectLink.mockResolvedValue({ id: 1 });

      await projectController.addProjectLink(mockReq, mockRes);

      expect(projectService.addProjectLink).toHaveBeenCalled();
    });

    it('should return 404 if project not found', async () => {
      mockReq.params = { id: '999' };
      mockReq.body = { url: 'https://example.com', anchor_text: 'Test' };
      projectService.addProjectLink.mockResolvedValue(null);

      await projectController.addProjectLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Project not found' });
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { url: 'https://example.com', anchor_text: 'Test' };
      projectService.addProjectLink.mockRejectedValue(new Error('Database error'));

      await projectController.addProjectLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updateProjectLink', () => {
    it('should update link successfully', async () => {
      mockReq.params = { id: '1', linkId: '10' };
      mockReq.body = { url: 'https://updated.com', anchor_text: 'Updated' };
      const mockLink = { id: 10, url: 'https://updated.com', anchor_text: 'Updated' };
      projectService.updateProjectLink.mockResolvedValue(mockLink);

      await projectController.updateProjectLink(mockReq, mockRes);

      expect(projectService.updateProjectLink).toHaveBeenCalledWith('1', '10', 1, {
        url: 'https://updated.com',
        anchor_text: 'Updated',
        usage_limit: undefined
      });
      expect(mockRes.json).toHaveBeenCalledWith(mockLink);
    });

    it('should return 404 if link not found', async () => {
      mockReq.params = { id: '1', linkId: '999' };
      mockReq.body = { anchor_text: 'Updated' };
      projectService.updateProjectLink.mockResolvedValue(null);

      await projectController.updateProjectLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Project or link not found' });
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { id: '1', linkId: '10' };
      mockReq.body = { anchor_text: 'Updated' };
      projectService.updateProjectLink.mockRejectedValue(new Error('Database error'));

      await projectController.updateProjectLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('addProjectLinksBulk', () => {
    it('should import links successfully', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = {
        links: [
          { url: 'https://example1.com', anchor_text: 'Link 1' },
          { url: 'https://example2.com', anchor_text: 'Link 2' }
        ]
      };
      const mockResult = {
        imported: [{ id: 1 }, { id: 2 }],
        invalidUrls: [],
        summary: { total: 2, imported: 2, invalidUrls: 0 }
      };
      projectService.addProjectLinksBulk.mockResolvedValue(mockResult);

      await projectController.addProjectLinksBulk(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('2 of 2'),
          summary: mockResult.summary
        })
      );
    });

    it('should return 404 if project not found', async () => {
      mockReq.params = { id: '999' };
      mockReq.body = { links: [{ url: 'https://example.com' }] };
      projectService.addProjectLinksBulk.mockResolvedValue(null);

      await projectController.addProjectLinksBulk(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Project not found' });
    });

    it('should return 400 for invalid html_context length', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = {
        links: [{ url: 'https://example.com', anchor_text: 'Test', html_context: 'short' }]
      };

      await projectController.addProjectLinksBulk(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 if html_context missing <a> tag', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = {
        links: [
          {
            url: 'https://example.com',
            anchor_text: 'Test',
            html_context: 'This is some text without anchor but long enough for validation'
          }
        ]
      };

      await projectController.addProjectLinksBulk(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { links: [{ url: 'https://example.com' }] };
      projectService.addProjectLinksBulk.mockRejectedValue(new Error('Database error'));

      await projectController.addProjectLinksBulk(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('deleteProjectLink', () => {
    it('should delete link successfully', async () => {
      mockReq.params = { id: '1', linkId: '10' };
      projectService.getProjectLinks.mockResolvedValue([
        { id: 10, url: 'https://example.com', usage_count: 0 }
      ]);
      projectService.deleteProjectLink.mockResolvedValue(true);

      await projectController.deleteProjectLink(mockReq, mockRes);

      expect(projectService.deleteProjectLink).toHaveBeenCalledWith('1', '10', 1);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Project link deleted successfully' });
    });

    it('should return 404 if link not found in project', async () => {
      mockReq.params = { id: '1', linkId: '999' };
      projectService.getProjectLinks.mockResolvedValue([
        { id: 10, url: 'https://example.com', usage_count: 0 }
      ]);

      await projectController.deleteProjectLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Project link not found' });
    });

    it('should return 403 for non-admin deleting used link', async () => {
      mockReq.params = { id: '1', linkId: '10' };
      mockReq.user = { id: 1, role: 'user' };
      projectService.getProjectLinks.mockResolvedValue([
        { id: 10, url: 'https://example.com', usage_count: 5 }
      ]);

      await projectController.deleteProjectLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('should allow admin to delete used link', async () => {
      mockReq.params = { id: '1', linkId: '10' };
      mockReq.user = { id: 1, role: 'admin' };
      projectService.getProjectLinks.mockResolvedValue([
        { id: 10, url: 'https://example.com', usage_count: 5 }
      ]);
      projectService.deleteProjectLink.mockResolvedValue(true);

      await projectController.deleteProjectLink(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Project link deleted successfully' });
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { id: '1', linkId: '10' };
      projectService.getProjectLinks.mockRejectedValue(new Error('Database error'));

      await projectController.deleteProjectLink(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getProjectArticles', () => {
    it('should return project articles', async () => {
      mockReq.params = { id: '1' };
      const mockArticles = [{ id: 1, title: 'Article 1', content: 'Content' }];
      projectService.getProjectArticles.mockResolvedValue(mockArticles);

      await projectController.getProjectArticles(mockReq, mockRes);

      expect(projectService.getProjectArticles).toHaveBeenCalledWith('1', 1);
      expect(mockRes.json).toHaveBeenCalledWith(mockArticles);
    });

    it('should return 404 if project not found', async () => {
      mockReq.params = { id: '999' };
      projectService.getProjectArticles.mockResolvedValue(null);

      await projectController.getProjectArticles(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Project not found' });
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { id: '1' };
      projectService.getProjectArticles.mockRejectedValue(new Error('Database error'));

      await projectController.getProjectArticles(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('addProjectArticle', () => {
    it('should add article successfully', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { title: 'New Article', content: 'Article content here' };
      const mockArticle = { id: 1, title: 'New Article', content: 'Article content here' };
      projectService.addProjectArticle.mockResolvedValue(mockArticle);

      await projectController.addProjectArticle(mockReq, mockRes);

      expect(projectService.addProjectArticle).toHaveBeenCalledWith('1', 1, expect.objectContaining({
        title: 'New Article',
        content: 'Article content here'
      }));
      expect(mockRes.json).toHaveBeenCalledWith(mockArticle);
    });

    it('should return 400 if title is missing', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { content: 'Content' };

      await projectController.addProjectArticle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Article title is required' });
    });

    it('should return 400 if content is missing', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { title: 'Title' };

      await projectController.addProjectArticle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Article content is required' });
    });

    it('should return 404 if project not found', async () => {
      mockReq.params = { id: '999' };
      mockReq.body = { title: 'Title', content: 'Content' };
      projectService.addProjectArticle.mockResolvedValue(null);

      await projectController.addProjectArticle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Project not found' });
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { title: 'Title', content: 'Content' };
      projectService.addProjectArticle.mockRejectedValue(new Error('Database error'));

      await projectController.addProjectArticle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updateProjectArticle', () => {
    it('should update article successfully', async () => {
      mockReq.params = { id: '1', articleId: '10' };
      mockReq.body = { title: 'Updated Title', content: 'Updated content' };
      const mockArticle = { id: 10, title: 'Updated Title', content: 'Updated content' };
      projectService.updateProjectArticle.mockResolvedValue(mockArticle);

      await projectController.updateProjectArticle(mockReq, mockRes);

      expect(projectService.updateProjectArticle).toHaveBeenCalledWith('1', '10', 1, expect.objectContaining({
        title: 'Updated Title',
        content: 'Updated content'
      }));
      expect(mockRes.json).toHaveBeenCalledWith(mockArticle);
    });

    it('should return 404 if article not found', async () => {
      mockReq.params = { id: '1', articleId: '999' };
      mockReq.body = { title: 'Title' };
      projectService.updateProjectArticle.mockResolvedValue(null);

      await projectController.updateProjectArticle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Article not found' });
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { id: '1', articleId: '10' };
      mockReq.body = { title: 'Title' };
      projectService.updateProjectArticle.mockRejectedValue(new Error('Database error'));

      await projectController.updateProjectArticle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('deleteProjectArticle', () => {
    it('should delete article successfully', async () => {
      mockReq.params = { id: '1', articleId: '10' };
      projectService.getProjectArticles.mockResolvedValue([
        { id: 10, title: 'Article', usage_count: 0 }
      ]);
      projectService.deleteProjectArticle.mockResolvedValue(true);

      await projectController.deleteProjectArticle(mockReq, mockRes);

      expect(projectService.deleteProjectArticle).toHaveBeenCalledWith('1', '10', 1);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Project article deleted successfully' });
    });

    it('should return 404 if article not found in project', async () => {
      mockReq.params = { id: '1', articleId: '999' };
      projectService.getProjectArticles.mockResolvedValue([
        { id: 10, title: 'Article', usage_count: 0 }
      ]);

      await projectController.deleteProjectArticle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Article not found' });
    });

    it('should return 403 for non-admin deleting used article', async () => {
      mockReq.params = { id: '1', articleId: '10' };
      mockReq.user = { id: 1, role: 'user' };
      projectService.getProjectArticles.mockResolvedValue([
        { id: 10, title: 'Article', usage_count: 1 }
      ]);

      await projectController.deleteProjectArticle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('should allow admin to delete used article', async () => {
      mockReq.params = { id: '1', articleId: '10' };
      mockReq.user = { id: 1, role: 'admin' };
      projectService.getProjectArticles.mockResolvedValue([
        { id: 10, title: 'Article', usage_count: 1 }
      ]);
      projectService.deleteProjectArticle.mockResolvedValue(true);

      await projectController.deleteProjectArticle(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Project article deleted successfully' });
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { id: '1', articleId: '10' };
      projectService.getProjectArticles.mockRejectedValue(new Error('Database error'));

      await projectController.deleteProjectArticle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});
