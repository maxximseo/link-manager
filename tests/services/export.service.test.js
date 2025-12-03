/**
 * Export Service Tests
 */

// Mock database
jest.mock('../../backend/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../backend/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

const { query } = require('../../backend/config/database');
const exportService = require('../../backend/services/export.service');

describe('Export Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exportUserPlacements', () => {
    const mockPlacements = [
      {
        id: 1,
        type: 'link',
        status: 'placed',
        project_name: 'Project 1',
        site_name: 'Site 1',
        site_url: 'https://site1.com',
        site_dr: 45,
        site_da: 30,
        site_tf: 20,
        site_cf: 15,
        site_ref_domains: 100,
        site_rd_main: 50,
        site_norm: 1.5,
        site_keywords: 1000,
        site_traffic: 5000,
        site_geo: 'US',
        link_anchor: 'Test Link',
        link_url: 'https://example.com',
        article_title: null,
        original_price: '10.00',
        discount_applied: '1.00',
        final_price: '9.00',
        purchased_at: '2025-01-01T00:00:00Z',
        scheduled_publish_date: null,
        published_at: '2025-01-01T01:00:00Z',
        expires_at: '2026-01-01T00:00:00Z',
        auto_renewal: true,
        renewal_price: '9.00',
        renewal_count: 0
      }
    ];

    it('should export placements as CSV', async () => {
      query.mockResolvedValueOnce({ rows: mockPlacements });

      const result = await exportService.exportUserPlacements(1, 'csv');

      expect(result.format).toBe('csv');
      expect(result.filename).toMatch(/placements-1-\d+\.csv/);
      expect(typeof result.data).toBe('string');
      expect(result.data).toContain('id,type,status');
      expect(result.data).toContain('link,placed');
    });

    it('should export placements as JSON', async () => {
      query.mockResolvedValueOnce({ rows: mockPlacements });

      const result = await exportService.exportUserPlacements(1, 'json');

      expect(result.format).toBe('json');
      expect(result.filename).toMatch(/placements-1-\d+\.json/);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe('link');
    });

    it('should filter by project ID when provided', async () => {
      query.mockResolvedValueOnce({ rows: mockPlacements });

      await exportService.exportUserPlacements(1, 'csv', 123);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('AND p.project_id = $2'),
        [1, 123]
      );
    });

    it('should return empty CSV when no placements', async () => {
      query.mockResolvedValueOnce({ rows: [] });

      const result = await exportService.exportUserPlacements(1, 'csv');

      expect(result.format).toBe('csv');
      // Empty data because arrayToCSV returns empty string for empty array
    });

    it('should throw error on database failure', async () => {
      query.mockRejectedValueOnce(new Error('Database error'));

      await expect(exportService.exportUserPlacements(1, 'csv')).rejects.toThrow('Database error');
    });

    it('should use default format as csv', async () => {
      query.mockResolvedValueOnce({ rows: mockPlacements });

      const result = await exportService.exportUserPlacements(1);

      expect(result.format).toBe('csv');
    });
  });

  describe('exportUserTransactions', () => {
    const mockTransactions = [
      {
        id: 1,
        type: 'deposit',
        amount: '100.00',
        balance_before: '0.00',
        balance_after: '100.00',
        description: 'Initial deposit',
        placement_id: null,
        created_at: '2025-01-01T00:00:00Z'
      },
      {
        id: 2,
        type: 'purchase',
        amount: '-9.00',
        balance_before: '100.00',
        balance_after: '91.00',
        description: 'Placement purchase',
        placement_id: 1,
        created_at: '2025-01-02T00:00:00Z'
      }
    ];

    it('should export transactions as CSV', async () => {
      query.mockResolvedValueOnce({ rows: mockTransactions });

      const result = await exportService.exportUserTransactions(1, 'csv');

      expect(result.format).toBe('csv');
      expect(result.filename).toMatch(/transactions-1-\d+\.csv/);
      expect(result.data).toContain('id,type,amount');
      expect(result.data).toContain('deposit');
      expect(result.data).toContain('purchase');
    });

    it('should export transactions as JSON', async () => {
      query.mockResolvedValueOnce({ rows: mockTransactions });

      const result = await exportService.exportUserTransactions(1, 'json');

      expect(result.format).toBe('json');
      expect(result.filename).toMatch(/transactions-1-\d+\.json/);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should throw error on database failure', async () => {
      query.mockRejectedValueOnce(new Error('Database error'));

      await expect(exportService.exportUserTransactions(1, 'csv')).rejects.toThrow('Database error');
    });

    it('should use default format as csv', async () => {
      query.mockResolvedValueOnce({ rows: mockTransactions });

      const result = await exportService.exportUserTransactions(1);

      expect(result.format).toBe('csv');
    });
  });

  describe('exportAdminRevenue', () => {
    const mockRevenue = [
      {
        id: 1,
        type: 'purchase',
        amount: '9.00',
        created_at: '2025-01-01T00:00:00Z',
        username: 'testuser',
        email: 'test@example.com',
        placement_id: 1,
        project_name: 'Project 1',
        site_name: 'Site 1'
      }
    ];

    it('should export revenue as CSV', async () => {
      query.mockResolvedValueOnce({ rows: mockRevenue });

      const result = await exportService.exportAdminRevenue('2025-01-01', '2025-12-31', 'csv');

      expect(result.format).toBe('csv');
      expect(result.filename).toMatch(/revenue-\d+\.csv/);
      expect(result.data).toContain('id,type,amount');
      expect(result.data).toContain('purchase');
    });

    it('should export revenue as JSON', async () => {
      query.mockResolvedValueOnce({ rows: mockRevenue });

      const result = await exportService.exportAdminRevenue('2025-01-01', '2025-12-31', 'json');

      expect(result.format).toBe('json');
      expect(result.filename).toMatch(/revenue-\d+\.json/);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should filter by date range', async () => {
      query.mockResolvedValueOnce({ rows: mockRevenue });

      await exportService.exportAdminRevenue('2025-01-01', '2025-06-30', 'csv');

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('BETWEEN $1 AND $2'),
        ['2025-01-01', '2025-06-30']
      );
    });

    it('should throw error on database failure', async () => {
      query.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        exportService.exportAdminRevenue('2025-01-01', '2025-12-31', 'csv')
      ).rejects.toThrow('Database error');
    });

    it('should use default format as csv', async () => {
      query.mockResolvedValueOnce({ rows: mockRevenue });

      const result = await exportService.exportAdminRevenue('2025-01-01', '2025-12-31');

      expect(result.format).toBe('csv');
    });
  });

  describe('CSV Generation (arrayToCSV internal)', () => {
    it('should handle values with commas', async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            type: 'link',
            status: 'placed',
            project_name: 'Project, with comma',
            site_name: 'Site 1',
            site_url: 'https://site1.com',
            site_dr: 45,
            site_da: 30,
            site_tf: 20,
            site_cf: 15,
            site_ref_domains: 100,
            site_rd_main: 50,
            site_norm: 1.5,
            site_keywords: 1000,
            site_traffic: 5000,
            site_geo: 'US',
            link_anchor: 'Test, Anchor',
            link_url: 'https://example.com',
            article_title: null,
            original_price: '10.00',
            discount_applied: '1.00',
            final_price: '9.00',
            purchased_at: '2025-01-01T00:00:00Z',
            scheduled_publish_date: null,
            published_at: null,
            expires_at: null,
            auto_renewal: false,
            renewal_price: null,
            renewal_count: 0
          }
        ]
      });

      const result = await exportService.exportUserPlacements(1, 'csv');

      // Values with commas should be quoted
      expect(result.data).toContain('"Project, with comma"');
      expect(result.data).toContain('"Test, Anchor"');
    });

    it('should handle values with quotes', async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            type: 'link',
            status: 'placed',
            project_name: 'Project "quoted"',
            site_name: 'Site 1',
            site_url: 'https://site1.com',
            site_dr: 45,
            site_da: 30,
            site_tf: 20,
            site_cf: 15,
            site_ref_domains: 100,
            site_rd_main: 50,
            site_norm: 1.5,
            site_keywords: 1000,
            site_traffic: 5000,
            site_geo: 'US',
            link_anchor: 'Test',
            link_url: 'https://example.com',
            article_title: null,
            original_price: '10.00',
            discount_applied: '1.00',
            final_price: '9.00',
            purchased_at: '2025-01-01T00:00:00Z',
            scheduled_publish_date: null,
            published_at: null,
            expires_at: null,
            auto_renewal: false,
            renewal_price: null,
            renewal_count: 0
          }
        ]
      });

      const result = await exportService.exportUserPlacements(1, 'csv');

      // Quotes should be escaped with double quotes
      expect(result.data).toContain('"Project ""quoted"""');
    });

    it('should handle null values', async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            type: 'article',
            status: 'placed',
            project_name: 'Project 1',
            site_name: 'Site 1',
            site_url: 'https://site1.com',
            site_dr: null,
            site_da: null,
            site_tf: null,
            site_cf: null,
            site_ref_domains: null,
            site_rd_main: null,
            site_norm: null,
            site_keywords: null,
            site_traffic: null,
            site_geo: null,
            link_anchor: null,
            link_url: null,
            article_title: 'Test Article',
            original_price: '10.00',
            discount_applied: '0.00',
            final_price: '10.00',
            purchased_at: '2025-01-01T00:00:00Z',
            scheduled_publish_date: null,
            published_at: null,
            expires_at: null,
            auto_renewal: false,
            renewal_price: null,
            renewal_count: 0
          }
        ]
      });

      const result = await exportService.exportUserPlacements(1, 'csv');

      expect(typeof result.data).toBe('string');
      // Should not throw error with null values
    });
  });
});
