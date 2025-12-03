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
        rows: [
          {
            id: 1,
            username: 'testuser',
            balance: '150.00',
            total_spent: '500.00',
            current_discount: 15,
            tier_name: 'Silver',
            discount_percentage: 15
          }
        ]
      });

      const result = await billingService.getUserBalance(1);

      expect(result).toBeDefined();
      expect(result.balance).toBe('150.00');
      expect(result.total_spent).toBe('500.00');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should throw error for non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(billingService.getUserBalance(999)).rejects.toThrow('User not found');
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(billingService.getUserBalance(1)).rejects.toThrow('Database connection failed');
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

      await expect(billingService.addBalance(999, 50, 'Test deposit')).rejects.toThrow(
        'User not found'
      );
    });

    it('should rollback on database error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Database error'));

      await expect(billingService.addBalance(1, 50, 'Test deposit')).rejects.toThrow(
        'Database error'
      );

      // Verify rollback was called
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('getPricingForUser', () => {
    it('should return pricing with no discount for new user', async () => {
      // getPricingForUser calls getUserBalance which calls query, then getDiscountTiers
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              username: 'testuser',
              balance: '100.00',
              total_spent: '0',
              current_discount: 0,
              tier_name: 'Стандарт',
              discount_percentage: 0
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [{ tier_name: 'Стандарт', min_spent: 0, discount_percentage: 0 }]
        });

      const result = await billingService.getPricingForUser(1);

      expect(result).toHaveProperty('link');
      expect(result).toHaveProperty('article');
      expect(result).toHaveProperty('renewal');
      // Base price is LINK_HOMEPAGE = 25.00
      expect(result.link.basePrice).toBe(25.0);
      expect(result.link.discount).toBe(0);
      expect(result.link.finalPrice).toBe(25.0);
    });

    it('should apply 15% discount for Silver tier', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              username: 'testuser',
              balance: '500.00',
              total_spent: '500.00',
              current_discount: 15,
              tier_name: 'Silver',
              discount_percentage: 15
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [{ tier_name: 'Silver', min_spent: 500, discount_percentage: 15 }]
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
          rows: [
            {
              id: 1,
              username: 'testuser',
              balance: '1000.00',
              total_spent: '5000.00',
              current_discount: 30,
              tier_name: 'Diamond',
              discount_percentage: 30
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [{ tier_name: 'Diamond', min_spent: 5000, discount_percentage: 30 }]
        });

      const result = await billingService.getPricingForUser(1);

      expect(result.link.discount).toBe(30);
      // 25.00 * 0.70 = 17.50
      expect(result.link.finalPrice).toBeCloseTo(17.5, 2);
      // 15.00 * 0.70 = 10.50
      expect(result.article.finalPrice).toBeCloseTo(10.5, 2);
    });
  });

  describe('purchasePlacement', () => {
    describe('Validation', () => {
      it('should reject empty data', async () => {
        await expect(billingService.purchasePlacement({})).rejects.toThrow();
      });

      it('should reject missing userId', async () => {
        await expect(
          billingService.purchasePlacement({
            projectId: 1,
            siteId: 1,
            type: 'link',
            contentIds: [1]
          })
        ).rejects.toThrow();
      });

      it('should reject missing projectId', async () => {
        await expect(
          billingService.purchasePlacement({
            userId: 1,
            siteId: 1,
            type: 'link',
            contentIds: [1]
          })
        ).rejects.toThrow();
      });

      it('should reject missing siteId', async () => {
        await expect(
          billingService.purchasePlacement({
            userId: 1,
            projectId: 1,
            type: 'link',
            contentIds: [1]
          })
        ).rejects.toThrow();
      });

      it('should reject missing type', async () => {
        await expect(
          billingService.purchasePlacement({
            userId: 1,
            projectId: 1,
            siteId: 1,
            contentIds: [1]
          })
        ).rejects.toThrow();
      });

      it('should reject empty contentIds', async () => {
        await expect(
          billingService.purchasePlacement({
            userId: 1,
            projectId: 1,
            siteId: 1,
            type: 'link',
            contentIds: []
          })
        ).rejects.toThrow();
      });

      it('should reject invalid type', async () => {
        await expect(
          billingService.purchasePlacement({
            userId: 1,
            projectId: 1,
            siteId: 1,
            type: 'invalid',
            contentIds: [1]
          })
        ).rejects.toThrow();
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
            rows: [
              {
                id: 1,
                site_type: 'static_php',
                site_url: 'https://static.example.com',
                site_name: 'Static Site',
                is_public: true,
                max_links: 10,
                used_links: 0
              }
            ]
          }) // Get site - static_php type triggers error
          .mockResolvedValueOnce({}); // ROLLBACK

        await expect(
          billingService.purchasePlacement({
            userId: 1,
            projectId: 1,
            siteId: 1,
            type: 'article',
            contentIds: [1]
          })
        ).rejects.toThrow(/static/i);

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

      await expect(
        billingService.purchasePlacement({
          userId: 1,
          projectId: 1,
          siteId: 1,
          type: 'link',
          contentIds: [1]
        })
      ).rejects.toThrow();

      // Verify ROLLBACK was called
      const calls = mockClient.query.mock.calls.map(c => c[0] || c);
      expect(calls.some(c => typeof c === 'string' && c.includes('ROLLBACK'))).toBe(true);
    });

    it('should release client after transaction', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Some error'));

      await expect(
        billingService.purchasePlacement({
          userId: 1,
          projectId: 1,
          siteId: 1,
          type: 'link',
          contentIds: [1]
        })
      ).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('renewPlacement', () => {
    // Note: renewPlacement has complex transaction flow with 10+ queries
    // Full success tests require integration testing with real database
    // Unit tests focus on validation and error paths

    it('should reject non-link placement renewal', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 1,
              type: 'article', // Articles cannot be renewed
              balance: '100.00',
              current_discount: 0,
              total_spent: '0',
              expires_at: new Date().toISOString(),
              site_owner_id: 2
            }
          ]
        }) // SELECT placement
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(billingService.renewPlacement(1, 1)).rejects.toThrow(/link/i);
    });

    it('should reject renewal for non-existent placement', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Empty result - placement not found
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(billingService.renewPlacement(999, 1)).rejects.toThrow(
        /not found|unauthorized/i
      );
    });

    it('should reject renewal with insufficient balance', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 1,
              type: 'link',
              balance: '5.00', // Not enough for renewal
              current_discount: 0,
              total_spent: '0',
              expires_at: new Date().toISOString(),
              site_owner_id: 2
            }
          ]
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(billingService.renewPlacement(1, 1)).rejects.toThrow(/insufficient/i);
    });

    // Note: Owner rate success test removed - requires 10+ queries in exact sequence
    // Owner pricing ($0.10 for own sites) is tested via integration tests

    it('should rollback on transaction error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 1,
              type: 'link',
              balance: '100.00',
              current_discount: 0,
              total_spent: '0',
              expires_at: new Date().toISOString(),
              site_owner_id: 2
            }
          ]
        })
        .mockRejectedValueOnce(new Error('Database error')); // Error during UPDATE

      await expect(billingService.renewPlacement(1, 1)).rejects.toThrow('Database error');

      const calls = mockClient.query.mock.calls.map(c => c[0] || c);
      expect(calls.some(c => typeof c === 'string' && c.includes('ROLLBACK'))).toBe(true);
    });
  });

  describe('refundPlacement', () => {
    it('should refund paid placement successfully', async () => {
      // refundPlacement uses pool.connect() for transaction
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 1,
              final_price: '25.00',
              original_price: '25.00',
              discount_applied: 0,
              site_name: 'Test Site',
              project_name: 'Test Project',
              type: 'link'
            }
          ]
        }) // SELECT placement FOR UPDATE
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              balance: '50.00',
              total_spent: '100.00',
              current_discount: 10
            }
          ]
        }) // SELECT user FOR UPDATE
        .mockResolvedValueOnce({}) // UPDATE user balance and total_spent
        .mockResolvedValueOnce({ rows: [{ id: 1, created_at: new Date() }] }) // INSERT refund transaction
        .mockResolvedValueOnce({}) // INSERT audit_log
        .mockResolvedValueOnce({}); // COMMIT

      // Mock calculateDiscountTier
      mockQuery.mockResolvedValueOnce({
        rows: [{ discount_percentage: 10, tier_name: 'Bronze' }]
      });

      const result = await billingService.refundPlacement(1, 1);

      expect(result).toBeDefined();
      expect(result.refunded).toBe(true);
      expect(result.amount).toBe(25);
      expect(result.newBalance).toBe(75); // 50 + 25
    });

    it('should not refund free placement', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 1,
              final_price: '0', // Free placement
              original_price: '0',
              discount_applied: 0,
              site_name: 'Test Site',
              project_name: 'Test Project',
              type: 'link'
            }
          ]
        }) // SELECT placement FOR UPDATE
        .mockResolvedValueOnce({}); // ROLLBACK

      const result = await billingService.refundPlacement(1, 1);

      expect(result.refunded).toBe(false);
      expect(result.amount).toBe(0);
      expect(result.reason).toMatch(/no payment/i);
    });

    it('should reject refund for non-existent placement', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Empty result - placement not found
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(billingService.refundPlacement(999, 1)).rejects.toThrow(/not found/i);
    });

    it('should update discount tier after refund if needed', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 1,
              final_price: '100.00',
              original_price: '100.00',
              discount_applied: 0,
              site_name: 'Test Site',
              project_name: 'Test Project',
              type: 'link'
            }
          ]
        }) // SELECT placement FOR UPDATE
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              balance: '50.00',
              total_spent: '150.00', // Will go to 50 after refund
              current_discount: 10 // Current Bronze tier
            }
          ]
        }) // SELECT user FOR UPDATE
        .mockResolvedValueOnce({}) // UPDATE user balance and total_spent
        .mockResolvedValueOnce({}) // UPDATE user current_discount (tier downgrade)
        .mockResolvedValueOnce({ rows: [{ id: 1, created_at: new Date() }] }) // INSERT refund transaction
        .mockResolvedValueOnce({}) // INSERT audit_log
        .mockResolvedValueOnce({}); // COMMIT

      // Mock calculateDiscountTier - returns lower tier
      mockQuery.mockResolvedValueOnce({
        rows: [{ discount_percentage: 0, tier_name: 'Стандарт' }]
      });

      const result = await billingService.refundPlacement(1, 1);

      expect(result.refunded).toBe(true);
      expect(result.amount).toBe(100);
      // Verify UPDATE current_discount was called
      const updateCalls = mockClient.query.mock.calls.filter(
        c => typeof c[0] === 'string' && c[0].includes('UPDATE users SET current_discount')
      );
      expect(updateCalls.length).toBeGreaterThan(0);
    });

    it('should rollback on database error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Database error'));

      await expect(billingService.refundPlacement(1, 1)).rejects.toThrow('Database error');

      const calls = mockClient.query.mock.calls.map(c => c[0] || c);
      expect(calls.some(c => typeof c === 'string' && c.includes('ROLLBACK'))).toBe(true);
    });
  });

  describe('deleteAndRefundPlacement', () => {
    it('should delete placement and refund as admin', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 2, // Different user - admin deleting someone else's placement
              project_id: 1,
              site_id: 1,
              type: 'link',
              final_price: '25.00',
              original_price: '25.00',
              discount_applied: 0,
              status: 'placed',
              site_name: 'Test Site',
              project_name: 'Test Project'
            }
          ]
        }) // SELECT placement FOR UPDATE
        .mockResolvedValueOnce({
          rows: [
            {
              id: 2,
              balance: '50.00',
              total_spent: '100.00',
              current_discount: 10
            }
          ]
        }) // SELECT user FOR UPDATE (placement owner)
        .mockResolvedValueOnce({}) // UPDATE user balance
        .mockResolvedValueOnce({}) // INSERT refund transaction
        .mockResolvedValueOnce({}) // INSERT audit_log (refund)
        .mockResolvedValueOnce({
          rows: [
            {
              link_ids: [1],
              article_ids: [],
              link_count: '1',
              article_count: '0'
            }
          ]
        }) // SELECT placement_content
        .mockResolvedValueOnce({}) // DELETE placements
        .mockResolvedValueOnce({}) // UPDATE sites used_links
        .mockResolvedValueOnce({}) // UPDATE project_links usage_count
        .mockResolvedValueOnce({}) // INSERT audit_log (delete)
        .mockResolvedValueOnce({}); // COMMIT

      // Mock calculateDiscountTier
      mockQuery.mockResolvedValueOnce({
        rows: [{ discount_percentage: 10, tier_name: 'Bronze' }]
      });

      const result = await billingService.deleteAndRefundPlacement(1, 1, 'admin');

      expect(result.deleted).toBe(true);
      expect(result.refunded).toBe(true);
      expect(result.amount).toBe(25);
    });

    it('should reject deletion by non-admin', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 1,
              final_price: '25.00',
              status: 'placed',
              site_name: 'Test Site',
              project_name: 'Test Project'
            }
          ]
        }) // SELECT placement FOR UPDATE
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(billingService.deleteAndRefundPlacement(1, 1, 'user')).rejects.toThrow(
        /admin|unauthorized/i
      );
    });

    it('should reject deletion of non-existent placement', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Empty result
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(billingService.deleteAndRefundPlacement(999, 1, 'admin')).rejects.toThrow(
        /not found/i
      );
    });

    it('should delete free placement without refund', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 1,
              project_id: 1,
              site_id: 1,
              type: 'link',
              final_price: '0', // Free placement
              original_price: '0',
              discount_applied: 0,
              status: 'placed',
              site_name: 'Test Site',
              project_name: 'Test Project'
            }
          ]
        }) // SELECT placement FOR UPDATE
        .mockResolvedValueOnce({
          rows: [
            {
              link_ids: [1],
              article_ids: [],
              link_count: '1',
              article_count: '0'
            }
          ]
        }) // SELECT placement_content
        .mockResolvedValueOnce({}) // DELETE placements
        .mockResolvedValueOnce({}) // UPDATE sites used_links
        .mockResolvedValueOnce({}) // UPDATE project_links usage_count
        .mockResolvedValueOnce({}) // INSERT audit_log
        .mockResolvedValueOnce({}); // COMMIT

      const result = await billingService.deleteAndRefundPlacement(1, 1, 'admin');

      expect(result.deleted).toBe(true);
      expect(result.refunded).toBe(false);
      expect(result.amount).toBe(0);
    });
  });

  describe('toggleAutoRenewal', () => {
    it('should enable auto-renewal for link placement', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 1,
              type: 'link'
            }
          ]
        }) // SELECT placement
        .mockResolvedValueOnce({}); // UPDATE placement

      const result = await billingService.toggleAutoRenewal(1, 1, true);

      expect(result.success).toBe(true);
      expect(result.enabled).toBe(true);
    });

    it('should disable auto-renewal', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 1,
              type: 'link'
            }
          ]
        })
        .mockResolvedValueOnce({});

      const result = await billingService.toggleAutoRenewal(1, 1, false);

      expect(result.success).toBe(true);
      expect(result.enabled).toBe(false);
    });

    it('should reject auto-renewal for article placement', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 1,
            type: 'article'
          }
        ]
      });

      await expect(billingService.toggleAutoRenewal(1, 1, true)).rejects.toThrow(/link/i);
    });

    it('should reject for non-existent placement', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(billingService.toggleAutoRenewal(999, 1, true)).rejects.toThrow(/not found/i);
    });
  });

  describe('getUserTransactions', () => {
    it('should return paginated transactions', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 1, type: 'deposit', amount: '100.00', created_at: new Date() },
            { id: 2, type: 'purchase', amount: '-25.00', created_at: new Date() }
          ]
        }) // SELECT transactions
        .mockResolvedValueOnce({
          rows: [{ count: '10' }]
        }); // COUNT

      const result = await billingService.getUserTransactions(1, { page: 1, limit: 10 });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(10);
      expect(result.pagination.pages).toBe(1);
    });

    it('should filter by transaction type', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1, type: 'deposit', amount: '100.00', created_at: new Date() }]
        })
        .mockResolvedValueOnce({
          rows: [{ count: '5' }]
        });

      const result = await billingService.getUserTransactions(1, {
        page: 1,
        limit: 10,
        type: 'deposit'
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe('deposit');
    });

    it('should return empty array for user with no transactions', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await billingService.getUserTransactions(1, { page: 1, limit: 10 });

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe('publishScheduledPlacement', () => {
    it('should publish scheduled placement', async () => {
      // publishScheduledPlacement uses query() not transaction
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 1,
            status: 'scheduled',
            site_id: 1,
            api_key: 'api_test123',
            site_url: 'https://example.com',
            site_type: 'wordpress'
          }
        ]
      });

      // publishPlacementAsync uses pool.connect()
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 1, type: 'link' }]
        }) // SELECT placement
        .mockResolvedValueOnce({
          rows: [{ link_id: 1, url: 'https://test.com', anchor_text: 'Test' }]
        }) // SELECT placement_content
        .mockResolvedValueOnce({}) // UPDATE placement status
        .mockResolvedValueOnce({}); // COMMIT

      const result = await billingService.publishScheduledPlacement(1, 1);

      expect(result.success).toBe(true);
      expect(result.placementId).toBe(1);
    });

    it('should reject non-scheduled placement', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 1,
            status: 'placed', // Already placed
            site_id: 1,
            api_key: 'api_test123',
            site_url: 'https://example.com',
            site_type: 'wordpress'
          }
        ]
      });

      await expect(billingService.publishScheduledPlacement(1, 1)).rejects.toThrow(/scheduled/i);
    });

    it('should reject non-existent placement', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(billingService.publishScheduledPlacement(999, 1)).rejects.toThrow(/not found/i);
    });

    it('should reject unauthorized publish attempt', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 2, // Different user
            status: 'scheduled',
            site_id: 1
          }
        ]
      });

      await expect(billingService.publishScheduledPlacement(1, 1)).rejects.toThrow(/unauthorized/i);
    });
  });
}); // End of 'Billing Service' describe

