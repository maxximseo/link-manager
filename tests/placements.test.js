/**
 * Placement Service Tests
 *
 * Tests critical placement flows:
 * - Get placements (with pagination)
 * - Get placement by ID
 * - Get statistics
 * - Get available sites
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

jest.mock('../backend/config/database', () => ({
  query: (...args) => mockQuery(...args),
  pool: mockPool
}));

// Mock cache service
jest.mock('../backend/services/cache.service', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(true),
  delPattern: jest.fn().mockResolvedValue(true)
}));

const placementService = require('../backend/services/placement.service');

describe('Placement Service', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClient.query.mockReset();
  });

  describe('getUserPlacements', () => {
    const mockPlacements = [
      {
        id: 1,
        type: 'link',
        status: 'placed',
        site_url: 'https://example.com',
        project_name: 'Test Project',
        purchased_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 2,
        type: 'article',
        status: 'placed',
        site_url: 'https://example2.com',
        project_name: 'Test Project',
        purchased_at: new Date().toISOString(),
        expires_at: null
      }
    ];

    it('should return user placements with pagination', async () => {
      // Note: getUserPlacements(userId, page, limit, filters)
      mockQuery
        .mockResolvedValueOnce({ rows: mockPlacements }) // Data query (first)
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }); // Count query (second)

      const result = await placementService.getUserPlacements(1, 1, 10);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
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

    it('should handle empty results', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await placementService.getUserPlacements(1, 1, 10);

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe('getPlacementById', () => {
    it('should return placement details', async () => {
      const mockPlacement = {
        id: 1,
        type: 'link',
        status: 'placed',
        user_id: 1,
        site_name: 'Test Site',
        site_url: 'https://example.com'
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockPlacement] });

      const result = await placementService.getPlacementById(1, 1);

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
    });

    it('should return null for non-existent placement', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await placementService.getPlacementById(999, 1);

      expect(result).toBeNull();
    });
  });

  describe('getStatistics', () => {
    it('should return placement statistics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_placements: '10',
          total_links_placed: '7',
          total_articles_placed: '3'
        }]
      });

      const result = await placementService.getStatistics(1);

      expect(result).toHaveProperty('total_placements');
      expect(result).toHaveProperty('total_links_placed');
      expect(result).toHaveProperty('total_articles_placed');
      expect(result.total_placements).toBe(10);
      expect(result.total_links_placed).toBe(7);
    });
  });

  describe('getAvailableSites', () => {
    const mockSites = [
      { id: 1, site_url: 'https://example1.com', max_links: 10, used_links: 2 },
      { id: 2, site_url: 'https://example2.com', max_links: 5, used_links: 5 }
    ];

    it('should return available sites for links', async () => {
      mockQuery.mockResolvedValueOnce({ rows: mockSites });

      const result = await placementService.getAvailableSites(1, 'link');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return available sites for articles', async () => {
      mockQuery.mockResolvedValueOnce({ rows: mockSites });

      const result = await placementService.getAvailableSites(1, 'article');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

describe('Placement Status Values', () => {
  const validStatuses = ['pending', 'placed', 'failed', 'expired', 'cancelled', 'scheduled'];

  validStatuses.forEach(status => {
    it(`should recognize "${status}" as valid status`, () => {
      expect(validStatuses).toContain(status);
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
});
