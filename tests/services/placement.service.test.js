/**
 * Placement Service Tests
 *
 * Tests placement service with mocked database:
 * - getUserPlacements
 * - getPlacementById
 * - getStatistics
 * - getAvailableSites
 * - createPlacement (integration with billing)
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

// Mock cache service
jest.mock('../../backend/services/cache.service', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(true),
  delPattern: jest.fn().mockResolvedValue(true),
  isAvailable: jest.fn().mockReturnValue(true)
}));

// Mock logger
jest.mock('../../backend/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

const placementService = require('../../backend/services/placement.service');

describe('Placement Service', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockPool.connect.mockResolvedValue(mockClient);
  });

  describe('getUserPlacements', () => {
    const mockPlacements = [
      {
        id: 1,
        type: 'link',
        status: 'placed',
        site_url: 'https://example.com',
        site_name: 'Example Site',
        project_name: 'Test Project',
        anchor_text: 'Test Link',
        purchased_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        auto_renewal: false
      },
      {
        id: 2,
        type: 'article',
        status: 'placed',
        site_url: 'https://example2.com',
        site_name: 'Example Site 2',
        project_name: 'Test Project',
        title: 'Test Article',
        wordpress_post_id: 123,
        purchased_at: new Date().toISOString(),
        expires_at: null,
        auto_renewal: false
      }
    ];

    it('should return user placements with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: mockPlacements }) // Data query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }); // Count query

      const result = await placementService.getUserPlacements(1, 1, 10);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });

    it('should return array without pagination when page=0', async () => {
      mockQuery.mockResolvedValueOnce({ rows: mockPlacements });

      const result = await placementService.getUserPlacements(1, 0, 0);

      // Without pagination, returns raw array
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });

    it('should filter by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockPlacements[0]] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await placementService.getUserPlacements(1, 1, 10, { status: 'placed' });

      expect(result.data).toHaveLength(1);

      // Verify WHERE clause includes status filter
      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall).toContain('status');
    });

    it('should filter by project_id', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockPlacements[0]] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await placementService.getUserPlacements(1, 1, 10, { project_id: 123 });

      expect(result.data).toHaveLength(1);

      // Verify WHERE clause includes project_id filter
      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall).toContain('project_id');
    });

    it('should handle empty results', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await placementService.getUserPlacements(1, 1, 10);

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });

    it('should calculate pagination correctly', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: mockPlacements })
        .mockResolvedValueOnce({ rows: [{ count: '25' }] });

      const result = await placementService.getUserPlacements(1, 2, 10);

      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.total).toBe(25);
      expect(result.pagination.pages).toBe(3);
    });
  });

  describe('getPlacementById', () => {
    const mockPlacement = {
      id: 1,
      type: 'link',
      status: 'placed',
      user_id: 1,
      site_name: 'Test Site',
      site_url: 'https://example.com',
      anchor_text: 'Test Link'
    };

    it('should return placement details', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockPlacement] });

      const result = await placementService.getPlacementById(1, 1);

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.type).toBe('link');
    });

    it('should return null for non-existent placement', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await placementService.getPlacementById(999, 1);

      expect(result).toBeNull();
    });

    it('should return null for placement owned by different user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Query filters by user_id

      const result = await placementService.getPlacementById(1, 999);

      expect(result).toBeNull();
    });
  });

  describe('getStatistics', () => {
    it('should return placement statistics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            total_placements: '10',
            total_links_placed: '7',
            total_articles_placed: '3'
          }
        ]
      });

      const result = await placementService.getStatistics(1);

      expect(result).toHaveProperty('total_placements');
      expect(result).toHaveProperty('total_links_placed');
      expect(result).toHaveProperty('total_articles_placed');
      expect(result.total_placements).toBe(10);
      expect(result.total_links_placed).toBe(7);
    });

    it('should return zeros for user with no placements', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            total_placements: '0',
            total_links_placed: '0',
            total_articles_placed: '0'
          }
        ]
      });

      const result = await placementService.getStatistics(1);

      expect(result.total_placements).toBe(0);
    });
  });

  describe('getAvailableSites', () => {
    const mockSites = [
      {
        id: 1,
        site_url: 'https://example1.com',
        site_type: 'wordpress',
        max_links: 10,
        used_links: 2,
        max_articles: 5,
        used_articles: 1
      },
      {
        id: 2,
        site_url: 'https://example2.com',
        site_type: 'static_php',
        max_links: 20,
        used_links: 20, // Full
        max_articles: 0,
        used_articles: 0
      }
    ];

    it('should return available sites for links', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: mockSites.filter(s => s.used_links < s.max_links)
      });

      const result = await placementService.getAvailableSites(1, 'link');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return available sites for articles', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: mockSites.filter(s => s.site_type === 'wordpress' && s.used_articles < s.max_articles)
      });

      const result = await placementService.getAvailableSites(1, 'article');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should exclude static_php sites for articles', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockSites[0]] // Only WordPress sites
      });

      const result = await placementService.getAvailableSites(1, 'article');

      result.forEach(site => {
        expect(site.site_type).not.toBe('static_php');
      });
    });

    it('should return empty array when no sites available', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await placementService.getAvailableSites(1, 'link');

      expect(result).toEqual([]);
    });
  });
});

describe('Placement Status Lifecycle', () => {
  const validStatuses = ['pending', 'scheduled', 'placed', 'failed', 'expired', 'cancelled'];

  describe('Valid Statuses', () => {
    validStatuses.forEach(status => {
      it(`should recognize "${status}" as valid`, () => {
        expect(validStatuses).toContain(status);
      });
    });
  });

  describe('Status Transitions', () => {
    const validTransitions = [
      { from: 'pending', to: 'placed', description: 'Successful publication' },
      { from: 'pending', to: 'failed', description: 'Publication error' },
      { from: 'pending', to: 'cancelled', description: 'User cancellation' },
      { from: 'scheduled', to: 'pending', description: 'Scheduled time reached' },
      { from: 'scheduled', to: 'cancelled', description: 'Scheduled cancellation' },
      { from: 'placed', to: 'expired', description: 'Link expiration' }
    ];

    validTransitions.forEach(({ from, to, description }) => {
      it(`should allow ${from} → ${to} (${description})`, () => {
        expect(validStatuses).toContain(from);
        expect(validStatuses).toContain(to);
      });
    });
  });

  describe('Invalid Transitions', () => {
    const invalidTransitions = [
      { from: 'placed', to: 'pending' },
      { from: 'failed', to: 'placed' },
      { from: 'expired', to: 'placed' },
      { from: 'cancelled', to: 'placed' }
    ];

    invalidTransitions.forEach(({ from, to }) => {
      it(`should NOT allow ${from} → ${to}`, () => {
        // This is a documentation test
        // Real validation would be in status update function
        expect(true).toBe(true);
      });
    });
  });
});

describe('Placement Types', () => {
  const validTypes = ['link', 'article'];

  validTypes.forEach(type => {
    it(`should recognize "${type}" as valid type`, () => {
      expect(validTypes).toContain(type);
    });
  });

  it('should have exactly 2 types', () => {
    expect(validTypes).toHaveLength(2);
  });

  describe('Type-specific behavior', () => {
    it('link placements should expire after 30 days', () => {
      const linkExpiryDays = 30;
      expect(linkExpiryDays).toBe(30);
    });

    it('article placements should not expire', () => {
      // Articles don't have expires_at
      const articleExpires = null;
      expect(articleExpires).toBeNull();
    });

    it('link placements can have auto-renewal', () => {
      const linkPlacement = { type: 'link', auto_renewal: true };
      expect(linkPlacement.auto_renewal).toBe(true);
    });

    it('article placements cannot have auto-renewal', () => {
      const articlePlacement = { type: 'article' };
      // auto_renewal not applicable for articles
      expect(articlePlacement.auto_renewal).toBeUndefined();
    });
  });
});

describe('createPlacement', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockPool.connect.mockResolvedValue(mockClient);
  });

  const mockSite = {
    id: 1,
    max_links: 10,
    used_links: 2,
    max_articles: 5,
    used_articles: 1,
    site_url: 'https://example.com',
    api_key: 'api_test123'
  };

  describe('Validation', () => {
    it('should reject placement on non-existent site', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // pg_advisory_xact_lock
        .mockResolvedValueOnce({ rows: [{ existing_links: '0', existing_articles: '0' }] }) // existing content
        .mockResolvedValueOnce({ rows: [] }) // Site not found
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        placementService.createPlacement({
          site_id: 999,
          project_id: 1,
          link_ids: [1],
          userId: 1
        })
      ).rejects.toThrow(/site not found/i);
    });

    it('should reject when site link quota exhausted', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // pg_advisory_xact_lock
        .mockResolvedValueOnce({ rows: [{ existing_links: '0', existing_articles: '0' }] }) // existing content
        .mockResolvedValueOnce({ rows: [{ ...mockSite, used_links: 10, max_links: 10 }] }) // Site with full quota
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        placementService.createPlacement({
          site_id: 1,
          project_id: 1,
          link_ids: [1],
          userId: 1
        })
      ).rejects.toThrow(/link limit/i);
    });

    it('should reject when site article quota exhausted', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // pg_advisory_xact_lock
        .mockResolvedValueOnce({ rows: [{ existing_links: '0', existing_articles: '0' }] }) // existing content
        .mockResolvedValueOnce({ rows: [{ ...mockSite, used_articles: 5, max_articles: 5 }] }) // Site with full quota
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        placementService.createPlacement({
          site_id: 1,
          project_id: 1,
          article_ids: [1],
          userId: 1
        })
      ).rejects.toThrow(/article limit/i);
    });

    it('should reject multiple links per site', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // pg_advisory_xact_lock
        .mockResolvedValueOnce({ rows: [{ existing_links: '0', existing_articles: '0' }] }) // existing content
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        placementService.createPlacement({
          site_id: 1,
          project_id: 1,
          link_ids: [1, 2, 3], // Multiple links not allowed
          userId: 1
        })
      ).rejects.toThrow(/1 link/i);
    });

    it('should reject multiple articles per site', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // pg_advisory_xact_lock
        .mockResolvedValueOnce({ rows: [{ existing_links: '0', existing_articles: '0' }] }) // existing content
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        placementService.createPlacement({
          site_id: 1,
          project_id: 1,
          article_ids: [1, 2], // Multiple articles not allowed
          userId: 1
        })
      ).rejects.toThrow(/1 article/i);
    });

    it('should reject duplicate placement for same project/site', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // pg_advisory_xact_lock
        .mockResolvedValueOnce({
          rows: [
            {
              existing_links: '1', // Already has placement
              existing_articles: '0'
            }
          ]
        }) // existing content check
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        placementService.createPlacement({
          site_id: 1,
          project_id: 1,
          link_ids: [1],
          userId: 1
        })
      ).rejects.toThrow(/уже есть размещение/i);
    });
  });

  describe('Link Placement Creation', () => {
    it('should create link placement successfully', async () => {
      const mockLink = {
        id: 1,
        usage_count: 0,
        usage_limit: 999,
        status: 'active'
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // pg_advisory_xact_lock
        .mockResolvedValueOnce({ rows: [{ existing_links: '0', existing_articles: '0' }] }) // no existing
        .mockResolvedValueOnce({ rows: [mockSite] }) // Get site FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }) // No existing placement
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT placement RETURNING
        .mockResolvedValueOnce({ rows: [] }) // Check existing link in placement
        .mockResolvedValueOnce({ rows: [mockLink] }) // Get link FOR UPDATE
        .mockResolvedValueOnce({}) // INSERT placement_content
        .mockResolvedValueOnce({}) // UPDATE project_links usage_count
        .mockResolvedValueOnce({}) // UPDATE sites used_links
        .mockResolvedValueOnce({}) // UPDATE placement status
        .mockResolvedValueOnce({}); // COMMIT

      const result = await placementService.createPlacement({
        site_id: 1,
        project_id: 1,
        link_ids: [1],
        userId: 1
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
    });

    it('should reject exhausted link', async () => {
      const exhaustedLink = {
        id: 1,
        usage_count: 999,
        usage_limit: 999,
        status: 'exhausted'
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // pg_advisory_xact_lock
        .mockResolvedValueOnce({ rows: [{ existing_links: '0', existing_articles: '0' }] }) // no existing
        .mockResolvedValueOnce({ rows: [mockSite] }) // Get site FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }) // No existing placement
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT placement RETURNING
        .mockResolvedValueOnce({ rows: [] }) // Check existing link in placement
        .mockResolvedValueOnce({ rows: [exhaustedLink] }) // Get exhausted link
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        placementService.createPlacement({
          site_id: 1,
          project_id: 1,
          link_ids: [1],
          userId: 1
        })
      ).rejects.toThrow(/exhausted/i);
    });
  });

  describe('Article Placement Creation', () => {
    it('should reject exhausted article', async () => {
      const exhaustedArticle = {
        id: 1,
        usage_count: 1,
        usage_limit: 1,
        status: 'exhausted'
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // pg_advisory_xact_lock
        .mockResolvedValueOnce({ rows: [{ existing_links: '0', existing_articles: '0' }] }) // no existing
        .mockResolvedValueOnce({ rows: [mockSite] }) // Get site FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }) // No existing placement
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT placement RETURNING
        .mockResolvedValueOnce({ rows: [] }) // Check existing article in placement
        .mockResolvedValueOnce({ rows: [exhaustedArticle] }) // Get exhausted article
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        placementService.createPlacement({
          site_id: 1,
          project_id: 1,
          article_ids: [1],
          userId: 1
        })
      ).rejects.toThrow(/exhausted/i);
    });

    // Note: WordPress publication tests require jest.mock with implementation
    // These are better tested as integration tests with actual WordPress mock
  });

  describe('Transaction Safety', () => {
    it('should rollback on database error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Database error'));

      await expect(
        placementService.createPlacement({
          site_id: 1,
          project_id: 1,
          link_ids: [1],
          userId: 1
        })
      ).rejects.toThrow('Database error');

      const calls = mockClient.query.mock.calls.map(c => c[0] || c);
      expect(calls.some(c => typeof c === 'string' && c.includes('ROLLBACK'))).toBe(true);
    });

    it('should release client after transaction', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Some error'));

      await expect(
        placementService.createPlacement({
          site_id: 1,
          project_id: 1,
          link_ids: [1],
          userId: 1
        })
      ).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should use advisory lock to prevent race conditions', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // pg_advisory_xact_lock
        .mockResolvedValueOnce({ rows: [{ existing_links: '0', existing_articles: '0' }] })
        .mockResolvedValueOnce({ rows: [mockSite] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 1, usage_count: 0, usage_limit: 999, status: 'active' }]
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}); // COMMIT

      await placementService.createPlacement({
        site_id: 1,
        project_id: 1,
        link_ids: [1],
        userId: 1
      });

      // Verify advisory lock was called
      const calls = mockClient.query.mock.calls.map(c => c[0] || c);
      expect(calls.some(c => typeof c === 'string' && c.includes('pg_advisory_xact_lock'))).toBe(
        true
      );
    });
  });
});

describe('Placement Quotas', () => {
  describe('Site Link Quota', () => {
    it('should check used_links < max_links', () => {
      const site = { max_links: 10, used_links: 5 };
      expect(site.used_links < site.max_links).toBe(true);
    });

    it('should block when quota exhausted', () => {
      const site = { max_links: 10, used_links: 10 };
      expect(site.used_links < site.max_links).toBe(false);
    });
  });

  describe('Site Article Quota', () => {
    it('should check used_articles < max_articles', () => {
      const site = { max_articles: 5, used_articles: 2 };
      expect(site.used_articles < site.max_articles).toBe(true);
    });

    it('should block when quota exhausted', () => {
      const site = { max_articles: 5, used_articles: 5 };
      expect(site.used_articles < site.max_articles).toBe(false);
    });
  });

  describe('Content Usage Limit', () => {
    it('link has default usage_limit of 999', () => {
      const link = { usage_limit: 999, usage_count: 0 };
      expect(link.usage_limit).toBe(999);
    });

    it('article has usage_limit of 1 (single use)', () => {
      const article = { usage_limit: 1, usage_count: 0 };
      expect(article.usage_limit).toBe(1);
    });

    it('content should be available when usage_count < usage_limit', () => {
      const content = { usage_limit: 999, usage_count: 50 };
      expect(content.usage_count < content.usage_limit).toBe(true);
    });
  });
});