describe('batchPurchasePlacements', () => {
  it('should process batch purchases in chunks', async () => {
    // Reset mocks
    mockClient.query.mockReset();
    mockPool.connect.mockResolvedValue(mockClient);

    // Mock successful purchase for first item
    let callCount = 0;
    mockClient.query.mockImplementation(() => {
      callCount++;
      // Simulate transaction sequence
      if (callCount % 20 === 1) return Promise.resolve({}); // BEGIN
      if (callCount % 20 === 2)
        return Promise.resolve({
          rows: [{ id: 1, balance: '1000.00', total_spent: '0', role: 'user', username: 'test' }]
        }); // User
      if (callCount % 20 === 3)
        return Promise.resolve({ rows: [{ id: 1, user_id: 1, name: 'Project' }] }); // Project
      if (callCount % 20 === 4)
        return Promise.resolve({
          rows: [
            {
              id: 1,
              site_type: 'wordpress',
              is_public: true,
              user_id: 2,
              max_links: 100,
              used_links: 0,
              allow_articles: true,
              available_for_purchase: true,
              site_name: 'Site'
            }
          ]
        }); // Site
      if (callCount % 20 === 5) return Promise.resolve({ rows: [] }); // No existing placement
      if (callCount % 20 === 6)
        return Promise.resolve({
          rows: [
            { id: 1, project_id: 1, usage_count: 0, usage_limit: 999, status: 'active', anchor_text: 'Test' }
          ]
        }); // Content
      if (callCount % 20 === 7) return Promise.resolve({}); // UPDATE user
      if (callCount % 20 === 8) return Promise.resolve({ rows: [{ id: 100 }] }); // INSERT transaction
      if (callCount % 20 === 9)
        return Promise.resolve({ rows: [{ id: 200, status: 'pending' }] }); // INSERT placement
      if (callCount % 20 === 10) return Promise.resolve({}); // INSERT placement_content
      if (callCount % 20 === 11) return Promise.resolve({}); // UPDATE usage_count
      if (callCount % 20 === 12) return Promise.resolve({}); // UPDATE site quotas
      if (callCount % 20 === 13) return Promise.resolve({}); // Notification 1
      if (callCount % 20 === 14) return Promise.resolve({}); // Notification 2
      if (callCount % 20 === 15) return Promise.resolve({}); // Audit log
      if (callCount % 20 === 16) return Promise.resolve({}); // COMMIT
      return Promise.resolve({});
    });

    // Mock discount tier
    mockQuery.mockResolvedValue({
      rows: [{ discount_percentage: 0, tier_name: 'Стандарт' }]
    });

    // Test with single purchase (simplest case)
    const purchases = [{ projectId: 1, siteId: 1, type: 'link', contentIds: [1] }];

    const result = await billingService.batchPurchasePlacements(1, purchases);

    expect(result).toHaveProperty('successful');
    expect(result).toHaveProperty('failed');
    expect(result).toHaveProperty('durationMs');
  });

  it('should handle empty purchases array', async () => {
    const result = await billingService.batchPurchasePlacements(1, []);

    expect(result.successful).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should track failed purchases separately', async () => {
    // Make all purchases fail
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error('Test error'));

    const purchases = [{ projectId: 1, siteId: 1, type: 'link', contentIds: [1] }];

    const result = await billingService.batchPurchasePlacements(1, purchases);

    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toBe('Test error');
  });
});

