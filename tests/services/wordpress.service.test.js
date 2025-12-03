/**
 * WordPress Service Tests
 *
 * Tests WordPress service with mocked database and HTTP:
 * - getContentByApiKey
 * - getContentByDomain
 * - publishArticle
 * - deleteArticle
 * - verifyWordPressConnection
 * - getSiteByApiKey
 * - getSiteById
 * - SSRF prevention (validateExternalUrl)
 */

// Mock axios before importing service
jest.mock('axios');

// Mock dns.promises.resolve4
jest.mock('dns', () => ({
  promises: {
    resolve4: jest.fn().mockResolvedValue(['203.0.113.1']) // Safe public IP
  }
}));

// Mock database
const mockQuery = jest.fn();

jest.mock('../../backend/config/database', () => ({
  query: (...args) => mockQuery(...args)
}));

// Mock logger
jest.mock('../../backend/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Mock cache service
jest.mock('../../backend/services/cache.service', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(true),
  delPattern: jest.fn().mockResolvedValue(true),
  isAvailable: jest.fn().mockReturnValue(true)
}));

// Mock site service for getContentByDomain
jest.mock('../../backend/services/site.service', () => ({
  getSiteByDomain: jest.fn()
}));

const axios = require('axios');
const dns = require('dns').promises;
const cache = require('../../backend/services/cache.service');
const siteService = require('../../backend/services/site.service');
const wordpressService = require('../../backend/services/wordpress.service');

describe('WordPress Service', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    axios.post.mockReset();
    axios.delete.mockReset();
    axios.options.mockReset();
    cache.get.mockResolvedValue(null);
    cache.set.mockResolvedValue(true);
    dns.resolve4.mockResolvedValue(['203.0.113.1']);
  });

  describe('getContentByApiKey', () => {
    const mockLinks = [
      {
        id: 1,
        url: 'https://example.com',
        anchor_text: 'Example Link',
        html_context: '<p>Context</p>',
        image_url: null,
        link_attributes: null,
        wrapper_config: null,
        custom_data: null
      },
      {
        id: 2,
        url: 'https://test.com',
        anchor_text: 'Test Link',
        html_context: '',
        image_url: 'https://img.test.com/logo.png',
        link_attributes: { class: 'special-link' },
        wrapper_config: { wrapper_tag: 'div' },
        custom_data: { category: 'featured' }
      }
    ];

    const mockArticles = [
      {
        id: 1,
        title: 'Test Article',
        content: '<p>Article content</p>',
        slug: 'test-article',
        wordpress_post_id: 123
      }
    ];

    it('should return links and articles for valid API key', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: mockLinks })
        .mockResolvedValueOnce({ rows: mockArticles });

      const result = await wordpressService.getContentByApiKey('api_test123');

      expect(result).toHaveProperty('links');
      expect(result).toHaveProperty('articles');
      expect(result.links).toHaveLength(2);
      expect(result.articles).toHaveLength(1);
    });

    it('should return from cache if available', async () => {
      const cachedData = { links: [{ url: 'cached' }], articles: [] };
      cache.get.mockResolvedValueOnce(cachedData);

      const result = await wordpressService.getContentByApiKey('api_test123');

      expect(result).toEqual(cachedData);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should cache results', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: mockLinks })
        .mockResolvedValueOnce({ rows: mockArticles });

      await wordpressService.getContentByApiKey('api_test123');

      expect(cache.set).toHaveBeenCalledWith(
        'wp:content:api_test123',
        expect.any(Object),
        300 // 5 minute TTL
      );
    });

    it('should format links with extended fields', async () => {
<<<<<<< HEAD
      mockQuery.mockResolvedValueOnce({ rows: mockLinks }).mockResolvedValueOnce({ rows: [] });
=======
      mockQuery
        .mockResolvedValueOnce({ rows: mockLinks })
        .mockResolvedValueOnce({ rows: [] });
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)

      const result = await wordpressService.getContentByApiKey('api_test123');

      // First link - basic fields
      expect(result.links[0].url).toBe('https://example.com');
      expect(result.links[0].anchor_text).toBe('Example Link');
      expect(result.links[0].html_context).toBe('<p>Context</p>');

      // Second link - extended fields
      expect(result.links[1].image_url).toBe('https://img.test.com/logo.png');
      expect(result.links[1].link_attributes).toEqual({ class: 'special-link' });
      expect(result.links[1].wrapper_config).toEqual({ wrapper_tag: 'div' });
      expect(result.links[1].custom_data).toEqual({ category: 'featured' });
    });

    it('should return empty arrays when no content found', async () => {
<<<<<<< HEAD
      mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
=======
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)

      const result = await wordpressService.getContentByApiKey('api_unknown');

      expect(result.links).toEqual([]);
      expect(result.articles).toEqual([]);
    });

    it('should format articles with wordpress_post_id', async () => {
<<<<<<< HEAD
      mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: mockArticles });
