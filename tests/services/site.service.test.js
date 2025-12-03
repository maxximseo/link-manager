/**
 * Site Service Tests
 *
 * Tests site service with mocked database:
 * - getUserSites
 * - createSite
 * - Site types (WordPress vs Static PHP)
 * - Registration tokens
 * - Domain normalization
 */

// Mock database
const mockQuery = jest.fn();
const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};
const mockPool = {
  connect: jest.fn().mockResolvedValue(mockClient)
};

jest.mock('../../backend/config/database', () => ({
  query: (...args) => mockQuery(...args),
  pool: mockPool
}));

// Mock logger
jest.mock('../../backend/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

const siteService = require('../../backend/services/site.service');

describe('Site Service', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClient.query.mockReset();
  });

  describe('getUserSites', () => {
    it('should return user sites with pagination', async () => {
      const mockSites = [
        {
          id: 1,
          site_url: 'https://example1.com',
          site_type: 'wordpress',
          max_links: 10,
          used_links: 5
        },
        {
          id: 2,
          site_url: 'https://example2.com',
          site_type: 'static_php',
          max_links: 20,
          used_links: 0
        }
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: mockSites }) // Sites query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }); // Count query

      const result = await siteService.getUserSites(1, 1, 10);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(result.data).toHaveLength(2);
    });

    it('should return array without pagination when page=0', async () => {
      const mockSites = [
        { id: 1, site_url: 'https://example1.com' },
        { id: 2, site_url: 'https://example2.com' }
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockSites });

      const result = await siteService.getUserSites(1, 0, 0);

      // Without pagination, returns raw array
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });

    it('should return empty array for user with no sites', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await siteService.getUserSites(1, 0, 0);

      expect(result).toEqual([]);
    });
  });

  describe('createSite', () => {
    describe('WordPress Sites', () => {
      it('should create WordPress site with API key', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              site_url: 'https://wordpress.example.com',
              site_type: 'wordpress',
              api_key: 'api_abc123',
              max_links: 10,
              max_articles: 5
            }
          ]
        });

        const result = await siteService.createSite({
          userId: 1,
          site_url: 'https://wordpress.example.com',
          site_type: 'wordpress',
          api_key: 'api_abc123',
          max_links: 10,
          max_articles: 5
        });

        expect(result).toBeDefined();
        expect(result.site_type).toBe('wordpress');
        expect(result.api_key).toBe('api_abc123');
        expect(result.max_articles).toBe(5);
      });

      it('should auto-generate API key if not provided', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              site_url: 'https://wordpress.example.com',
              site_type: 'wordpress',
              api_key: 'api_generated123',
              max_links: 10,
              max_articles: 5
            }
          ]
        });

        const result = await siteService.createSite({
          userId: 1,
          site_url: 'https://wordpress.example.com',
          site_type: 'wordpress',
          max_links: 10,
          max_articles: 5
        });

        expect(result.api_key).toBeDefined();
        expect(result.api_key.startsWith('api_')).toBe(true);
      });
    });

    describe('Static PHP Sites', () => {
      it('should create static_php site with null API key', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              site_url: 'https://static.example.com',
              site_type: 'static_php',
              api_key: null,
              max_links: 20,
              max_articles: 0
            }
          ]
        });

        const result = await siteService.createSite({
          userId: 1,
          site_url: 'https://static.example.com',
          site_type: 'static_php',
          max_links: 20
        });

        expect(result.site_type).toBe('static_php');
        expect(result.api_key).toBeNull();
        expect(result.max_articles).toBe(0); // Static sites can't have articles
      });

      it('should force max_articles to 0 for static sites', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              site_url: 'https://static.example.com',
              site_type: 'static_php',
              api_key: null,
              max_links: 20,
              max_articles: 0 // Should be 0 even if requested otherwise
            }
          ]
        });

        const result = await siteService.createSite({
          userId: 1,
          site_url: 'https://static.example.com',
          site_type: 'static_php',
          max_links: 20,
          max_articles: 10 // This should be ignored
        });

        expect(result.max_articles).toBe(0);
      });
    });

    describe('Validation', () => {
      it('should throw for missing site_url', async () => {
        await expect(
          siteService.createSite({
            userId: 1,
            site_type: 'wordpress'
          })
        ).rejects.toThrow();
      });

      it('should throw for invalid site_type', async () => {
        await expect(
          siteService.createSite({
            userId: 1,
            site_url: 'https://example.com',
            site_type: 'invalid'
          })
        ).rejects.toThrow();
      });
    });
  });

  describe('updateSite', () => {
    it('should update site properties', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            site_url: 'https://updated.example.com',
            max_links: 50
          }
        ]
      });

      const result = await siteService.updateSite(1, 1, {
        max_links: 50
      });

      expect(result).toBeDefined();
      expect(result.max_links).toBe(50);
    });

    it('should return null for non-existent site', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await siteService.updateSite(999, 1, {
        max_links: 50
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteSite', () => {
    it('should delete site and return {deleted: true}', async () => {
      // deleteSite uses pool.connect() for transaction
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, site_url: 'https://example.com' }] }) // SELECT site FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }) // SELECT placements (none)
        .mockResolvedValueOnce({}) // DELETE site
        .mockResolvedValueOnce({}); // COMMIT

      const result = await siteService.deleteSite(1, 1);

      expect(result).toHaveProperty('deleted', true);
    });

    it('should return {deleted: false} for non-existent site', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT site - empty
        .mockResolvedValueOnce({}); // ROLLBACK

      const result = await siteService.deleteSite(999, 1);

      expect(result).toHaveProperty('deleted', false);
      expect(result).toHaveProperty('error');
    });
  });

  describe('getSiteByDomain', () => {
    it('should find site by normalized domain', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            site_url: 'https://example.com',
            site_type: 'static_php'
          }
        ]
      });

      const result = await siteService.getSiteByDomain('example.com');

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
    });

    it('should normalize www prefix', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            site_url: 'https://example.com'
          }
        ]
      });

      const result = await siteService.getSiteByDomain('www.example.com');

      expect(result).toBeDefined();
    });

    it('should return null for non-existent domain', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await siteService.getSiteByDomain('nonexistent.com');

      expect(result).toBeNull();
    });
  });
});