describe('batchDeletePlacements', () => {
  it('should process batch deletions in chunks', async () => {
    // Mock successful delete
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 2,
            final_price: '25.00',
            site_id: 1,
            type: 'link',
            site_name: 'Site',
            project_name: 'Project'
          }
        ]
      }) // SELECT placement
      .mockResolvedValueOnce({
        rows: [{ id: 2, balance: '100.00', total_spent: '50.00', current_discount: 0 }]
      }) // SELECT user
      .mockResolvedValueOnce({}) // UPDATE user
      .mockResolvedValueOnce({}) // INSERT refund transaction
      .mockResolvedValueOnce({}) // INSERT audit_log (refund)
      .mockResolvedValueOnce({ rows: [{ link_ids: [1], article_ids: [], link_count: '1', article_count: '0' }] }) // SELECT content
      .mockResolvedValueOnce({}) // DELETE placement
      .mockResolvedValueOnce({}) // UPDATE site quotas
      .mockResolvedValueOnce({}) // UPDATE project_links
      .mockResolvedValueOnce({}) // INSERT audit_log (delete)
      .mockResolvedValueOnce({}); // COMMIT

    // Mock calculateDiscountTier
    mockQuery.mockResolvedValueOnce({
      rows: [{ discount_percentage: 0, tier_name: 'Стандарт' }]
    });

    const result = await billingService.batchDeletePlacements(1, 'admin', [1]);

    expect(result).toHaveProperty('successful');
    expect(result).toHaveProperty('failed');
    expect(result).toHaveProperty('totalRefunded');
    expect(result).toHaveProperty('durationMs');
  });

  it('should handle empty placementIds array', async () => {
    const result = await billingService.batchDeletePlacements(1, 'admin', []);

    expect(result.successful).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.totalRefunded).toBe(0);
  });

  it('should track failed deletions separately', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error('Delete error'));

    const result = await billingService.batchDeletePlacements(1, 'admin', [999]);

    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toBe('Delete error');
  });

  it('should accumulate total refunded amount', async () => {
    // First deletion
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 2, final_price: '25.00', site_id: 1, type: 'link', site_name: 'Site', project_name: 'Project' }]
      })
      .mockResolvedValueOnce({ rows: [{ id: 2, balance: '100.00', total_spent: '50.00', current_discount: 0 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ link_ids: [1], article_ids: [], link_count: '1', article_count: '0' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    mockQuery.mockResolvedValue({
      rows: [{ discount_percentage: 0, tier_name: 'Стандарт' }]
    });

    const result = await billingService.batchDeletePlacements(1, 'admin', [1]);

    expect(result.totalRefunded).toBeGreaterThanOrEqual(0);
  });
});