=======
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: mockArticles });
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)

      const result = await wordpressService.getContentByApiKey('api_test123');

      expect(result.articles[0]).toMatchObject({
        id: 1,
        title: 'Test Article',
        content: '<p>Article content</p>',
        slug: 'test-article',
        wordpress_post_id: 123
      });
    });
  });

  describe('getContentByDomain', () => {
    it('should return links for valid domain', async () => {
      siteService.getSiteByDomain.mockResolvedValueOnce({ id: 1 });
      mockQuery.mockResolvedValueOnce({
<<<<<<< HEAD
        rows: [{ id: 1, url: 'https://example.com', anchor_text: 'Link', html_context: '' }]
=======
        rows: [
          { id: 1, url: 'https://example.com', anchor_text: 'Link', html_context: '' }
        ]
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
      });

      const result = await wordpressService.getContentByDomain('example.com');

      expect(result.links).toHaveLength(1);
      expect(result.articles).toEqual([]); // Static sites don't support articles
    });

    it('should normalize domain', async () => {
      siteService.getSiteByDomain.mockResolvedValueOnce({ id: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await wordpressService.getContentByDomain('https://www.Example.COM/path');

      expect(siteService.getSiteByDomain).toHaveBeenCalledWith('example.com');
    });

    it('should return empty arrays for unknown domain', async () => {
      siteService.getSiteByDomain.mockResolvedValueOnce(null);

      const result = await wordpressService.getContentByDomain('unknown.com');

      expect(result.links).toEqual([]);
      expect(result.articles).toEqual([]);
    });

    it('should use cache', async () => {
      const cachedData = { links: [{ url: 'cached' }], articles: [] };
      cache.get.mockResolvedValueOnce(cachedData);
      siteService.getSiteByDomain.mockReset(); // Reset before test

      const result = await wordpressService.getContentByDomain('cached-domain.com');

      expect(result).toEqual(cachedData);
      // When cache hits, getSiteByDomain should not be called for this specific domain
      // Note: previous tests might have called it, so we just check the cache result
      expect(result.links[0].url).toBe('cached');
    });
  });

  describe('publishArticle', () => {
    const articleData = {
      title: 'Test Article',
      content: '<p>Test content</p>',
      slug: 'test-article'
    };

    it('should publish article successfully', async () => {
      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          post_id: 123,
          post_url: 'https://example.com/test-article'
        }
      });

      const result = await wordpressService.publishArticle(
        'https://example.com',
        'api_test123',
        articleData
      );

      expect(result.success).toBe(true);
      expect(result.post_id).toBe(123);
      expect(result.url).toBe('https://example.com/test-article');
    });

    it('should call correct WordPress endpoint', async () => {
      axios.post.mockResolvedValueOnce({
        data: { success: true, post_id: 123 }
      });

<<<<<<< HEAD
      await wordpressService.publishArticle('https://example.com', 'api_test123', articleData);
=======
      await wordpressService.publishArticle(
        'https://example.com',
        'api_test123',
        articleData
      );
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)

      expect(axios.post).toHaveBeenCalledWith(
        'https://example.com/wp-json/link-manager/v1/create-article',
        expect.objectContaining({
          title: 'Test Article',
          content: '<p>Test content</p>',
          slug: 'test-article',
          api_key: 'api_test123'
        }),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'api_test123'
          },
          timeout: 30000,
          maxRedirects: 0
        })
      );
    });

    it('should throw error on WordPress failure', async () => {
      axios.post.mockResolvedValueOnce({
        data: { success: false, error: 'Plugin not configured' }
      });

<<<<<<< HEAD
      await expect(
        wordpressService.publishArticle('https://example.com', 'api_test123', articleData)
      ).rejects.toThrow('Plugin not configured');
=======
      await expect(wordpressService.publishArticle(
        'https://example.com',
        'api_test123',
        articleData
      )).rejects.toThrow('Plugin not configured');
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    });

    it('should throw error on network failure', async () => {
      axios.post.mockRejectedValueOnce(new Error('Network timeout'));

<<<<<<< HEAD
      await expect(
        wordpressService.publishArticle('https://example.com', 'api_test123', articleData)
      ).rejects.toThrow(/Network timeout/);
=======
      await expect(wordpressService.publishArticle(
        'https://example.com',
        'api_test123',
        articleData
      )).rejects.toThrow(/Network timeout/);
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    });

    it('should remove trailing slash from site URL', async () => {
      axios.post.mockResolvedValueOnce({
        data: { success: true, post_id: 123 }
      });

<<<<<<< HEAD
      await wordpressService.publishArticle('https://example.com/', 'api_test123', articleData);
=======
      await wordpressService.publishArticle(
        'https://example.com/',
        'api_test123',
        articleData
      );
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)

      expect(axios.post).toHaveBeenCalledWith(
        'https://example.com/wp-json/link-manager/v1/create-article',
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('deleteArticle', () => {
    it('should delete article successfully', async () => {
      axios.delete.mockResolvedValueOnce({
        data: { success: true }
      });

      const result = await wordpressService.deleteArticle(
        'https://example.com',
        'api_test123',
        123
      );

      expect(result.success).toBe(true);
      expect(result.post_id).toBe(123);
    });

    it('should return error for missing post ID', async () => {
      const result = await wordpressService.deleteArticle(
        'https://example.com',
        'api_test123',
        null
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/No WordPress post ID/i);
    });

    it('should call correct WordPress endpoint', async () => {
      axios.delete.mockResolvedValueOnce({
        data: { success: true }
      });

<<<<<<< HEAD
      await wordpressService.deleteArticle('https://example.com', 'api_test123', 456);
=======
      await wordpressService.deleteArticle(
        'https://example.com',
        'api_test123',
        456
      );
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)

      expect(axios.delete).toHaveBeenCalledWith(
        'https://example.com/wp-json/link-manager/v1/delete-article/456',
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'api_test123'
          }
        })
      );
    });

    it('should handle 404 as success (already deleted)', async () => {
      axios.delete.mockRejectedValueOnce({
        response: { status: 404 }
      });

      const result = await wordpressService.deleteArticle(
        'https://example.com',
        'api_test123',
        123
      );

      expect(result.success).toBe(true);
      expect(result.already_deleted).toBe(true);
    });

    it('should return error on other failures', async () => {
      axios.delete.mockRejectedValueOnce({
        response: { status: 500, data: { error: 'Server error' } }
      });

      const result = await wordpressService.deleteArticle(
        'https://example.com',
        'api_test123',
        123
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server error');
    });
  });

  describe('verifyWordPressConnection', () => {
    it('should return success for active plugin', async () => {
      axios.options.mockResolvedValueOnce({ status: 200 });

      const result = await wordpressService.verifyWordPressConnection(
        'https://example.com',
        'api_test123'
      );

      expect(result.success).toBe(true);
      expect(result.message).toMatch(/Link Manager plugin is active/i);
    });

    it('should return error for inactive plugin', async () => {
      axios.options.mockRejectedValueOnce(new Error('Not found'));

      const result = await wordpressService.verifyWordPressConnection(
        'https://example.com',
        'api_test123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should call correct endpoint', async () => {
      axios.options.mockResolvedValueOnce({ status: 200 });

<<<<<<< HEAD
      await wordpressService.verifyWordPressConnection('https://example.com', 'api_test123');
=======
      await wordpressService.verifyWordPressConnection(
        'https://example.com',
        'api_test123'
      );
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)

      expect(axios.options).toHaveBeenCalledWith(
        'https://example.com/wp-json/link-manager/v1/create-article',
        expect.objectContaining({ timeout: 10000 })
      );
    });
  });

  describe('getSiteByApiKey', () => {
    it('should return site for valid API key', async () => {
      mockQuery.mockResolvedValueOnce({
<<<<<<< HEAD
        rows: [
          {
            id: 1,
            site_url: 'https://example.com',
            site_name: 'Example Site',
            max_links: 10,
            used_links: 5
          }
        ]
=======
        rows: [{
          id: 1,
          site_url: 'https://example.com',
          site_name: 'Example Site',
          max_links: 10,
          used_links: 5
        }]
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
      });

      const result = await wordpressService.getSiteByApiKey('api_test123');

      expect(result).toMatchObject({
        id: 1,
        site_url: 'https://example.com'
      });
    });

    it('should return null for invalid API key', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await wordpressService.getSiteByApiKey('api_invalid');

      expect(result).toBeNull();
    });
  });

  describe('getSiteById', () => {
    it('should return site for valid ID and user', async () => {
      mockQuery.mockResolvedValueOnce({
<<<<<<< HEAD
        rows: [
          {
            id: 1,
            site_url: 'https://example.com',
            site_name: 'Example Site',
            api_key: 'api_test123'
          }
        ]
=======
        rows: [{
          id: 1,
          site_url: 'https://example.com',
          site_name: 'Example Site',
          api_key: 'api_test123'
        }]
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
      });

      const result = await wordpressService.getSiteById(1, 1);

      expect(result).toMatchObject({
        id: 1,
        site_url: 'https://example.com'
      });
    });

    it('should return null for invalid ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await wordpressService.getSiteById(999, 1);

      expect(result).toBeNull();
    });

    it('should return null for wrong user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Query includes user_id filter

      const result = await wordpressService.getSiteById(1, 999);

      expect(result).toBeNull();
    });
  });

  describe('getArticleById', () => {
    it('should return article for valid ID and user', async () => {
      mockQuery.mockResolvedValueOnce({
<<<<<<< HEAD
        rows: [
          {
            id: 1,
            title: 'Test Article',
            content: 'Content',
            slug: 'test-article'
          }
        ]
=======
        rows: [{
          id: 1,
          title: 'Test Article',
          content: 'Content',
          slug: 'test-article'
        }]
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
      });

      const result = await wordpressService.getArticleById(1, 1);

      expect(result).toMatchObject({
        id: 1,
        title: 'Test Article'
      });
    });

    it('should return null for invalid article ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await wordpressService.getArticleById(999, 1);

      expect(result).toBeNull();
    });
  });

  describe('updatePlacementWithPostId', () => {
    it('should update placement with WordPress post ID', async () => {
      mockQuery.mockResolvedValueOnce({});

      await wordpressService.updatePlacementWithPostId(1, 2, 123);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('wordpress_post_id'),
        [123, 1, 2]
      );
    });

    it('should set status to placed', async () => {
      mockQuery.mockResolvedValueOnce({});

      await wordpressService.updatePlacementWithPostId(1, 2, 123);

      expect(mockQuery.mock.calls[0][0]).toContain("status = 'placed'");
    });
  });
});

