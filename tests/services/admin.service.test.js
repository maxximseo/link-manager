/**
 * Admin Service Tests
 *
 * Tests admin service with mocked database:
 * - getAdminStats
 * - getRevenueBreakdown
 * - getUsers
 * - adjustUserBalance
 * - getRecentPurchases
 * - getAdminPlacements
 * - refundPlacement
 * - approvePlacement
 * - rejectPlacement
 * - setSitePublicStatus
 * - getAllSites
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

// Mock cache service
jest.mock('../../backend/services/cache.service', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(true),
  delPattern: jest.fn().mockResolvedValue(true),
  isAvailable: jest.fn().mockReturnValue(true)
}));

// Mock billing service
jest.mock('../../backend/services/billing.service', () => ({
  calculateDiscountTier: jest.fn().mockResolvedValue({ discount: 0, tier: 'Standard' }),
<<<<<<< HEAD
  refundPlacementInTransaction: jest.fn().mockResolvedValue({
    refunded: true,
    newBalance: 100,
    tierChanged: false,
    newTier: 'Standard'
  }),
=======
  refundPlacementInTransaction: jest.fn().mockResolvedValue({ refunded: true, newBalance: 100, tierChanged: false, newTier: 'Standard' }),
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
  restoreUsageCountsInTransaction: jest.fn().mockResolvedValue(true),
  publishPlacementAsync: jest.fn().mockResolvedValue(true)
}));

// Mock wordpress service
jest.mock('../../backend/services/wordpress.service', () => ({
  deleteArticle: jest.fn().mockResolvedValue({ success: true })
}));

const adminService = require('../../backend/services/admin.service');
const billingService = require('../../backend/services/billing.service');

describe('Admin Service', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockPool.connect.mockResolvedValue(mockClient);
  });

  describe('getAdminStats', () => {
    const mockRevenueStats = {
<<<<<<< HEAD
      rows: [
        {
          total_revenue: '1500.00',
          purchases_count: '25',
          renewals_count: '10',
          avg_transaction: '42.86'
        }
      ]
    };

    const mockPlacementStats = {
      rows: [
        {
          total_placements: '35',
          link_placements: '25',
          article_placements: '10',
          scheduled_placements: '5',
          active_placements: '28',
          auto_renewal_count: '15'
        }
      ]
    };

    const mockUserStats = {
      rows: [
        {
          new_users: '8',
          total_user_balance: '5000.00',
          total_user_spending: '15000.00'
        }
      ]
=======
      rows: [{
        total_revenue: '1500.00',
        purchases_count: '25',
        renewals_count: '10',
        avg_transaction: '42.86'
      }]
    };

    const mockPlacementStats = {
      rows: [{
        total_placements: '35',
        link_placements: '25',
        article_placements: '10',
        scheduled_placements: '5',
        active_placements: '28',
        auto_renewal_count: '15'
      }]
    };

    const mockUserStats = {
      rows: [{
        new_users: '8',
        total_user_balance: '5000.00',
        total_user_spending: '15000.00'
      }]
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    };

    it('should return stats for day period', async () => {
      mockQuery
        .mockResolvedValueOnce(mockRevenueStats)
        .mockResolvedValueOnce(mockPlacementStats)
        .mockResolvedValueOnce(mockUserStats);

      const result = await adminService.getAdminStats('day');

      expect(result).toHaveProperty('period', 'day');
      expect(result).toHaveProperty('revenue');
      expect(result).toHaveProperty('placements');
      expect(result).toHaveProperty('users');
      expect(result.revenue.total).toBe(1500);
      expect(result.placements.total).toBe(35);
      expect(result.users.newUsers).toBe(8);
    });

    it('should return stats for week period', async () => {
      mockQuery
        .mockResolvedValueOnce(mockRevenueStats)
        .mockResolvedValueOnce(mockPlacementStats)
        .mockResolvedValueOnce(mockUserStats);

      const result = await adminService.getAdminStats('week');

      expect(result.period).toBe('week');
      // Verify date filter in query
      const revenueQuery = mockQuery.mock.calls[0][0];
<<<<<<< HEAD
      expect(revenueQuery).toContain('7 days');
=======
      expect(revenueQuery).toContain("7 days");
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    });

    it('should return stats for month period', async () => {
      mockQuery
        .mockResolvedValueOnce(mockRevenueStats)
        .mockResolvedValueOnce(mockPlacementStats)
        .mockResolvedValueOnce(mockUserStats);

      const result = await adminService.getAdminStats('month');

      expect(result.period).toBe('month');
      const revenueQuery = mockQuery.mock.calls[0][0];
<<<<<<< HEAD
      expect(revenueQuery).toContain('30 days');
=======
      expect(revenueQuery).toContain("30 days");
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    });

    it('should return stats for year period', async () => {
      mockQuery
        .mockResolvedValueOnce(mockRevenueStats)
        .mockResolvedValueOnce(mockPlacementStats)
        .mockResolvedValueOnce(mockUserStats);

      const result = await adminService.getAdminStats('year');

      expect(result.period).toBe('year');
      const revenueQuery = mockQuery.mock.calls[0][0];
<<<<<<< HEAD
      expect(revenueQuery).toContain('365 days');
=======
      expect(revenueQuery).toContain("365 days");
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    });

    it('should default to week for invalid period', async () => {
      mockQuery
        .mockResolvedValueOnce(mockRevenueStats)
        .mockResolvedValueOnce(mockPlacementStats)
        .mockResolvedValueOnce(mockUserStats);

      const result = await adminService.getAdminStats('invalid');

      const revenueQuery = mockQuery.mock.calls[0][0];
<<<<<<< HEAD
      expect(revenueQuery).toContain('7 days');
=======
      expect(revenueQuery).toContain("7 days");
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    });

    it('should handle null values', async () => {
      mockQuery
<<<<<<< HEAD
        .mockResolvedValueOnce({
          rows: [
            {
              total_revenue: null,
              purchases_count: '0',
              renewals_count: '0',
              avg_transaction: null
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              total_placements: '0',
              link_placements: '0',
              article_placements: '0',
              scheduled_placements: '0',
              active_placements: '0',
              auto_renewal_count: '0'
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [{ new_users: '0', total_user_balance: null, total_user_spending: null }]
        });
=======
        .mockResolvedValueOnce({ rows: [{ total_revenue: null, purchases_count: '0', renewals_count: '0', avg_transaction: null }] })
        .mockResolvedValueOnce({ rows: [{ total_placements: '0', link_placements: '0', article_placements: '0', scheduled_placements: '0', active_placements: '0', auto_renewal_count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ new_users: '0', total_user_balance: null, total_user_spending: null }] });
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)

      const result = await adminService.getAdminStats('day');

      expect(result.revenue.total).toBe(0);
      expect(result.users.totalBalance).toBe(0);
    });
  });

  describe('getRevenueBreakdown', () => {
    it('should return revenue breakdown by day', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
<<<<<<< HEAD
          {
            period: '2025-01-01',
            type: 'purchase',
            transaction_count: '10',
            total_amount: '250.00'
          },
=======
          { period: '2025-01-01', type: 'purchase', transaction_count: '10', total_amount: '250.00' },
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
          { period: '2025-01-01', type: 'renewal', transaction_count: '5', total_amount: '100.00' }
        ]
      });

      const result = await adminService.getRevenueBreakdown('2025-01-01', '2025-01-31', 'day');

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('period');
      expect(result[0]).toHaveProperty('type');
      expect(result[0]).toHaveProperty('total_amount');
    });

    it('should support hourly grouping', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await adminService.getRevenueBreakdown('2025-01-01', '2025-01-02', 'hour');

      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall).toContain("DATE_TRUNC('hour'");
    });

    it('should support weekly grouping', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await adminService.getRevenueBreakdown('2025-01-01', '2025-03-31', 'week');

      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall).toContain("DATE_TRUNC('week'");
    });

    it('should support monthly grouping', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await adminService.getRevenueBreakdown('2025-01-01', '2025-12-31', 'month');

      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall).toContain("DATE_TRUNC('month'");
    });
  });

  describe('getUsers', () => {
    const mockUsers = [
<<<<<<< HEAD
      {
        id: 1,
        username: 'user1',
        email: 'user1@test.com',
        role: 'user',
        balance: '100.00',
        placement_count: '5',
        project_count: '2'
      },
      {
        id: 2,
        username: 'admin',
        email: 'admin@test.com',
        role: 'admin',
        balance: '500.00',
        placement_count: '10',
        project_count: '3'
      }
=======
      { id: 1, username: 'user1', email: 'user1@test.com', role: 'user', balance: '100.00', placement_count: '5', project_count: '2' },
      { id: 2, username: 'admin', email: 'admin@test.com', role: 'admin', balance: '500.00', placement_count: '10', project_count: '3' }
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    ];

    it('should return users with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: mockUsers })
        .mockResolvedValueOnce({ rows: [{ count: '50' }] });

      const result = await adminService.getUsers({ page: 1, limit: 10 });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(50);
      expect(result.pagination.pages).toBe(5);
    });

    it('should filter by search term', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockUsers[0]] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await adminService.getUsers({ search: 'user1' });

      expect(result.data).toHaveLength(1);
      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall).toContain('ILIKE');
    });

    it('should filter by role', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockUsers[1]] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await adminService.getUsers({ role: 'admin' });

      expect(result.data).toHaveLength(1);
      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall).toContain('role =');
    });

    it('should calculate pagination flags', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: mockUsers })
        .mockResolvedValueOnce({ rows: [{ count: '30' }] });

      const result = await adminService.getUsers({ page: 2, limit: 10 });

      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrev).toBe(true);
    });
  });

  describe('adjustUserBalance', () => {
    const mockUser = { id: 1, username: 'testuser', balance: '100.00' };

    it('should add balance successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockUser] }) // SELECT user FOR UPDATE
        .mockResolvedValueOnce({}) // UPDATE balance
        .mockResolvedValueOnce({}) // INSERT transaction
        .mockResolvedValueOnce({}) // INSERT audit_log
        .mockResolvedValueOnce({}) // INSERT notification
        .mockResolvedValueOnce({}); // COMMIT

      const result = await adminService.adjustUserBalance(1, 50, 'Test adjustment', 999);

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(150);
    });

    it('should subtract balance successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockUser] }) // SELECT user
        .mockResolvedValueOnce({}) // UPDATE
        .mockResolvedValueOnce({}) // INSERT transaction
        .mockResolvedValueOnce({}) // INSERT audit
        .mockResolvedValueOnce({}) // INSERT notification
        .mockResolvedValueOnce({}); // COMMIT

      const result = await adminService.adjustUserBalance(1, -30, 'Charge', 999);

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(70);
    });

    it('should throw error for non-existent user', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // User not found

<<<<<<< HEAD
      await expect(adminService.adjustUserBalance(999, 50, 'Test', 1)).rejects.toThrow(
        'User not found'
      );
=======
      await expect(adminService.adjustUserBalance(999, 50, 'Test', 1))
        .rejects.toThrow('User not found');
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    });

    it('should throw error for insufficient balance', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockUser] }); // User with $100

<<<<<<< HEAD
      await expect(adminService.adjustUserBalance(1, -150, 'Overdraft', 999)).rejects.toThrow(
        'Insufficient balance'
      );
=======
      await expect(adminService.adjustUserBalance(1, -150, 'Overdraft', 999))
        .rejects.toThrow('Insufficient balance');
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    });

    it('should rollback on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('DB error'));

<<<<<<< HEAD
      await expect(adminService.adjustUserBalance(1, 50, 'Test', 999)).rejects.toThrow('DB error');
=======
      await expect(adminService.adjustUserBalance(1, 50, 'Test', 999))
        .rejects.toThrow('DB error');
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should create audit log entry', async () => {
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}) // Audit log insert
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await adminService.adjustUserBalance(1, 50, 'Test', 999);

<<<<<<< HEAD
      const auditCall = mockClient.query.mock.calls.find(
        call => call[0] && call[0].includes('audit_log')
=======
      const auditCall = mockClient.query.mock.calls.find(call =>
        call[0] && call[0].includes('audit_log')
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
      );
      expect(auditCall).toBeDefined();
    });
  });

  describe('getRecentPurchases', () => {
    it('should return recent purchases', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, type: 'link', status: 'placed', final_price: '25.00', username: 'user1' },
          { id: 2, type: 'article', status: 'placed', final_price: '15.00', username: 'user2' }
        ]
      });

      const result = await adminService.getRecentPurchases(10);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('username');
      expect(result[0]).toHaveProperty('final_price');
    });

    it('should use default limit of 20', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await adminService.getRecentPurchases();

      const queryCall = mockQuery.mock.calls[0];
      expect(queryCall[1]).toEqual([20]);
    });
  });

  describe('getAdminPlacements', () => {
    it('should return placements for admin sites', async () => {
      mockQuery
        .mockResolvedValueOnce({
<<<<<<< HEAD
          rows: [
            { id: 1, type: 'link', status: 'placed', username: 'buyer1', site_name: 'Admin Site' }
          ]
=======
          rows: [{ id: 1, type: 'link', status: 'placed', username: 'buyer1', site_name: 'Admin Site' }]
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await adminService.getAdminPlacements(999, { page: 1, limit: 50 });

      expect(result.data).toHaveLength(1);
      // Verify admin filter in query
      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall).toContain('s.user_id = $1');
    });

    it('should filter by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await adminService.getAdminPlacements(999, { status: 'placed' });

      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall).toContain('p.status =');
    });

    it('should filter by type', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await adminService.getAdminPlacements(999, { type: 'article' });

      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall).toContain('p.type =');
    });
  });

  describe('getPendingApprovals', () => {
    it('should return pending approval placements', async () => {
      mockQuery.mockResolvedValueOnce({
<<<<<<< HEAD
        rows: [
          {
            id: 1,
            status: 'pending_approval',
            buyer_username: 'user1',
            site_owner_username: 'admin'
          }
        ]
=======
        rows: [{
          id: 1,
          status: 'pending_approval',
          buyer_username: 'user1',
          site_owner_username: 'admin'
        }]
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
      });

      const result = await adminService.getPendingApprovals();

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('buyer_username');
      expect(result[0]).toHaveProperty('site_owner_username');
    });

    it('should return empty array when no pending approvals', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await adminService.getPendingApprovals();

      expect(result).toEqual([]);
    });
  });

  describe('getPendingApprovalsCount', () => {
    it('should return count of pending approvals', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] });

      const result = await adminService.getPendingApprovalsCount();

      expect(result).toBe(5);
    });
  });

  describe('approvePlacement', () => {
    const mockPlacement = {
      id: 1,
      user_id: 1,
      status: 'pending_approval',
      site_url: 'https://example.com',
      api_key: 'api_test',
      site_type: 'wordpress',
      scheduled_publish_date: null
    };

    it('should approve placement and set status to pending', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockPlacement] }) // SELECT placement
        .mockResolvedValueOnce({}) // UPDATE status
        .mockResolvedValueOnce({}) // Audit log
        .mockResolvedValueOnce({}) // Notification
        .mockResolvedValueOnce({}); // COMMIT

      const result = await adminService.approvePlacement(1, 999);

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('pending');
    });

    it('should set status to scheduled if scheduled_publish_date is future', async () => {
      const scheduledPlacement = {
        ...mockPlacement,
        scheduled_publish_date: new Date(Date.now() + 86400000) // Tomorrow
      };

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [scheduledPlacement] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const result = await adminService.approvePlacement(1, 999);

      expect(result.newStatus).toBe('scheduled');
    });

    it('should throw error for non-existent placement', async () => {
<<<<<<< HEAD
      mockClient.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [] });

      await expect(adminService.approvePlacement(999, 1)).rejects.toThrow('Placement not found');
=======
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] });

      await expect(adminService.approvePlacement(999, 1))
        .rejects.toThrow('Placement not found');
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    });

    it('should throw error if not pending_approval status', async () => {
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ ...mockPlacement, status: 'placed' }] });

<<<<<<< HEAD
      await expect(adminService.approvePlacement(1, 999)).rejects.toThrow(/not pending approval/i);
=======
      await expect(adminService.approvePlacement(1, 999))
        .rejects.toThrow(/not pending approval/i);
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    });
  });

  describe('rejectPlacement', () => {
    const mockPlacement = {
      id: 1,
      user_id: 1,
      site_id: 1,
      type: 'link',
      status: 'pending_approval',
      final_price: '25.00',
      site_name: 'Test Site',
      project_name: 'Test Project'
    };

    const mockUser = { balance: '100.00', total_spent: '500.00', current_discount: 15 };

    it('should reject placement and refund user', async () => {
      billingService.calculateDiscountTier.mockResolvedValueOnce({ discount: 15, tier: 'Silver' });

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockPlacement] }) // SELECT placement
        .mockResolvedValueOnce({ rows: [mockUser] }) // SELECT user for refund
        .mockResolvedValueOnce({}) // UPDATE user balance
        .mockResolvedValueOnce({}) // INSERT refund transaction
        .mockResolvedValueOnce({}) // UPDATE placement status
        .mockResolvedValueOnce({}) // Restore usage (called via billing service mock)
        .mockResolvedValueOnce({}) // UPDATE site quota
        .mockResolvedValueOnce({}) // Audit log
        .mockResolvedValueOnce({}) // Notification
        .mockResolvedValueOnce({}); // COMMIT

      const result = await adminService.rejectPlacement(1, 999, 'Content not appropriate');

      expect(result.success).toBe(true);
      expect(result.refundAmount).toBe(25);
      expect(result.reason).toBe('Content not appropriate');
    });

    it('should throw error if not pending_approval', async () => {
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ ...mockPlacement, status: 'placed' }] });

<<<<<<< HEAD
      await expect(adminService.rejectPlacement(1, 999, 'Test')).rejects.toThrow(
        /not pending approval/i
      );
=======
      await expect(adminService.rejectPlacement(1, 999, 'Test'))
        .rejects.toThrow(/not pending approval/i);
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    });

    it('should handle free placements (no refund)', async () => {
      const freePlacement = { ...mockPlacement, final_price: '0.00' };

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [freePlacement] })
        .mockResolvedValueOnce({}) // UPDATE status (no refund needed)
        .mockResolvedValueOnce({}) // Restore usage
        .mockResolvedValueOnce({}) // UPDATE site quota
        .mockResolvedValueOnce({}) // Audit
        .mockResolvedValueOnce({}) // Notification
        .mockResolvedValueOnce({});

      const result = await adminService.rejectPlacement(1, 999, 'Test');

      expect(result.refundAmount).toBe(0);
    });
  });

  describe('setSitePublicStatus', () => {
    it('should set site to public', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1, site_name: 'Test Site', is_public: true }]
        })
        .mockResolvedValueOnce({}); // Audit log

      const result = await adminService.setSitePublicStatus(1, true, 999);

      expect(result.is_public).toBe(true);
    });

    it('should set site to private', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1, site_name: 'Test Site', is_public: false }]
        })
        .mockResolvedValueOnce({});

      const result = await adminService.setSitePublicStatus(1, false, 999);

      expect(result.is_public).toBe(false);
    });

    it('should throw error for non-existent site', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

<<<<<<< HEAD
      await expect(adminService.setSitePublicStatus(999, true, 1)).rejects.toThrow(
        'Site not found'
      );
=======
      await expect(adminService.setSitePublicStatus(999, true, 1))
        .rejects.toThrow('Site not found');
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    });

    it('should create audit log', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, site_name: 'Test' }] })
        .mockResolvedValueOnce({});

      await adminService.setSitePublicStatus(1, true, 999);

      const auditCall = mockQuery.mock.calls[1][0];
      expect(auditCall).toContain('audit_log');
    });
  });

  describe('getAllSites', () => {
    it('should return all sites with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 1, site_name: 'Site 1', owner_username: 'user1', is_public: true },
            { id: 2, site_name: 'Site 2', owner_username: 'user2', is_public: false }
          ]
        })
        .mockResolvedValueOnce({ rows: [{ count: '100' }] });

      const result = await adminService.getAllSites({ page: 1, limit: 50 });

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(100);
    });

    it('should filter by search term', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, site_name: 'Matching Site' }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      await adminService.getAllSites({ search: 'Matching' });

      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall).toContain('ILIKE');
    });

    it('should filter by public status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await adminService.getAllSites({ isPublic: true });

      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall).toContain('is_public =');
    });
  });

  describe('refundPlacement', () => {
    const mockPlacement = {
      id: 1,
      user_id: 1,
      project_id: 1,
      site_id: 1,
      type: 'article',
      final_price: '25.00',
      original_price: '25.00',
      discount_applied: 0,
      wordpress_post_id: 123,
      site_name: 'Test Site',
      site_url: 'https://example.com',
      api_key: 'api_test',
      site_type: 'wordpress',
      project_name: 'Test Project'
    };

    it('should refund placement successfully', async () => {
      billingService.refundPlacementInTransaction.mockResolvedValueOnce({
        refunded: true,
        newBalance: 125,
        tierChanged: false,
        newTier: 'Silver'
      });

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockPlacement] }) // SELECT placement
        .mockResolvedValueOnce({}) // Audit log
        .mockResolvedValueOnce({}) // DELETE placement
        .mockResolvedValueOnce({}); // COMMIT

      const result = await adminService.refundPlacement(1, 'Customer request', 999, false);

      expect(result.refunded).toBe(true);
      expect(result.refundAmount).toBe(25);
    });

    it('should throw error for non-existent placement', async () => {
<<<<<<< HEAD
      mockClient.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [] });

      await expect(adminService.refundPlacement(999, 'Test', 1, false)).rejects.toThrow(
        'Placement not found'
      );
=======
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] });

      await expect(adminService.refundPlacement(999, 'Test', 1, false))
        .rejects.toThrow('Placement not found');
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    });

    it('should throw error for free placement', async () => {
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ ...mockPlacement, final_price: '0.00' }] });

<<<<<<< HEAD
      await expect(adminService.refundPlacement(1, 'Test', 999, false)).rejects.toThrow(
        /no refundable amount/i
      );
=======
      await expect(adminService.refundPlacement(1, 'Test', 999, false))
        .rejects.toThrow(/no refundable amount/i);
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    });

    it('should delete WordPress post if requested', async () => {
      const wordpressService = require('../../backend/services/wordpress.service');
      wordpressService.deleteArticle.mockResolvedValueOnce({ success: true });
      billingService.refundPlacementInTransaction.mockResolvedValueOnce({
<<<<<<< HEAD
        refunded: true,
        newBalance: 125,
        tierChanged: false,
        newTier: 'Standard'
=======
        refunded: true, newBalance: 125, tierChanged: false, newTier: 'Standard'
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
      });

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [mockPlacement] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const result = await adminService.refundPlacement(1, 'Test', 999, true);

      expect(result.wordpressPostDeleted).toBe(true);
      expect(wordpressService.deleteArticle).toHaveBeenCalled();
    });
  });
});

describe('Admin Audit Trail', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClient.query.mockReset();
    mockPool.connect.mockResolvedValue(mockClient);
  });

  it('should log balance adjustments', async () => {
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 1, balance: '100.00' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({}) // Audit log
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await adminService.adjustUserBalance(1, 50, 'Test', 999);

<<<<<<< HEAD
    const auditCall = mockClient.query.mock.calls.find(
      call => call[0] && call[0].includes('audit_log') && call[0].includes('admin_adjust_balance')
=======
    const auditCall = mockClient.query.mock.calls.find(call =>
      call[0] && call[0].includes('audit_log') && call[0].includes('admin_adjust_balance')
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    );
    expect(auditCall).toBeDefined();
  });

  it('should log site status changes', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, site_name: 'Test' }] })
      .mockResolvedValueOnce({});

    await adminService.setSitePublicStatus(1, true, 999);

<<<<<<< HEAD
    const auditCall = mockQuery.mock.calls.find(
      call => call[0] && call[0].includes('audit_log') && call[0].includes('set_site_public_status')
=======
    const auditCall = mockQuery.mock.calls.find(call =>
      call[0] && call[0].includes('audit_log') && call[0].includes('set_site_public_status')
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
    );
    expect(auditCall).toBeDefined();
  });
});

describe('Error Handling', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClient.query.mockReset();
    mockPool.connect.mockResolvedValue(mockClient);
  });

  it('should throw error on database failure in getAdminStats', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));

<<<<<<< HEAD
    await expect(adminService.getAdminStats('day')).rejects.toThrow('DB error');
=======
    await expect(adminService.getAdminStats('day'))
      .rejects.toThrow('DB error');
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)
  });

  it('should throw error on database failure in getUsers', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));

<<<<<<< HEAD
    await expect(adminService.getUsers({})).rejects.toThrow('DB error');
  });

  it('should release client on error in adjustUserBalance', async () => {
    mockClient.query.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('DB error'));
=======
    await expect(adminService.getUsers({}))
      .rejects.toThrow('DB error');
  });

  it('should release client on error in adjustUserBalance', async () => {
    mockClient.query
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('DB error'));
>>>>>>> a85c16f (Auto-commit: Development changes at 2025-12-03 18:27:00)

    try {
      await adminService.adjustUserBalance(1, 50, 'Test', 999);
    } catch (e) {
      // Expected error
    }

    expect(mockClient.release).toHaveBeenCalled();
  });
});