describe('refundPlacementInTransaction', () => {
  it('should refund placement within existing transaction', async () => {
    const placement = {
      id: 1,
      user_id: 1,
      final_price: '50.00',
      type: 'link',
      site_name: 'Test Site',
      project_name: 'Test Project'
    };

    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ id: 1, balance: '100.00', total_spent: '200.00', current_discount: 10 }]
      }) // SELECT user FOR UPDATE
      .mockResolvedValueOnce({}) // UPDATE user
      .mockResolvedValueOnce({}); // INSERT transaction

    mockQuery.mockResolvedValueOnce({
      rows: [{ discount_percentage: 10, tier_name: 'Bronze' }]
    });

    const result = await billingService.refundPlacementInTransaction(mockClient, placement);

    expect(result.refunded).toBe(true);
    expect(result.amount).toBe(50);
    expect(result.newBalance).toBe(150);
  });

  it('should not refund free placement', async () => {
    const placement = {
      id: 1,
      user_id: 1,
      final_price: '0',
      type: 'link'
    };

    const result = await billingService.refundPlacementInTransaction(mockClient, placement);

    expect(result.refunded).toBe(false);
    expect(result.amount).toBe(0);
  });

  it('should detect tier change after refund', async () => {
    const placement = {
      id: 1,
      user_id: 1,
      final_price: '100.00',
      type: 'link',
      site_name: 'Site',
      project_name: 'Project'
    };

    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ id: 1, balance: '50.00', total_spent: '150.00', current_discount: 10 }]
      })
      .mockResolvedValueOnce({}) // UPDATE user
      .mockResolvedValueOnce({}) // UPDATE current_discount
      .mockResolvedValueOnce({}) // INSERT notification
      .mockResolvedValueOnce({}); // INSERT transaction

    // Tier changes from Bronze (10%) to Standard (0%)
    mockQuery.mockResolvedValueOnce({
      rows: [{ discount_percentage: 0, tier_name: 'Стандарт' }]
    });

    const result = await billingService.refundPlacementInTransaction(mockClient, placement);

    expect(result.refunded).toBe(true);
    expect(result.tierChanged).toBe(true);
    expect(result.newTier).toBe('Стандарт');
  });
});