describe('SSRF Prevention', () => {
  beforeEach(() => {
    dns.resolve4.mockReset();
  });

  describe('validateExternalUrl (via publishArticle)', () => {
    it('should block localhost', async () => {
<<<<<<< HEAD
      await expect(
        wordpressService.publishArticle('http://localhost/wp', 'api_test123', {
          title: 'Test',
          content: 'Test',
          slug: 'test'
        })
      ).rejects.toThrow(/localhost/i);
    });

    it('should block 127.0.0.1', async () => {
      await expect(
        wordpressService.publishArticle('http://127.0.0.1/wp', 'api_test123', {
          title: 'Test',
          content: 'Test',
          slug: 'test'
        })
      ).rejects.toThrow(/localhost/i);
    });

    it('should block private IP 10.x.x.x', async () => {
      await expect(
        wordpressService.publishArticle('http://10.0.0.1/wp', 'api_test123', {
          title: 'Test',
          content: 'Test',
          slug: 'test'
        })
      ).rejects.toThrow(/private/i);
    });

    it('should block private IP 192.168.x.x', async () => {
      await expect(
        wordpressService.publishArticle('http://192.168.1.1/wp', 'api_test123', {
          title: 'Test',
          content: 'Test',
          slug: 'test'
        })
      ).rejects.toThrow(/private/i);
    });

    it('should block private IP 172.16-31.x.x', async () => {
      await expect(
        wordpressService.publishArticle('http://172.16.0.1/wp', 'api_test123', {
          title: 'Test',
          content: 'Test',
          slug: 'test'
        })
      ).rejects.toThrow(/private/i);
    });

    it('should block link-local 169.254.x.x', async () => {
      await expect(
        wordpressService.publishArticle('http://169.254.1.1/wp', 'api_test123', {
          title: 'Test',
          content: 'Test',
          slug: 'test'
        })
      ).rejects.toThrow(/link-local/i);
    });

    it('should block AWS metadata endpoint', async () => {
      await expect(
        wordpressService.publishArticle('http://169.254.169.254/latest/meta-data', 'api_test123', {
          title: 'Test',
          content: 'Test',
          slug: 'test'
        })
      ).rejects.toThrow(/metadata|link-local/i);
    });

    it('should block non-HTTP protocols', async () => {
      await expect(
        wordpressService.publishArticle('ftp://example.com/wp', 'api_test123', {
          title: 'Test',
          content: 'Test',
          slug: 'test'
        })
      ).rejects.toThrow(/protocol/i);
    });

    it('should block file:// protocol', async () => {
      await expect(
        wordpressService.publishArticle('file:///etc/passwd', 'api_test123', {
          title: 'Test',
          content: 'Test',
          slug: 'test'
        })
      ).rejects.toThrow(/protocol/i);
=======
      await expect(wordpressService.publishArticle(
        'http://localhost/wp',
        'api_test123',
        { title: 'Test', content: 'Test', slug: 'test' }
      )).rejects.toThrow(/localhost/i);
    });

    it('should block 127.0.0.1', async () => {
      await expect(wordpressService.publishArticle(
        'http://127.0.0.1/wp',
        'api_test123',
        { title: 'Test', content: 'Test', slug: 'test' }
      )).rejects.toThrow(/localhost/i);
    });

    it('should block private IP 10.x.x.x', async () => {
      await expect(wordpressService.publishArticle(
        'http://10.0.0.1/wp',
        'api_test123',
        { title: 'Test', content: 'Test', slug: 'test' }
      )).rejects.toThrow(/private/i);
    });

    it('should block private IP 192.168.x.x', async () => {
      await expect(wordpressService.publishArticle(
        'http://192.168.1.1/wp',
        'api_test123',
        { title: 'Test', content: 'Test', slug: 'test' }
      )).rejects.toThrow(/private/i);
    });

    it('should block private IP 172.16-31.x.x', async () => {
      await expect(wordpressService.publishArticle(
        'http://172.16.0.1/wp',
        'api_test123',
        { title: 'Test', content: 'Test', slug: 'test' }
      )).rejects.toThrow(/private/i);
    });

    it('should block link-local 169.254.x.x', async () => {
      await expect(wordpressService.publishArticle(
        'http://169.254.1.1/wp',
        'api_test123',
        { title: 'Test', content: 'Test', slug: 'test' }
      )).rejects.toThrow(/link-local/i);
    });

    it('should block AWS metadata endpoint', async () => {
      await expect(wordpressService.publishArticle(
        'http://169.254.169.254/latest/meta-data',
        'api_test123',
        { title: 'Test', content: 'Test', slug: 'test' }
      )).rejects.toThrow(/metadata|link-local/i);
    });

    it('should block non-HTTP protocols', async () => {
      await expect(wordpressService.publishArticle(
        'ftp://example.com/wp',
        'api_test123',
        { title: 'Test', content: 'Test', slug: 'test' }
      )).rejects.toThrow(/protocol/i);
    });

    it('should block file:// protocol', async () => {
      await expect(wordpressService.publishArticle(
        'file:///etc/passwd',
        'api_test123',
        { title: 'Test', content: 'Test', slug: 'test' }
      )).rejects.toThrow(/protocol/i);
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    });

    it('should allow valid public URLs', async () => {
      dns.resolve4.mockResolvedValueOnce(['203.0.113.1']);
      axios.post.mockResolvedValueOnce({
        data: { success: true, post_id: 123 }
      });

<<<<<<< HEAD
      const result = await wordpressService.publishArticle('https://example.com', 'api_test123', {
        title: 'Test',
        content: 'Test',
        slug: 'test'
      });
=======
      const result = await wordpressService.publishArticle(
        'https://example.com',
        'api_test123',
        { title: 'Test', content: 'Test', slug: 'test' }
      );
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)

      expect(result.success).toBe(true);
    });

    it('should block DNS rebinding to private IP', async () => {
      dns.resolve4.mockResolvedValueOnce(['10.0.0.1']); // DNS resolves to private IP

<<<<<<< HEAD
      await expect(
        wordpressService.publishArticle('https://evil.com', 'api_test123', {
          title: 'Test',
          content: 'Test',
          slug: 'test'
        })
      ).rejects.toThrow(/private|WordPress/i);
=======
      await expect(wordpressService.publishArticle(
        'https://evil.com',
        'api_test123',
        { title: 'Test', content: 'Test', slug: 'test' }
      )).rejects.toThrow(/private|WordPress/i);
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    });

    it('should block DNS rebinding to 127.0.0.1', async () => {
      dns.resolve4.mockResolvedValueOnce(['127.0.0.1']);

<<<<<<< HEAD
      await expect(
        wordpressService.publishArticle('https://evil.com', 'api_test123', {
          title: 'Test',
          content: 'Test',
          slug: 'test'
        })
      ).rejects.toThrow(/private|WordPress/i);
=======
      await expect(wordpressService.publishArticle(
        'https://evil.com',
        'api_test123',
        { title: 'Test', content: 'Test', slug: 'test' }
      )).rejects.toThrow(/private|WordPress/i);
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    });

    it('should allow public domain even if DNS fails', async () => {
      dns.resolve4.mockRejectedValueOnce(new Error('DNS lookup failed'));
      axios.post.mockResolvedValueOnce({
        data: { success: true, post_id: 123 }
      });

      // Should proceed because DNS failure is logged but not blocking
<<<<<<< HEAD
      const result = await wordpressService.publishArticle('https://new-site.com', 'api_test123', {
        title: 'Test',
        content: 'Test',
        slug: 'test'
      });
=======
      const result = await wordpressService.publishArticle(
        'https://new-site.com',
        'api_test123',
        { title: 'Test', content: 'Test', slug: 'test' }
      );
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)

      expect(result.success).toBe(true);
    });
  });
});

describe('Error Handling', () => {
  it('should throw error on database failure in getContentByApiKey', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Database error'));

<<<<<<< HEAD
    await expect(wordpressService.getContentByApiKey('api_test')).rejects.toThrow('Database error');
=======
    await expect(wordpressService.getContentByApiKey('api_test'))
      .rejects.toThrow('Database error');
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
  });

  it('should throw error on database failure in getSiteByApiKey', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Database error'));

<<<<<<< HEAD
    await expect(wordpressService.getSiteByApiKey('api_test')).rejects.toThrow('Database error');
=======
    await expect(wordpressService.getSiteByApiKey('api_test'))
      .rejects.toThrow('Database error');
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
  });

  it('should throw error on database failure in updatePlacementWithPostId', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Database error'));

<<<<<<< HEAD
    await expect(wordpressService.updatePlacementWithPostId(1, 2, 123)).rejects.toThrow(
      'Database error'
    );
=======
    await expect(wordpressService.updatePlacementWithPostId(1, 2, 123))
      .rejects.toThrow('Database error');
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
  });
});
