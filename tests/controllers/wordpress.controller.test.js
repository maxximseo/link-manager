/**
 * WordPress Controller Tests
 */

const wordpressController = require('../../backend/controllers/wordpress.controller');

// Mock dependencies
jest.mock('../../backend/services/wordpress.service');
jest.mock('../../backend/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

const wordpressService = require('../../backend/services/wordpress.service');

describe('WordPress Controller', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = {
      body: {},
      params: {},
      query: {},
      headers: {},
      user: { id: 1, username: 'testuser', role: 'user' }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('getContent', () => {
    it('should return 400 if API key is missing', async () => {
      mockReq.headers = {};
      mockReq.query = {};

      await wordpressController.getContent(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'API key is required in X-API-Key header or api_key query parameter'
      });
    });

    it('should get content using X-API-Key header', async () => {
      mockReq.headers = { 'x-api-key': 'api_test123' };
      const mockContent = { links: [{ anchor_text: 'Test', url: 'https://example.com' }] };
      wordpressService.getContentByApiKey.mockResolvedValue(mockContent);

      await wordpressController.getContent(mockReq, mockRes);

      expect(wordpressService.getContentByApiKey).toHaveBeenCalledWith('api_test123');
      expect(mockRes.json).toHaveBeenCalledWith(mockContent);
    });

    it('should get content using query parameter (backward compatibility)', async () => {
      mockReq.query = { api_key: 'api_test456' };
      const mockContent = { links: [] };
      wordpressService.getContentByApiKey.mockResolvedValue(mockContent);

      await wordpressController.getContent(mockReq, mockRes);

      expect(wordpressService.getContentByApiKey).toHaveBeenCalledWith('api_test456');
      expect(mockRes.json).toHaveBeenCalledWith(mockContent);
    });

    it('should prefer header over query parameter', async () => {
      mockReq.headers = { 'x-api-key': 'header_key' };
      mockReq.query = { api_key: 'query_key' };
      wordpressService.getContentByApiKey.mockResolvedValue({});

      await wordpressController.getContent(mockReq, mockRes);

      expect(wordpressService.getContentByApiKey).toHaveBeenCalledWith('header_key');
    });

    it('should return 500 on service error', async () => {
      mockReq.headers = { 'x-api-key': 'api_test123' };
      wordpressService.getContentByApiKey.mockRejectedValue(new Error('Database error'));

      await wordpressController.getContent(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('publishArticle', () => {
    it('should return 400 if site_id is missing', async () => {
      mockReq.body = { article_id: 1 };

      await wordpressController.publishArticle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Site ID and Article ID are required'
      });
    });

    it('should return 400 if article_id is missing', async () => {
      mockReq.body = { site_id: 1 };

      await wordpressController.publishArticle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 if site not found', async () => {
      mockReq.body = { site_id: 999, article_id: 1 };
      wordpressService.getSiteById.mockResolvedValue(null);

      await wordpressController.publishArticle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Site not found' });
    });

    it('should return 404 if article not found', async () => {
      mockReq.body = { site_id: 1, article_id: 999 };
      wordpressService.getSiteById.mockResolvedValue({ id: 1, site_url: 'https://example.com' });
      wordpressService.getArticleById.mockResolvedValue(null);

      await wordpressController.publishArticle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Article not found' });
    });

    it('should publish article successfully', async () => {
      mockReq.body = { site_id: 1, article_id: 1 };
      const mockSite = { id: 1, site_url: 'https://example.com', api_key: 'api_123' };
      const mockArticle = { id: 1, title: 'Test Article', content: 'Content here' };
      const mockResult = { success: true, post_id: 123, url: 'https://example.com/test-article' };

      wordpressService.getSiteById.mockResolvedValue(mockSite);
      wordpressService.getArticleById.mockResolvedValue(mockArticle);
      wordpressService.publishArticle.mockResolvedValue(mockResult);
      wordpressService.updatePlacementWithPostId.mockResolvedValue(undefined);

      await wordpressController.publishArticle(mockReq, mockRes);

      expect(wordpressService.publishArticle).toHaveBeenCalledWith(
        'https://example.com',
        'api_123',
        expect.objectContaining({
          title: 'Test Article',
          content: 'Content here'
        })
      );
      expect(wordpressService.updatePlacementWithPostId).toHaveBeenCalledWith(1, 1, 123);
      expect(mockRes.json).toHaveBeenCalledWith(mockResult);
    });

    it('should not update placement if publish fails', async () => {
      mockReq.body = { site_id: 1, article_id: 1 };
      const mockSite = { id: 1, site_url: 'https://example.com', api_key: 'api_123' };
      const mockArticle = { id: 1, title: 'Test', content: 'Content' };
      const mockResult = { success: false, error: 'WordPress error' };

      wordpressService.getSiteById.mockResolvedValue(mockSite);
      wordpressService.getArticleById.mockResolvedValue(mockArticle);
      wordpressService.publishArticle.mockResolvedValue(mockResult);

      await wordpressController.publishArticle(mockReq, mockRes);

      expect(wordpressService.updatePlacementWithPostId).not.toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(mockResult);
    });

    it('should use article slug if available', async () => {
      mockReq.body = { site_id: 1, article_id: 1 };
      const mockSite = { id: 1, site_url: 'https://example.com', api_key: 'api_123' };
      const mockArticle = { id: 1, title: 'Test', content: 'Content', slug: 'custom-slug' };

      wordpressService.getSiteById.mockResolvedValue(mockSite);
      wordpressService.getArticleById.mockResolvedValue(mockArticle);
      wordpressService.publishArticle.mockResolvedValue({ success: true, post_id: 1 });
      wordpressService.updatePlacementWithPostId.mockResolvedValue(undefined);

      await wordpressController.publishArticle(mockReq, mockRes);

      expect(wordpressService.publishArticle).toHaveBeenCalledWith(
        'https://example.com',
        'api_123',
        expect.objectContaining({ slug: 'custom-slug' })
      );
    });

    it('should return 500 on service error', async () => {
      mockReq.body = { site_id: 1, article_id: 1 };
      wordpressService.getSiteById.mockRejectedValue(new Error('Database error'));

      await wordpressController.publishArticle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('verifyConnection', () => {
    it('should return 400 if API key is missing', async () => {
      mockReq.headers = {};
      mockReq.body = {};

      await wordpressController.verifyConnection(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'API key is required in X-API-Key header or request body'
      });
    });

    it('should verify connection using header', async () => {
      mockReq.headers = { 'x-api-key': 'api_test123' };
      const mockSite = {
        site_name: 'Test Site',
        max_links: 100,
        used_links: 10,
        max_articles: 50,
        used_articles: 5
      };
      wordpressService.getSiteByApiKey.mockResolvedValue(mockSite);

      await wordpressController.verifyConnection(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'API key is valid',
        site_name: 'Test Site',
        available_links: 90,
        available_articles: 45,
        max_links: 100,
        used_links: 10,
        max_articles: 50,
        used_articles: 5
      });
    });

    it('should verify connection using body (backward compatibility)', async () => {
      mockReq.body = { api_key: 'api_test456' };
      wordpressService.getSiteByApiKey.mockResolvedValue({
        site_name: 'Site',
        max_links: 10,
        used_links: 0,
        max_articles: 5,
        used_articles: 0
      });

      await wordpressController.verifyConnection(mockReq, mockRes);

      expect(wordpressService.getSiteByApiKey).toHaveBeenCalledWith('api_test456');
    });

    it('should return invalid API key response', async () => {
      mockReq.headers = { 'x-api-key': 'invalid_key' };
      wordpressService.getSiteByApiKey.mockResolvedValue(null);

      await wordpressController.verifyConnection(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid API key'
      });
    });

    it('should return 500 on service error', async () => {
      mockReq.headers = { 'x-api-key': 'api_test123' };
      wordpressService.getSiteByApiKey.mockRejectedValue(new Error('Database error'));

      await wordpressController.verifyConnection(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('handleContent', () => {
    it('should return success response', async () => {
      await wordpressController.handleContent(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'WordPress content endpoint available',
          timestamp: expect.any(String)
        })
      );
    });
  });
});
