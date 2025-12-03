/**
 * Billing Service Tests
 *
 * Tests billing service with mocked database:
 * - getUserBalance
 * - addBalance
 * - calculateDiscountTier
 * - getPricingForUser
 * - purchasePlacement validation
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

// Mock WordPress service
jest.mock('../../backend/services/wordpress.service', () => ({
  publishArticle: jest.fn().mockResolvedValue({ success: true, post_id: 123 }),
  getSiteById: jest.fn().mockResolvedValue({ id: 1, site_url: 'https://example.com' })
}));

// Mock logger
jest.mock('../../backend/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

const billingService = require('../../backend/services/billing.service');

describe('Billing Service', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockPool.connect.mockResolvedValue(mockClient);
  });

  describe('getUserBalance', () => {
    it('should return user balance data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          username: 'testuser',
          balance: '150.00',
          total_spent: '500.00',
          current_discount: 15,
          tier_name: 'Silver',
          discount_percentage: 15
        }]
      });

      const result = await billingService.getUserBalance(1);

      expect(result).toBeDefined();
      expect(result.balance).toBe('150.00');
      expect(result.total_spent).toBe('500.00');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should throw error for non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(billingService.getUserBalance(999))
        .rejects.toThrow('User not found');
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(billingService.getUserBalance(1))
        .rejects.toThrow('Database connection failed');
    });
  });

  describe('calculateDiscountTier', () => {
    it('should return 0% for new users', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await billingService.calculateDiscountTier(0);

      expect(result.discount).toBe(0);
      expect(result.tier).toBe('Стандарт');
    });

    it('should return correct tier for $500 spent', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ discount_percentage: 15, tier_name: 'Silver' }]
      });

      const result = await billingService.calculateDiscountTier(500);

      expect(result.discount).toBe(15);
      expect(result.tier).toBe('Silver');
    });

    it('should return highest tier for $5000+', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ discount_percentage: 30, tier_name: 'Diamond' }]
      });

      const result = await billingService.calculateDiscountTier(5000);

      expect(result.discount).toBe(30);
      expect(result.tier).toBe('Diamond');
    });
  });

  describe('getDiscountTiers', () => {
    it('should return all discount tiers', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { min_spent: 0, discount_percentage: 0, tier_name: 'Стандарт' },
          { min_spent: 100, discount_percentage: 10, tier_name: 'Bronze' },
          { min_spent: 500, discount_percentage: 15, tier_name: 'Silver' },
          { min_spent: 1000, discount_percentage: 20, tier_name: 'Gold' },
          { min_spent: 2500, discount_percentage: 25, tier_name: 'Platinum' },
          { min_spent: 5000, discount_percentage: 30, tier_name: 'Diamond' }
        ]
      });

      const result = await billingService.getDiscountTiers();

      expect(result).toHaveLength(6);
      expect(result[0].tier_name).toBe('Стандарт');
      expect(result[5].tier_name).toBe('Diamond');
    });
  });

  describe('addBalance', () => {
    it('should add balance successfully', async () => {
      // addBalance uses pool.connect() for transaction
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, balance: '100.00' }] }) // SELECT user FOR UPDATE
        .mockResolvedValueOnce({}) // UPDATE balance
        .mockResolvedValueOnce({}) // INSERT transaction
        .mockResolvedValueOnce({}) // INSERT notification
        .mockResolvedValueOnce({}); // COMMIT

      const result = await billingService.addBalance(1, 50, 'Test deposit');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(150);
      expect(result.amount).toBe(50);
    });

    it('should throw error for non-existent user', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT user - empty
        .mockResolvedValueOnce({}); // ROLLBACK (handled in catch)

      await expect(billingService.addBalance(999, 50, 'Test deposit'))
        .rejects.toThrow('User not found');
    });

    it('should rollback on database error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Database error'));

      await expect(billingService.addBalance(1, 50, 'Test deposit'))
        .rejects.toThrow('Database error');

      // Verify rollback was called
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('getPricingForUser', () => {
    it('should return pricing with no discount for new user', async () => {
      // getPricingForUser calls getUserBalance which calls query, then getDiscountTiers
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            username: 'testuser',
            balance: '100.00',
            total_spent: '0',
            current_discount: 0,
            tier_name: 'Стандарт',
            discount_percentage: 0
          }]
        })
        .mockResolvedValueOnce({
          rows: [
            { tier_name: 'Стандарт', min_spent: 0, discount_percentage: 0 }
          ]
        });

      const result = await billingService.getPricingForUser(1);

      expect(result).toHaveProperty('link');
      expect(result).toHaveProperty('article');
      expect(result).toHaveProperty('renewal');
      // Base price is LINK_HOMEPAGE = 25.00
      expect(result.link.basePrice).toBe(25.00);
      expect(result.link.discount).toBe(0);
      expect(result.link.finalPrice).toBe(25.00);
    });

    it('should apply 15% discount for Silver tier', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            username: 'testuser',
            balance: '500.00',
            total_spent: '500.00',
            current_discount: 15,
            tier_name: 'Silver',
            discount_percentage: 15
          }]
        })
        .mockResolvedValueOnce({
          rows: [
            { tier_name: 'Silver', min_spent: 500, discount_percentage: 15 }
          ]
        });

      const result = await billingService.getPricingForUser(1);

      expect(result.link.discount).toBe(15);
      // 25.00 * 0.85 = 21.25
      expect(result.link.finalPrice).toBeCloseTo(21.25, 2);
      // 15.00 * 0.85 = 12.75
      expect(result.article.finalPrice).toBeCloseTo(12.75, 2);
    });

    it('should apply 30% discount for Diamond tier', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            username: 'testuser',
            balance: '1000.00',
            total_spent: '5000.00',
            current_discount: 30,
            tier_name: 'Diamond',
            discount_percentage: 30
          }]
        })
        .mockResolvedValueOnce({
          rows: [
            { tier_name: 'Diamond', min_spent: 5000, discount_percentage: 30 }
          ]
        });

      const result = await billingService.getPricingForUser(1);

      expect(result.link.discount).toBe(30);
      // 25.00 * 0.70 = 17.50
      expect(result.link.finalPrice).toBeCloseTo(17.50, 2);
      // 15.00 * 0.70 = 10.50
      expect(result.article.finalPrice).toBeCloseTo(10.50, 2);
    });
  });

  describe('purchasePlacement', () => {
    describe('Validation', () => {
      it('should reject empty data', async () => {
        await expect(billingService.purchasePlacement({}))
          .rejects.toThrow();
      });

      it('should reject missing userId', async () => {
        await expect(billingService.purchasePlacement({
          projectId: 1,
          siteId: 1,
          type: 'link',
          contentIds: [1]
        })).rejects.toThrow();
      });

      it('should reject missing projectId', async () => {
        await expect(billingService.purchasePlacement({
          userId: 1,
          siteId: 1,
          type: 'link',
          contentIds: [1]
        })).rejects.toThrow();
      });

      it('should reject missing siteId', async () => {
        await expect(billingService.purchasePlacement({
          userId: 1,
          projectId: 1,
          type: 'link',
          contentIds: [1]
        })).rejects.toThrow();
      });

      it('should reject missing type', async () => {
        await expect(billingService.purchasePlacement({
          userId: 1,
          projectId: 1,
          siteId: 1,
          contentIds: [1]
        })).rejects.toThrow();
      });

      it('should reject empty contentIds', async () => {
        await expect(billingService.purchasePlacement({
          userId: 1,
          projectId: 1,
          siteId: 1,
          type: 'link',
          contentIds: []
        })).rejects.toThrow();
      });

      it('should reject invalid type', async () => {
        await expect(billingService.purchasePlacement({
          userId: 1,
          projectId: 1,
          siteId: 1,
          type: 'invalid',
          contentIds: [1]
        })).rejects.toThrow();
      });
    });

    describe('Site Type Validation', () => {
      it('should block article purchase on static_php site', async () => {
        // purchasePlacement query order:
        // 1. BEGIN
        // 2. SELECT * FROM users WHERE id = $1 FOR UPDATE
        // 3. SELECT * FROM projects WHERE id = $1 AND user_id = $2
        // 4. SELECT * FROM sites WHERE id = $1 FOR UPDATE
        // Then site_type validation happens
        mockClient.query
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({
            rows: [{ id: 1, balance: '100.00', total_spent: '0', username: 'test' }]
          }) // Get user FOR UPDATE
          .mockResolvedValueOnce({
            rows: [{ id: 1, user_id: 1, name: 'Test Project' }]
          }) // Validate project
          .mockResolvedValueOnce({
            rows: [{
              id: 1,
              site_type: 'static_php',
              site_url: 'https://static.example.com',
              site_name: 'Static Site',
              is_public: true,
              max_links: 10,
              used_links: 0
            }]
          }) // Get site - static_php type triggers error
          .mockResolvedValueOnce({}); // ROLLBACK

        await expect(billingService.purchasePlacement({
          userId: 1,
          projectId: 1,
          siteId: 1,
          type: 'article',
          contentIds: [1]
        })).rejects.toThrow(/static/i);

        // Verify rollback was called
        const calls = mockClient.query.mock.calls.map(c => c[0] || c);
        expect(calls.some(c => typeof c === 'string' && c.includes('ROLLBACK'))).toBe(true);
      });
    });

    // Note: Balance validation requires mocking 7+ database queries in sequence
    // since it happens late in the transaction flow. See purchasePlacement in
    // billing.service.js for the full query sequence. Integration tests are
    // more appropriate for testing this complete flow.
  });

  describe('Transaction Safety', () => {
    it('should rollback on database error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Database error'));

      await expect(billingService.purchasePlacement({
        userId: 1,
        projectId: 1,
        siteId: 1,
        type: 'link',
        contentIds: [1]
      })).rejects.toThrow();

      // Verify ROLLBACK was called
      const calls = mockClient.query.mock.calls.map(c => c[0] || c);
      expect(calls.some(c => typeof c === 'string' && c.includes('ROLLBACK'))).toBe(true);
    });

    it('should release client after transaction', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Some error'));

      await expect(billingService.purchasePlacement({
        userId: 1,
        projectId: 1,
        siteId: 1,
        type: 'link',
        contentIds: [1]
      })).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});

describe('PRICING Constants', () => {
  it('should export PRICING object', () => {
    expect(billingService.PRICING).toBeDefined();
  });

  it('should have correct LINK_HOMEPAGE price', () => {
    expect(billingService.PRICING.LINK_HOMEPAGE).toBe(25.00);
  });

  it('should have correct ARTICLE_GUEST_POST price', () => {
    expect(billingService.PRICING.ARTICLE_GUEST_POST).toBe(15.00);
  });

  it('should have OWNER_RATE discount', () => {
    expect(billingService.PRICING.OWNER_RATE).toBe(0.10);
  });

  it('should have BASE_RENEWAL_DISCOUNT', () => {
    expect(billingService.PRICING.BASE_RENEWAL_DISCOUNT).toBe(30);
  });

  it('should have RENEWAL_PERIOD_DAYS', () => {
    expect(billingService.PRICING.RENEWAL_PERIOD_DAYS).toBe(365);
  });

  it('should have MAX_TOTAL_DISCOUNT', () => {
    expect(billingService.PRICING.MAX_TOTAL_DISCOUNT).toBe(60);
  });
});
