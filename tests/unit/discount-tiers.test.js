/**
 * Discount Tier Calculation Tests
 *
 * Tests the discount tier logic based on total spent:
 * - 0-99.99: 0% (Стандарт)
 * - 100-499.99: 10% (Bronze)
 * - 500-999.99: 15% (Silver)
 * - 1000-2499.99: 20% (Gold)
 * - 2500-4999.99: 25% (Platinum)
 * - 5000+: 30% (Diamond)
 */

// Pure function for discount tier calculation (mirrors billing.service logic)
const DISCOUNT_TIERS = [
  { min: 0, max: 99.99, discount: 0, name: 'Стандарт' },
  { min: 100, max: 499.99, discount: 10, name: 'Bronze' },
  { min: 500, max: 999.99, discount: 15, name: 'Silver' },
  { min: 1000, max: 2499.99, discount: 20, name: 'Gold' },
  { min: 2500, max: 4999.99, discount: 25, name: 'Platinum' },
  { min: 5000, max: Infinity, discount: 30, name: 'Diamond' }
];

function getDiscountTier(totalSpent) {
  if (typeof totalSpent !== 'number' || isNaN(totalSpent)) {
    return DISCOUNT_TIERS[0];
  }
  if (totalSpent < 0) {
    return DISCOUNT_TIERS[0];
  }

  for (const tier of DISCOUNT_TIERS) {
    if (totalSpent >= tier.min && totalSpent <= tier.max) {
      return tier;
    }
  }
  return DISCOUNT_TIERS[DISCOUNT_TIERS.length - 1];
}

describe('Discount Tier Calculation', () => {
  describe('Standard Tier (0%)', () => {
    it('should return 0% for $0 spent', () => {
      const tier = getDiscountTier(0);
      expect(tier.discount).toBe(0);
      expect(tier.name).toBe('Стандарт');
    });

    it('should return 0% for $50 spent', () => {
      const tier = getDiscountTier(50);
      expect(tier.discount).toBe(0);
    });

    it('should return 0% for $99.99 spent (boundary)', () => {
      const tier = getDiscountTier(99.99);
      expect(tier.discount).toBe(0);
    });
  });

  describe('Bronze Tier (10%)', () => {
    it('should return 10% for $100 spent (threshold)', () => {
      const tier = getDiscountTier(100);
      expect(tier.discount).toBe(10);
      expect(tier.name).toBe('Bronze');
    });

    it('should return 10% for $250 spent', () => {
      const tier = getDiscountTier(250);
      expect(tier.discount).toBe(10);
    });

    it('should return 10% for $499.99 spent (boundary)', () => {
      const tier = getDiscountTier(499.99);
      expect(tier.discount).toBe(10);
    });
  });

  describe('Silver Tier (15%)', () => {
    it('should return 15% for $500 spent (threshold)', () => {
      const tier = getDiscountTier(500);
      expect(tier.discount).toBe(15);
      expect(tier.name).toBe('Silver');
    });

    it('should return 15% for $750 spent', () => {
      const tier = getDiscountTier(750);
      expect(tier.discount).toBe(15);
    });

    it('should return 15% for $999.99 spent (boundary)', () => {
      const tier = getDiscountTier(999.99);
      expect(tier.discount).toBe(15);
    });
  });

  describe('Gold Tier (20%)', () => {
    it('should return 20% for $1000 spent (threshold)', () => {
      const tier = getDiscountTier(1000);
      expect(tier.discount).toBe(20);
      expect(tier.name).toBe('Gold');
    });

    it('should return 20% for $1500 spent', () => {
      const tier = getDiscountTier(1500);
      expect(tier.discount).toBe(20);
    });

    it('should return 20% for $2499.99 spent (boundary)', () => {
      const tier = getDiscountTier(2499.99);
      expect(tier.discount).toBe(20);
    });
  });

  describe('Platinum Tier (25%)', () => {
    it('should return 25% for $2500 spent (threshold)', () => {
      const tier = getDiscountTier(2500);
      expect(tier.discount).toBe(25);
      expect(tier.name).toBe('Platinum');
    });

    it('should return 25% for $3500 spent', () => {
      const tier = getDiscountTier(3500);
      expect(tier.discount).toBe(25);
    });

    it('should return 25% for $4999.99 spent (boundary)', () => {
      const tier = getDiscountTier(4999.99);
      expect(tier.discount).toBe(25);
    });
  });

  describe('Diamond Tier (30%)', () => {
    it('should return 30% for $5000 spent (threshold)', () => {
      const tier = getDiscountTier(5000);
      expect(tier.discount).toBe(30);
      expect(tier.name).toBe('Diamond');
    });

    it('should return 30% for $10000 spent', () => {
      const tier = getDiscountTier(10000);
      expect(tier.discount).toBe(30);
    });

    it('should return 30% for very large amounts', () => {
      const tier = getDiscountTier(1000000);
      expect(tier.discount).toBe(30);
      expect(tier.name).toBe('Diamond');
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative values gracefully', () => {
      const tier = getDiscountTier(-100);
      expect(tier.discount).toBe(0);
      expect(tier.name).toBe('Стандарт');
    });

    it('should handle NaN gracefully', () => {
      const tier = getDiscountTier(NaN);
      expect(tier.discount).toBe(0);
    });

    it('should handle undefined gracefully', () => {
      const tier = getDiscountTier(undefined);
      expect(tier.discount).toBe(0);
    });

    it('should handle string numbers', () => {
      // parseFloat would handle this, but our function requires number
      const tier = getDiscountTier('100');
      expect(tier.discount).toBe(0); // Falls back to default
    });
  });

  describe('Tier Transitions', () => {
    const transitions = [
      { from: 99.99, to: 100, expectedFrom: 0, expectedTo: 10 },
      { from: 499.99, to: 500, expectedFrom: 10, expectedTo: 15 },
      { from: 999.99, to: 1000, expectedFrom: 15, expectedTo: 20 },
      { from: 2499.99, to: 2500, expectedFrom: 20, expectedTo: 25 },
      { from: 4999.99, to: 5000, expectedFrom: 25, expectedTo: 30 }
    ];

    transitions.forEach(({ from, to, expectedFrom, expectedTo }) => {
      it(`should transition from ${expectedFrom}% to ${expectedTo}% at $${to}`, () => {
        expect(getDiscountTier(from).discount).toBe(expectedFrom);
        expect(getDiscountTier(to).discount).toBe(expectedTo);
      });
    });
  });
});

describe('Discount Tier Names', () => {
  const tierNames = [
    { spent: 0, name: 'Стандарт' },
    { spent: 100, name: 'Bronze' },
    { spent: 500, name: 'Silver' },
    { spent: 1000, name: 'Gold' },
    { spent: 2500, name: 'Platinum' },
    { spent: 5000, name: 'Diamond' }
  ];

  tierNames.forEach(({ spent, name }) => {
    it(`should return tier name "${name}" for $${spent} spent`, () => {
      expect(getDiscountTier(spent).name).toBe(name);
    });
  });
});
