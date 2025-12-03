/**
 * Price Calculation Tests
 *
 * Tests price calculation logic with discounts:
 * - Base prices: link=0.10, article=5.00, renewal=0.05
 * - Discounts: 0%, 10%, 15%, 20%, 25%, 30%
 */

const BASE_PRICES = {
  link: 0.10,
  article: 5.00,
  renewal: 0.05
};

// Pure function for price calculation
function calculatePrice(basePrice, discountPercent) {
  if (typeof basePrice !== 'number' || typeof discountPercent !== 'number') {
    throw new Error('Invalid input types');
  }
  if (discountPercent < 0 || discountPercent > 100) {
    throw new Error('Discount must be between 0 and 100');
  }
  if (basePrice < 0) {
    throw new Error('Base price cannot be negative');
  }

  const finalPrice = basePrice * (1 - discountPercent / 100);
  // Round to 4 decimal places to avoid floating point issues
  return Math.round(finalPrice * 10000) / 10000;
}

// Calculate total for multiple items
function calculateTotal(items, discountPercent) {
  return items.reduce((total, item) => {
    const basePrice = BASE_PRICES[item.type] || 0;
    return total + calculatePrice(basePrice, discountPercent) * (item.quantity || 1);
  }, 0);
}

describe('Price Calculation', () => {
  describe('Link Prices (base: $0.10)', () => {
    const testCases = [
      { discount: 0, expected: 0.10 },
      { discount: 10, expected: 0.09 },
      { discount: 15, expected: 0.085 },
      { discount: 20, expected: 0.08 },
      { discount: 25, expected: 0.075 },
      { discount: 30, expected: 0.07 }
    ];

    testCases.forEach(({ discount, expected }) => {
      it(`should calculate ${discount}% discount: $${expected}`, () => {
        const price = calculatePrice(BASE_PRICES.link, discount);
        expect(price).toBeCloseTo(expected, 4);
      });
    });
  });

  describe('Article Prices (base: $5.00)', () => {
    const testCases = [
      { discount: 0, expected: 5.00 },
      { discount: 10, expected: 4.50 },
      { discount: 15, expected: 4.25 },
      { discount: 20, expected: 4.00 },
      { discount: 25, expected: 3.75 },
      { discount: 30, expected: 3.50 }
    ];

    testCases.forEach(({ discount, expected }) => {
      it(`should calculate ${discount}% discount: $${expected}`, () => {
        const price = calculatePrice(BASE_PRICES.article, discount);
        expect(price).toBeCloseTo(expected, 2);
      });
    });
  });

  describe('Renewal Prices (base: $0.05)', () => {
    const testCases = [
      { discount: 0, expected: 0.05 },
      { discount: 10, expected: 0.045 },
      { discount: 15, expected: 0.0425 },
      { discount: 20, expected: 0.04 },
      { discount: 25, expected: 0.0375 },
      { discount: 30, expected: 0.035 }
    ];

    testCases.forEach(({ discount, expected }) => {
      it(`should calculate ${discount}% discount: $${expected}`, () => {
        const price = calculatePrice(BASE_PRICES.renewal, discount);
        expect(price).toBeCloseTo(expected, 4);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle 0% discount (no discount)', () => {
      expect(calculatePrice(10, 0)).toBe(10);
    });

    it('should handle 100% discount (free)', () => {
      expect(calculatePrice(10, 100)).toBe(0);
    });

    it('should handle zero base price', () => {
      expect(calculatePrice(0, 15)).toBe(0);
    });

    it('should throw for negative discount', () => {
      expect(() => calculatePrice(10, -5)).toThrow('Discount must be between 0 and 100');
    });

    it('should throw for discount > 100', () => {
      expect(() => calculatePrice(10, 150)).toThrow('Discount must be between 0 and 100');
    });

    it('should throw for negative base price', () => {
      expect(() => calculatePrice(-10, 15)).toThrow('Base price cannot be negative');
    });

    it('should throw for invalid input types', () => {
      expect(() => calculatePrice('10', 15)).toThrow('Invalid input types');
      expect(() => calculatePrice(10, '15')).toThrow('Invalid input types');
    });
  });

  describe('Floating Point Precision', () => {
    it('should handle small decimal prices correctly', () => {
      // 0.10 * 0.85 should be exactly 0.085, not 0.08499999999...
      const price = calculatePrice(0.10, 15);
      expect(price).toBe(0.085);
    });

    it('should handle large number of decimal places', () => {
      const price = calculatePrice(0.01, 33);
      expect(price).toBeCloseTo(0.0067, 4);
    });
  });
});

describe('Total Calculation', () => {
  describe('Single Item', () => {
    it('should calculate single link total', () => {
      const total = calculateTotal([{ type: 'link', quantity: 1 }], 0);
      expect(total).toBeCloseTo(0.10, 2);
    });

    it('should calculate single article total', () => {
      const total = calculateTotal([{ type: 'article', quantity: 1 }], 0);
      expect(total).toBeCloseTo(5.00, 2);
    });
  });

  describe('Multiple Items', () => {
    it('should calculate 10 links total', () => {
      const total = calculateTotal([{ type: 'link', quantity: 10 }], 0);
      expect(total).toBeCloseTo(1.00, 2);
    });

    it('should calculate mixed items total', () => {
      const items = [
        { type: 'link', quantity: 5 },
        { type: 'article', quantity: 2 }
      ];
      const total = calculateTotal(items, 0);
      // 5 * 0.10 + 2 * 5.00 = 0.50 + 10.00 = 10.50
      expect(total).toBeCloseTo(10.50, 2);
    });

    it('should apply discount to all items', () => {
      const items = [
        { type: 'link', quantity: 10 },  // 10 * 0.09 = 0.90
        { type: 'article', quantity: 1 } // 1 * 4.50 = 4.50
      ];
      const total = calculateTotal(items, 10);
      expect(total).toBeCloseTo(5.40, 2);
    });
  });

  describe('Discount Impact on Total', () => {
    const items = [
      { type: 'link', quantity: 100 },
      { type: 'article', quantity: 10 }
    ];
    // Base total: 100 * 0.10 + 10 * 5.00 = 10 + 50 = $60

    it('should calculate 0% discount total', () => {
      expect(calculateTotal(items, 0)).toBeCloseTo(60.00, 2);
    });

    it('should calculate 10% discount total', () => {
      // 60 * 0.90 = 54
      expect(calculateTotal(items, 10)).toBeCloseTo(54.00, 2);
    });

    it('should calculate 20% discount total', () => {
      // 60 * 0.80 = 48
      expect(calculateTotal(items, 20)).toBeCloseTo(48.00, 2);
    });

    it('should calculate 30% discount total', () => {
      // 60 * 0.70 = 42
      expect(calculateTotal(items, 30)).toBeCloseTo(42.00, 2);
    });
  });
});

describe('Real-World Scenarios', () => {
  it('should calculate Bronze tier purchase (10% off)', () => {
    // User with $100+ spent, buying 5 links and 1 article
    const items = [
      { type: 'link', quantity: 5 },
      { type: 'article', quantity: 1 }
    ];
    const total = calculateTotal(items, 10);
    // 5 * 0.09 + 1 * 4.50 = 0.45 + 4.50 = 4.95
    expect(total).toBeCloseTo(4.95, 2);
  });

  it('should calculate Diamond tier purchase (30% off)', () => {
    // VIP user with $5000+ spent, buying 50 links
    const total = calculateTotal([{ type: 'link', quantity: 50 }], 30);
    // 50 * 0.07 = 3.50
    expect(total).toBeCloseTo(3.50, 2);
  });

  it('should calculate bulk link purchase savings', () => {
    const quantity = 1000;
    const regularTotal = calculateTotal([{ type: 'link', quantity }], 0);
    const diamondTotal = calculateTotal([{ type: 'link', quantity }], 30);

    // Regular: 1000 * 0.10 = $100
    // Diamond: 1000 * 0.07 = $70
    // Savings: $30 (30%)
    expect(regularTotal).toBeCloseTo(100, 2);
    expect(diamondTotal).toBeCloseTo(70, 2);
    expect(regularTotal - diamondTotal).toBeCloseTo(30, 2);
  });
});