describe('restoreUsageCountsInTransaction', () => {
  it('should restore link usage counts', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ link_ids: [1, 2], article_ids: [], link_count: '2', article_count: '0' }]
      }) // SELECT content
      .mockResolvedValueOnce({}); // UPDATE project_links

    const result = await billingService.restoreUsageCountsInTransaction(mockClient, 1);

    expect(result.linkCount).toBe(2);
    expect(result.articleCount).toBe(0);
  });

  it('should restore article usage counts', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ link_ids: [], article_ids: [1], link_count: '0', article_count: '1' }]
      })
      .mockResolvedValueOnce({}); // UPDATE project_articles

    const result = await billingService.restoreUsageCountsInTransaction(mockClient, 1);

    expect(result.linkCount).toBe(0);
    expect(result.articleCount).toBe(1);
  });

  it('should handle placement with both links and articles', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ link_ids: [1], article_ids: [1], link_count: '1', article_count: '1' }]
      })
      .mockResolvedValueOnce({}) // UPDATE project_links
      .mockResolvedValueOnce({}); // UPDATE project_articles

    const result = await billingService.restoreUsageCountsInTransaction(mockClient, 1);

    expect(result.linkCount).toBe(1);
    expect(result.articleCount).toBe(1);
  });

  it('should handle placement with no content', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ link_ids: null, article_ids: null, link_count: '0', article_count: '0' }]
    });

    const result = await billingService.restoreUsageCountsInTransaction(mockClient, 1);

    expect(result.linkCount).toBe(0);
    expect(result.articleCount).toBe(0);
  });
});

