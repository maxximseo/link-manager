/**
 * Site Controller Tests
 */

const siteController = require('../../backend/controllers/site.controller');

// Mock dependencies
jest.mock('../../backend/services/site.service');
jest.mock('../../backend/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

const siteService = require('../../backend/services/site.service');

describe('Site Controller', () => {
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

  describe('getSites', () => {
    it('should return user sites', async () => {
      mockReq.query = { page: '1', limit: '20' };
      const mockResult = {
        data: [{ id: 1, site_url: 'https://example.com' }],
        pagination: { page: 1, limit: 20, total: 1 }
      };
      siteService.getUserSites.mockResolvedValue(mockResult);

      await siteController.getSites(mockReq, mockRes);

      expect(siteService.getUserSites).toHaveBeenCalledWith(1, 1, 20, false);
      expect(mockRes.json).toHaveBeenCalledWith(mockResult);
    });

    it('should recalculate when param is true', async () => {
      mockReq.query = { recalculate: 'true' };
      siteService.getUserSites.mockResolvedValue({ data: [] });

      await siteController.getSites(mockReq, mockRes);

      expect(siteService.getUserSites).toHaveBeenCalledWith(1, 1, 20, true);
    });

    it('should return 400 on validation error', async () => {
      mockReq.query = { page: '-1' };
      siteService.getUserSites.mockRejectedValue(new Error('Page number must be positive'));

      await siteController.getSites(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 on service error', async () => {
      mockReq.query = {};
      siteService.getUserSites.mockRejectedValue(new Error('Database error'));

      await siteController.getSites(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getSite', () => {
    it('should return site by id', async () => {
      mockReq.params = { id: '1' };
      const mockSite = { id: 1, site_url: 'https://example.com' };
      siteService.getSiteById.mockResolvedValue(mockSite);

      await siteController.getSite(mockReq, mockRes);

      expect(siteService.getSiteById).toHaveBeenCalledWith('1', 1);
      expect(mockRes.json).toHaveBeenCalledWith(mockSite);
    });

    it('should return 404 if site not found', async () => {
      mockReq.params = { id: '999' };
      siteService.getSiteById.mockResolvedValue(null);

      await siteController.getSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Site not found' });
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { id: '1' };
      siteService.getSiteById.mockRejectedValue(new Error('Database error'));

      await siteController.getSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('createSite', () => {
    it('should create site successfully', async () => {
      mockReq.body = {
        site_url: 'https://example.com',
        api_key: 'api_123',
        max_links: 100
      };
      const mockSite = { id: 1, site_url: 'https://example.com' };
      siteService.createSite.mockResolvedValue(mockSite);

      await siteController.createSite(mockReq, mockRes);

      expect(siteService.createSite).toHaveBeenCalledWith(
        expect.objectContaining({
          site_url: 'https://example.com',
          api_key: 'api_123',
          userId: 1
        })
      );
      expect(mockRes.json).toHaveBeenCalledWith(mockSite);
    });

    it('should return 400 if site_url is missing', async () => {
      mockReq.body = { api_key: 'api_123' };

      await siteController.createSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Site URL is required' });
    });

    it('should return 400 if URL is not HTTP/HTTPS', async () => {
      mockReq.body = { site_url: 'ftp://example.com' };

      await siteController.createSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Site URL must be a valid HTTP/HTTPS URL'
      });
    });

    it('should block localhost URLs (SSRF protection)', async () => {
      mockReq.body = { site_url: 'http://localhost:3000' };

      await siteController.createSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal URLs are not allowed' });
    });

    it('should block 127.0.0.1 (SSRF protection)', async () => {
      mockReq.body = { site_url: 'http://127.0.0.1' };

      await siteController.createSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal URLs are not allowed' });
    });

    it('should block private IP 10.x.x.x (SSRF protection)', async () => {
      mockReq.body = { site_url: 'http://10.0.0.1' };

      await siteController.createSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Private IP addresses are not allowed' });
    });

    it('should block private IP 172.16.x.x (SSRF protection)', async () => {
      mockReq.body = { site_url: 'http://172.16.0.1' };

      await siteController.createSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Private IP addresses are not allowed' });
    });

    it('should block private IP 192.168.x.x (SSRF protection)', async () => {
      mockReq.body = { site_url: 'http://192.168.1.1' };

      await siteController.createSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Private IP addresses are not allowed' });
    });

    it('should block AWS metadata IP (SSRF protection)', async () => {
      mockReq.body = { site_url: 'http://169.254.169.254' };

      await siteController.createSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Private IP addresses are not allowed' });
    });

    it('should return 400 for invalid site_type', async () => {
      mockReq.body = { site_url: 'https://example.com', site_type: 'invalid' };

      await siteController.createSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Site type must be wordpress or static_php'
      });
    });

    it('should return 400 if API key is too long', async () => {
      mockReq.body = { site_url: 'https://example.com', api_key: 'a'.repeat(101) };

      await siteController.createSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'API key must be less than 100 characters'
      });
    });

    it('should return 400 for negative max_links', async () => {
      mockReq.body = { site_url: 'https://example.com', max_links: -1 };

      await siteController.createSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Max links must be a positive number'
      });
    });

    it('should return 400 for negative max_articles', async () => {
      mockReq.body = { site_url: 'https://example.com', max_articles: -1 };

      await siteController.createSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Max articles must be a positive number'
      });
    });

    it('should return 400 for invalid allow_articles type', async () => {
      mockReq.body = { site_url: 'https://example.com', allow_articles: 'yes' };

      await siteController.createSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Allow articles must be a boolean value'
      });
    });

    it('should force is_public to false for non-admin users', async () => {
      mockReq.body = { site_url: 'https://example.com', is_public: true };
      siteService.createSite.mockResolvedValue({ id: 1 });

      await siteController.createSite(mockReq, mockRes);

      expect(siteService.createSite).toHaveBeenCalledWith(
        expect.objectContaining({ is_public: false })
      );
    });

    it('should allow admin to set is_public to true', async () => {
      mockReq.user = { id: 1, role: 'admin' };
      mockReq.body = { site_url: 'https://example.com', is_public: true };
      siteService.createSite.mockResolvedValue({ id: 1 });

      await siteController.createSite(mockReq, mockRes);

      expect(siteService.createSite).toHaveBeenCalledWith(
        expect.objectContaining({ is_public: true })
      );
    });

    it('should return 500 on service error', async () => {
      mockReq.body = { site_url: 'https://example.com' };
      siteService.createSite.mockRejectedValue(new Error('Database error'));

      await siteController.createSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updateSite', () => {
    it('should update site successfully', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { site_name: 'Updated Site' };
      const mockSite = { id: 1, site_name: 'Updated Site' };
      siteService.updateSite.mockResolvedValue(mockSite);

      await siteController.updateSite(mockReq, mockRes);

      expect(siteService.updateSite).toHaveBeenCalledWith('1', 1, expect.any(Object));
      expect(mockRes.json).toHaveBeenCalledWith(mockSite);
    });

    it('should return 400 for invalid URL format', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { site_url: 'invalid-url' };

      await siteController.updateSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Site URL must be a valid HTTP/HTTPS URL'
      });
    });

    it('should return 400 for invalid site_type', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { site_type: 'invalid' };

      await siteController.updateSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Site type must be wordpress or static_php'
      });
    });

    it('should ignore is_public for non-admin users', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { site_name: 'Test', is_public: true };
      siteService.updateSite.mockResolvedValue({ id: 1 });

      await siteController.updateSite(mockReq, mockRes);

      expect(siteService.updateSite).toHaveBeenCalledWith(
        '1',
        1,
        expect.objectContaining({ is_public: undefined })
      );
    });

    it('should allow admin to update is_public', async () => {
      mockReq.user = { id: 1, role: 'admin' };
      mockReq.params = { id: '1' };
      mockReq.body = { is_public: true };
      siteService.updateSite.mockResolvedValue({ id: 1 });

      await siteController.updateSite(mockReq, mockRes);

      expect(siteService.updateSite).toHaveBeenCalledWith(
        '1',
        1,
        expect.objectContaining({ is_public: true })
      );
    });
  });

  describe('deleteSite', () => {
    it('should delete site successfully with refund details', async () => {
      mockReq.params = { id: '1' };
      siteService.deleteSite.mockResolvedValue({
        deleted: true,
        placementsCount: 2,
        refundedCount: 1,
        totalRefunded: 10.0,
        tierChanged: false,
        newTier: 'Bronze',
        refundDetails: []
      });

      await siteController.deleteSite(mockReq, mockRes);

      expect(siteService.deleteSite).toHaveBeenCalledWith('1', 1);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Site deleted successfully'
        })
      );
    });

    it('should return 404 if site not found', async () => {
      mockReq.params = { id: '999' };
      siteService.deleteSite.mockResolvedValue({ deleted: false, error: 'Site not found' });

      await siteController.deleteSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Site not found' });
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { id: '1' };
      siteService.deleteSite.mockRejectedValue(new Error('Database error'));

      await siteController.deleteSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('recalculateStats', () => {
    it('should recalculate stats successfully', async () => {
      siteService.recalculateSiteStats.mockResolvedValue(undefined);

      await siteController.recalculateStats(mockReq, mockRes);

      expect(siteService.recalculateSiteStats).toHaveBeenCalledWith(1);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Site statistics recalculated successfully' });
    });

    it('should return 500 on service error', async () => {
      siteService.recalculateSiteStats.mockRejectedValue(new Error('Database error'));

      await siteController.recalculateStats(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to recalculate statistics' });
    });
  });

  describe('getMarketplaceSites', () => {
    it('should return marketplace sites', async () => {
      const mockSites = [
        { id: 1, site_url: 'https://public1.com', is_public: true },
        { id: 2, site_url: 'https://owned.com', is_public: false }
      ];
      siteService.getMarketplaceSites.mockResolvedValue(mockSites);

      await siteController.getMarketplaceSites(mockReq, mockRes);

      expect(siteService.getMarketplaceSites).toHaveBeenCalledWith(1);
      expect(mockRes.json).toHaveBeenCalledWith({ data: mockSites });
    });

    it('should return 500 on service error', async () => {
      siteService.getMarketplaceSites.mockRejectedValue(new Error('Database error'));

      await siteController.getMarketplaceSites(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to get marketplace sites' });
    });
  });

  describe('generateToken', () => {
    it('should generate token successfully', async () => {
      mockReq.body = { label: 'Test Token', max_uses: 10 };
      const mockToken = {
        id: 1,
        token: 'reg_abc123',
        label: 'Test Token',
        max_uses: 10,
        expires_at: null
      };
      siteService.generateRegistrationToken.mockResolvedValue(mockToken);

      await siteController.generateToken(mockReq, mockRes);

      expect(siteService.generateRegistrationToken).toHaveBeenCalledWith(1, {
        label: 'Test Token',
        max_uses: 10,
        expires_at: undefined
      });
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        token: 'reg_abc123',
        id: 1
      }));
    });

    it('should use default max_uses when not provided', async () => {
      mockReq.body = { label: 'Test' };
      siteService.generateRegistrationToken.mockResolvedValue({
        id: 1,
        token: 'reg_xyz',
        label: 'Test',
        max_uses: 0,
        expires_at: null
      });

      await siteController.generateToken(mockReq, mockRes);

      expect(siteService.generateRegistrationToken).toHaveBeenCalledWith(1, {
        label: 'Test',
        max_uses: 0,
        expires_at: undefined
      });
    });

    it('should return 500 on service error', async () => {
      mockReq.body = { label: 'Test' };
      siteService.generateRegistrationToken.mockRejectedValue(new Error('Database error'));

      await siteController.generateToken(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to generate registration token' });
    });
  });

  describe('registerFromWordPress', () => {
    it('should register site successfully', async () => {
      mockReq.body = {
        registration_token: 'reg_valid123',
        site_url: 'https://newsite.com',
        api_key: 'api_newkey'
      };
      siteService.validateRegistrationToken.mockResolvedValue({ user_id: 5 });
      siteService.getSiteByUrlForUser.mockResolvedValue(null);
      siteService.createSite.mockResolvedValue({ id: 100 });
      siteService.incrementTokenUsage.mockResolvedValue(undefined);

      await siteController.registerFromWordPress(mockReq, mockRes);

      expect(siteService.validateRegistrationToken).toHaveBeenCalledWith('reg_valid123');
      expect(siteService.getSiteByUrlForUser).toHaveBeenCalledWith('https://newsite.com', 5);
      expect(siteService.createSite).toHaveBeenCalledWith({
        site_url: 'https://newsite.com',
        api_key: 'api_newkey',
        site_type: 'wordpress',
        max_links: 10,
        max_articles: 30,
        userId: 5
      });
      expect(siteService.incrementTokenUsage).toHaveBeenCalledWith('reg_valid123');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        site_id: 100,
        message: 'Site registered successfully'
      });
    });

    it('should return 400 if registration_token is missing', async () => {
      mockReq.body = { site_url: 'https://test.com', api_key: 'api_key' };

      await siteController.registerFromWordPress(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Registration token is required' });
    });

    it('should return 400 if site_url is missing', async () => {
      mockReq.body = { registration_token: 'reg_abc', api_key: 'api_key' };

      await siteController.registerFromWordPress(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Site URL is required' });
    });

    it('should return 400 if api_key is missing', async () => {
      mockReq.body = { registration_token: 'reg_abc', site_url: 'https://test.com' };

      await siteController.registerFromWordPress(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'API key is required' });
    });

    it('should return 401 for invalid token', async () => {
      mockReq.body = {
        registration_token: 'reg_invalid',
        site_url: 'https://test.com',
        api_key: 'api_key'
      };
      siteService.validateRegistrationToken.mockResolvedValue(null);

      await siteController.registerFromWordPress(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid, expired, or exhausted registration token'
      });
    });

    it('should return 409 if site already registered', async () => {
      mockReq.body = {
        registration_token: 'reg_valid',
        site_url: 'https://existing.com',
        api_key: 'api_key'
      };
      siteService.validateRegistrationToken.mockResolvedValue({ user_id: 5 });
      siteService.getSiteByUrlForUser.mockResolvedValue({ id: 50 });

      await siteController.registerFromWordPress(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Site already registered',
        site_id: 50
      });
    });

    it('should return 500 on service error', async () => {
      mockReq.body = {
        registration_token: 'reg_valid',
        site_url: 'https://test.com',
        api_key: 'api_key'
      };
      siteService.validateRegistrationToken.mockRejectedValue(new Error('Database error'));

      await siteController.registerFromWordPress(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to register site' });
    });
  });

  describe('getTokens', () => {
    it('should return user tokens', async () => {
      const mockTokens = [
        { id: 1, token: 'reg_abc', label: 'Token 1' },
        { id: 2, token: 'reg_xyz', label: 'Token 2' }
      ];
      siteService.getUserTokens.mockResolvedValue(mockTokens);

      await siteController.getTokens(mockReq, mockRes);

      expect(siteService.getUserTokens).toHaveBeenCalledWith(1);
      expect(mockRes.json).toHaveBeenCalledWith({ data: mockTokens });
    });

    it('should return 500 on service error', async () => {
      siteService.getUserTokens.mockRejectedValue(new Error('Database error'));

      await siteController.getTokens(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to get tokens' });
    });
  });

  describe('deleteToken', () => {
    it('should delete token successfully', async () => {
      mockReq.params = { id: '5' };
      siteService.deleteToken.mockResolvedValue(true);

      await siteController.deleteToken(mockReq, mockRes);

      expect(siteService.deleteToken).toHaveBeenCalledWith(5, 1);
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });

    it('should return 400 for invalid token ID', async () => {
      mockReq.params = { id: 'invalid' };

      await siteController.deleteToken(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token ID' });
    });

    it('should return 404 if token not found', async () => {
      mockReq.params = { id: '999' };
      siteService.deleteToken.mockResolvedValue(false);

      await siteController.deleteToken(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Token not found' });
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { id: '1' };
      siteService.deleteToken.mockRejectedValue(new Error('Database error'));

      await siteController.deleteToken(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to delete token' });
    });
  });

  describe('updateSite - additional validations', () => {
    it('should return 400 for negative max_links', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { max_links: -5 };

      await siteController.updateSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Max links must be a positive number' });
    });

    it('should return 400 for negative max_articles', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { max_articles: -10 };

      await siteController.updateSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Max articles must be a positive number' });
    });

    it('should return 400 for invalid allow_articles type', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { allow_articles: 'yes' };

      await siteController.updateSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Allow articles must be a boolean value' });
    });

    it('should return 400 for invalid is_public type for admin', async () => {
      mockReq.user = { id: 1, role: 'admin' };
      mockReq.params = { id: '1' };
      mockReq.body = { is_public: 'yes' };

      await siteController.updateSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'is_public must be a boolean value' });
    });

    it('should return 400 for invalid available_for_purchase type', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { available_for_purchase: 'yes' };

      await siteController.updateSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'available_for_purchase must be a boolean value' });
    });

    it('should return 404 if site not found', async () => {
      mockReq.params = { id: '999' };
      mockReq.body = { site_name: 'Updated' };
      siteService.updateSite.mockResolvedValue(null);

      await siteController.updateSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Site not found' });
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { id: '1' };
      mockReq.body = { site_name: 'Updated' };
      siteService.updateSite.mockRejectedValue(new Error('Database error'));

      await siteController.updateSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to update site' });
    });
  });

  describe('createSite - additional validations', () => {
    it('should return 400 for invalid is_public type', async () => {
      mockReq.user = { id: 1, role: 'admin' };
      mockReq.body = { site_url: 'https://example.com', is_public: 'yes' };

      await siteController.createSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'is_public must be a boolean value' });
    });

    it('should return 400 for invalid available_for_purchase type', async () => {
      mockReq.body = { site_url: 'https://example.com', available_for_purchase: 'yes' };

      await siteController.createSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'available_for_purchase must be a boolean value' });
    });

    it('should return 400 for invalid URL that throws in URL constructor', async () => {
      mockReq.body = { site_url: 'http://[invalid' };

      await siteController.createSite(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid URL format' });
    });
  });
});