describe('Registration Tokens', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('generateRegistrationToken', () => {
    it('should generate token with default options', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            token: 'reg_abc123',
            max_uses: 0,
            current_uses: 0,
            expires_at: null
          }
        ]
      });

      const result = await siteService.generateRegistrationToken(1, {});

      expect(result).toBeDefined();
      expect(result.token).toMatch(/^reg_/);
    });

    it('should generate token with max_uses limit', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            token: 'reg_abc123',
            max_uses: 10,
            current_uses: 0
          }
        ]
      });

      const result = await siteService.generateRegistrationToken(1, {
        max_uses: 10
      });

      expect(result.max_uses).toBe(10);
    });

    it('should generate token with expiry date', async () => {
      const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            token: 'reg_abc123',
            expires_at: expiryDate.toISOString()
          }
        ]
      });

      const result = await siteService.generateRegistrationToken(1, {
        expires_days: 7
      });

      expect(result.expires_at).toBeDefined();
    });
  });

  describe('validateRegistrationToken', () => {
    it('should validate valid token', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            token: 'reg_valid123',
            user_id: 1,
            max_uses: 10,
            current_uses: 5,
            expires_at: new Date(Date.now() + 86400000).toISOString() // Tomorrow
          }
        ]
      });

      const result = await siteService.validateRegistrationToken('reg_valid123');

      // Returns token data if valid, null if invalid
      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.token).toBe('reg_valid123');
    });

    it('should return null for non-existent token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await siteService.validateRegistrationToken('reg_invalid');

      expect(result).toBeNull();
    });

    it('should return null for expired token', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            token: 'reg_expired',
            expires_at: new Date(Date.now() - 86400000).toISOString() // Yesterday
          }
        ]
      });

      const result = await siteService.validateRegistrationToken('reg_expired');

      expect(result).toBeNull();
    });

    it('should return null for exhausted token (max_uses reached)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            token: 'reg_exhausted',
            max_uses: 5,
            current_uses: 5
          }
        ]
      });

      const result = await siteService.validateRegistrationToken('reg_exhausted');

      expect(result).toBeNull();
    });
  });

  describe('incrementTokenUsage', () => {
    it('should increment usage counter', async () => {
      // incrementTokenUsage doesn't return anything (void function)
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      // Should not throw
      await expect(siteService.incrementTokenUsage('reg_abc123')).resolves.toBeUndefined();
    });
  });

  describe('getUserTokens', () => {
    it('should return all user tokens', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, token: 'reg_token1', max_uses: 10, current_uses: 3 },
          { id: 2, token: 'reg_token2', max_uses: 0, current_uses: 50 }
        ]
      });

      const result = await siteService.getUserTokens(1);

      expect(result).toHaveLength(2);
    });
  });

  describe('deleteToken', () => {
    it('should delete token and return true', async () => {
      // deleteToken uses rowCount, not rows.length
      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 1 }]
      });

      const result = await siteService.deleteToken(1, 1);

      expect(result).toBe(true);
    });

    it('should return false for non-existent token', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const result = await siteService.deleteToken(999, 1);

      expect(result).toBe(false);
    });
  });
});