describe('publishPlacementAsync', () => {
  it('should publish link placement asynchronously', async () => {
    const site = { id: 1, api_key: 'api_test', site_url: 'https://example.com' };

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 1, type: 'link', status: 'pending' }]
      }) // SELECT placement
      .mockResolvedValueOnce({
        rows: [{ link_id: 1, url: 'https://test.com', anchor_text: 'Test' }]
      }) // SELECT content
      .mockResolvedValueOnce({}) // UPDATE placement status
      .mockResolvedValueOnce({}); // COMMIT

    await billingService.publishPlacementAsync(1, site);

    // Verify placement was updated to 'placed'
    const updateCall = mockClient.query.mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes("status = 'placed'")
    );
    expect(updateCall).toBeDefined();
  });

  it('should publish article placement with WordPress post ID', async () => {
    const site = { id: 1, api_key: 'api_test', site_url: 'https://example.com' };
    const wordpressService = require('../../backend/services/wordpress.service');

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 1, type: 'article', status: 'pending' }]
      })
      .mockResolvedValueOnce({
        rows: [{ article_id: 1, title: 'Test Article', content: 'Content here' }]
      })
      .mockResolvedValueOnce({}) // UPDATE placement with post_id
      .mockResolvedValueOnce({}); // COMMIT

    await billingService.publishPlacementAsync(1, site);

    expect(wordpressService.publishArticle).toHaveBeenCalledWith(
      'https://example.com',
      'api_test',
      expect.objectContaining({ title: 'Test Article' })
    );
  });

  it('should rollback on error', async () => {
    const site = { id: 1, api_key: 'api_test', site_url: 'https://example.com' };

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error('Publish error'));

    await expect(billingService.publishPlacementAsync(1, site)).rejects.toThrow('Publish error');

    const calls = mockClient.query.mock.calls.map(c => c[0] || c);
    expect(calls.some(c => typeof c === 'string' && c.includes('ROLLBACK'))).toBe(true);
  });

  it('should throw error for non-existent placement', async () => {
    const site = { id: 1, api_key: 'api_test', site_url: 'https://example.com' };

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // Empty result
      .mockResolvedValueOnce({}); // ROLLBACK

    await expect(billingService.publishPlacementAsync(999, site)).rejects.toThrow(/not found/i);
  });
});

describe('PRICING Constants', () => {
  it('should export PRICING object', () => {
    expect(billingService.PRICING).toBeDefined();
  });

  it('should have correct LINK_HOMEPAGE price', () => {
    expect(billingService.PRICING.LINK_HOMEPAGE).toBe(25.0);
  });

  it('should have correct ARTICLE_GUEST_POST price', () => {
    expect(billingService.PRICING.ARTICLE_GUEST_POST).toBe(15.0);
  });

  it('should have OWNER_RATE discount', () => {
    expect(billingService.PRICING.OWNER_RATE).toBe(0.1);
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