describe('Marketplace Sites', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('getMarketplaceSites', () => {
    it('should return public sites plus own sites', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, site_url: 'https://public1.com', is_public: true, user_id: 2 },
          { id: 2, site_url: 'https://mysite.com', is_public: false, user_id: 1 },
          { id: 3, site_url: 'https://public2.com', is_public: true, user_id: 3 }
        ]
      });

      const result = await siteService.getMarketplaceSites(1);

      expect(result).toHaveLength(3);
    });
  });
});

describe('Bulk Operations', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('bulkUpdateSiteParams', () => {
    it('should update multiple sites', async () => {
      // bulkUpdateSiteParams(parameter, updates) - first arg is param name
      // Each update needs domain and value
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 }) // First update
        .mockResolvedValueOnce({ rows: [{ id: 2 }], rowCount: 1 }) // Second update
        .mockResolvedValueOnce({ rows: [{ id: 3 }], rowCount: 1 }); // Third update

      const updates = [
        { domain: 'example1.com', value: 50 },
        { domain: 'example2.com', value: 60 },
        { domain: 'example3.com', value: 70 }
      ];

      const result = await siteService.bulkUpdateSiteParams('dr', updates);

      expect(result).toBeDefined();
      expect(result.total).toBe(3);
    });

    it('should throw for invalid parameter', async () => {
      await expect(siteService.bulkUpdateSiteParams('invalid_param', [])).rejects.toThrow(
        /not allowed/i
      );
    });
  });

  describe('getSitesWithZeroParam', () => {
    it('should return sites with zero DR', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, site_url: 'https://example1.com', dr: 0 },
          { id: 2, site_url: 'https://example2.com', dr: 0 }
        ]
      });

      const result = await siteService.getSitesWithZeroParam('dr');

      // Returns object with {parameter, count, sites}
      expect(result).toHaveProperty('parameter', 'dr');
      expect(result).toHaveProperty('count', 2);
      expect(result.sites).toHaveLength(2);
    });

    it('should throw for invalid parameter', async () => {
      await expect(siteService.getSitesWithZeroParam('invalid')).rejects.toThrow(/not allowed/i);
    });
  });
});

// =============================================
// Additional Coverage Tests
// =============================================

describe('Error Handling', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClient.query.mockReset();
  });

  describe('getUserSites', () => {
    it('should throw on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(siteService.getUserSites(1, 1, 10)).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should recalculate stats when recalculate=true', async () => {
      // recalculateSiteStats uses pool.connect()
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE query
        .mockResolvedValueOnce({}); // COMMIT

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Sites query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // Count query

      const result = await siteService.getUserSites(1, 1, 10, true);

      expect(result).toHaveProperty('recalculated', true);
    });
  });

  describe('getMarketplaceSites', () => {
    it('should throw on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Query failed'));

      await expect(siteService.getMarketplaceSites(1)).rejects.toThrow('Query failed');
    });
  });

  describe('createSite', () => {
    it('should throw for invalid URL format', async () => {
      await expect(
        siteService.createSite({
          userId: 1,
          site_url: 'not-a-valid-url'
        })
      ).rejects.toThrow(/Invalid/i);
    });

    it('should throw for non-http protocol', async () => {
      await expect(
        siteService.createSite({
          userId: 1,
          site_url: 'ftp://example.com'
        })
      ).rejects.toThrow(/HTTP and HTTPS/i);
    });

    it('should throw for short hostname', async () => {
      await expect(
        siteService.createSite({
          userId: 1,
          site_url: 'http://ab'
        })
      ).rejects.toThrow(/Invalid hostname/i);
    });

    it('should throw on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Insert failed'));

      await expect(
        siteService.createSite({
          userId: 1,
          site_url: 'https://example.com'
        })
      ).rejects.toThrow('Insert failed');
    });
  });

  describe('updateSite', () => {
    it('should throw for invalid URL in update', async () => {
      await expect(
        siteService.updateSite(1, 1, {
          site_url: 'not-a-valid-url'
        })
      ).rejects.toThrow(/Invalid/i);
    });

    it('should throw for invalid site_type in update', async () => {
      await expect(
        siteService.updateSite(1, 1, {
          site_type: 'invalid_type'
        })
      ).rejects.toThrow(/Invalid site_type/i);
    });

    it('should force max_articles to 0 for static_php update', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          site_type: 'static_php',
          max_articles: 0
        }]
      });

      const result = await siteService.updateSite(1, 1, {
        site_type: 'static_php'
      });

      expect(result.max_articles).toBe(0);
    });

    it('should throw on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Update failed'));

      await expect(
        siteService.updateSite(1, 1, { max_links: 50 })
      ).rejects.toThrow('Update failed');
    });
  });

  describe('deleteSite', () => {
    it('should throw on database error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Delete failed'));

      await expect(siteService.deleteSite(1, 1)).rejects.toThrow('Delete failed');
    });
  });
});

describe('getSiteById', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('should return site by ID', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        site_url: 'https://example.com',
        site_type: 'wordpress'
      }]
    });

    const result = await siteService.getSiteById(1, 1);

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('should return null for non-existent site', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await siteService.getSiteById(999, 1);

    expect(result).toBeNull();
  });

  it('should throw on database error', async () => {
    mockQuery.mockRejectedValue(new Error('Query failed'));

    await expect(siteService.getSiteById(1, 1)).rejects.toThrow('Query failed');
  });
});

describe('getSiteByDomain - Additional Tests', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('should throw on database error', async () => {
    mockQuery.mockRejectedValue(new Error('Query failed'));

    await expect(siteService.getSiteByDomain('example.com')).rejects.toThrow('Query failed');
  });
});

describe('getSiteByUrlForUser', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('should return site by URL for user', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        site_url: 'https://example.com',
        user_id: 1
      }]
    });

    const result = await siteService.getSiteByUrlForUser('https://example.com', 1);

    expect(result).toBeDefined();
    expect(result.site_url).toBe('https://example.com');
  });

  it('should return null for non-existent site', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await siteService.getSiteByUrlForUser('https://nonexistent.com', 1);

    expect(result).toBeNull();
  });

  it('should throw on database error', async () => {
    mockQuery.mockRejectedValue(new Error('Query failed'));

    await expect(
      siteService.getSiteByUrlForUser('https://example.com', 1)
    ).rejects.toThrow('Query failed');
  });
});

describe('recalculateSiteStats', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClient.query.mockReset();
    mockPool.connect.mockResolvedValue(mockClient);
  });

  it('should recalculate site stats successfully', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // UPDATE with CTE
      .mockResolvedValueOnce({}); // COMMIT

    // Should not throw
    await expect(siteService.recalculateSiteStats(1)).resolves.toBeUndefined();
  });

  it('should rollback on database error', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error('Update failed')); // UPDATE fails

    await expect(siteService.recalculateSiteStats(1)).rejects.toThrow('Update failed');
  });
});

describe('Registration Tokens - Error Handling', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('generateRegistrationToken', () => {
    it('should throw on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Insert failed'));

      await expect(
        siteService.generateRegistrationToken(1, {})
      ).rejects.toThrow('Insert failed');
    });
  });

  describe('validateRegistrationToken', () => {
    it('should throw on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Query failed'));

      await expect(
        siteService.validateRegistrationToken('reg_test')
      ).rejects.toThrow('Query failed');
    });
  });

  describe('incrementTokenUsage', () => {
    it('should throw on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Update failed'));

      await expect(
        siteService.incrementTokenUsage('reg_test')
      ).rejects.toThrow('Update failed');
    });
  });

  describe('getUserTokens', () => {
    it('should throw on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Query failed'));

      await expect(siteService.getUserTokens(1)).rejects.toThrow('Query failed');
    });
  });

  describe('deleteToken', () => {
    it('should throw on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Delete failed'));

      await expect(siteService.deleteToken(1, 1)).rejects.toThrow('Delete failed');
    });
  });
});

describe('Bulk Operations - Additional Tests', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('bulkUpdateSiteParams', () => {
    it('should handle site not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Site not found

      const updates = [{ domain: 'nonexistent.com', value: 50 }];

      const result = await siteService.bulkUpdateSiteParams('dr', updates);

      expect(result.notFound).toBe(1);
      expect(result.updated).toBe(0);
    });

    it('should handle empty domain', async () => {
      const updates = [{ domain: '', value: 50 }];

      const result = await siteService.bulkUpdateSiteParams('dr', updates);

      expect(result.errors).toBe(1);
    });

    it('should handle database error during update', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, site_url: 'https://example.com', old_value: 0 }] }) // Find site
        .mockRejectedValueOnce(new Error('Update failed')); // Update fails

      const updates = [{ domain: 'example.com', value: 50 }];

      const result = await siteService.bulkUpdateSiteParams('dr', updates);

      expect(result.errors).toBe(1);
    });

    it('should update site successfully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, site_url: 'https://example.com', old_value: 0 }] }) // Find site
        .mockResolvedValueOnce({}); // Update succeeds

      const updates = [{ domain: 'example.com', value: 50 }];

      const result = await siteService.bulkUpdateSiteParams('dr', updates);

      expect(result.updated).toBe(1);
      expect(result.details[0].status).toBe('updated');
    });
  });

  describe('getSitesWithZeroParam', () => {
    it('should throw on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Query failed'));

      await expect(siteService.getSitesWithZeroParam('dr')).rejects.toThrow('Query failed');
    });
  });
});
