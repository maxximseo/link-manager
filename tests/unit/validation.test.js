/**
 * Validation Tests
 *
 * Tests input validation logic:
 * - URL validation
 * - Email validation
 * - Pagination limits
 * - ID validation
 * - Domain normalization
 */

// URL validation
function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Email validation
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Pagination validation
function validatePagination(params, options = {}) {
  const { maxLimit = 5000, defaultLimit = 20 } = options;

  let page = parseInt(params.page) || 1;
  let limit = parseInt(params.limit) || defaultLimit;

  if (page < 1) page = 1;
  if (limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  return { page, limit, offset: (page - 1) * limit };
}

// ID validation
function isValidId(id) {
  const numId = parseInt(id);
  return Number.isInteger(numId) && numId > 0;
}

// Domain normalization for static sites
function normalizeDomain(url) {
  if (!url || typeof url !== 'string') return null;

  try {
    // Handle URLs with protocol
    let domain;
    if (url.includes('://')) {
      const parsed = new URL(url);
      domain = parsed.hostname;
    } else {
      // Handle bare domains
      domain = url.split('/')[0];
    }

    // Remove www. prefix
    if (domain.startsWith('www.')) {
      domain = domain.substring(4);
    }

    return domain.toLowerCase();
  } catch {
    return null;
  }
}

describe('URL Validation', () => {
  describe('Valid URLs', () => {
    const validUrls = [
      'https://example.com',
      'http://example.com',
      'https://www.example.com',
      'https://sub.domain.example.com',
      'https://example.com/path',
      'https://example.com/path?query=1',
      'https://example.com:8080',
      'https://example.com/path/to/page.html'
    ];

    validUrls.forEach(url => {
      it(`should accept "${url}"`, () => {
        expect(isValidUrl(url)).toBe(true);
      });
    });
  });

  describe('Invalid URLs', () => {
    const invalidUrls = [
      '',
      null,
      undefined,
      'not-a-url',
      'example.com', // Missing protocol
      'ftp://example.com', // Wrong protocol
      '//example.com', // Protocol-relative
      'javascript:alert(1)', // XSS attempt
      'data:text/html,<script>alert(1)</script>'
    ];

    invalidUrls.forEach(url => {
      it(`should reject "${url}"`, () => {
        expect(isValidUrl(url)).toBe(false);
      });
    });
  });
});

describe('Email Validation', () => {
  describe('Valid Emails', () => {
    const validEmails = [
      'test@example.com',
      'user.name@example.com',
      'user+tag@example.com',
      'user123@example.org',
      'admin@sub.domain.co',
      'a@b.co'
    ];

    validEmails.forEach(email => {
      it(`should accept "${email}"`, () => {
        expect(isValidEmail(email)).toBe(true);
      });
    });
  });

  describe('Invalid Emails', () => {
    const invalidEmails = [
      '',
      null,
      undefined,
      'notanemail',
      'missing@domain',
      '@nodomain.com',
      'spaces in@email.com',
      'double@@at.com',
      'no.at.sign.com'
    ];

    invalidEmails.forEach(email => {
      it(`should reject "${email}"`, () => {
        expect(isValidEmail(email)).toBe(false);
      });
    });
  });
});

describe('Pagination Validation', () => {
  describe('Default Values', () => {
    it('should use default page=1 when not provided', () => {
      const result = validatePagination({});
      expect(result.page).toBe(1);
    });

    it('should use default limit=20 when not provided', () => {
      const result = validatePagination({});
      expect(result.limit).toBe(20);
    });

    it('should calculate correct offset', () => {
      const result = validatePagination({ page: 3, limit: 10 });
      expect(result.offset).toBe(20); // (3-1) * 10
    });
  });

  describe('Page Validation', () => {
    it('should convert page to integer', () => {
      const result = validatePagination({ page: '5' });
      expect(result.page).toBe(5);
    });

    it('should default to 1 for negative page', () => {
      const result = validatePagination({ page: -1 });
      expect(result.page).toBe(1);
    });

    it('should default to 1 for zero page', () => {
      const result = validatePagination({ page: 0 });
      expect(result.page).toBe(1);
    });

    it('should default to 1 for NaN page', () => {
      const result = validatePagination({ page: 'invalid' });
      expect(result.page).toBe(1);
    });
  });

  describe('Limit Validation', () => {
    it('should convert limit to integer', () => {
      const result = validatePagination({ limit: '50' });
      expect(result.limit).toBe(50);
    });

    it('should cap limit at maxLimit (5000)', () => {
      const result = validatePagination({ limit: 10000 });
      expect(result.limit).toBe(5000);
    });

    it('should use default for zero limit', () => {
      const result = validatePagination({ limit: 0 });
      expect(result.limit).toBe(20);
    });

    it('should use default for negative limit', () => {
      const result = validatePagination({ limit: -10 });
      expect(result.limit).toBe(20);
    });

    it('should accept custom maxLimit', () => {
      const result = validatePagination({ limit: 200 }, { maxLimit: 100 });
      expect(result.limit).toBe(100);
    });

    it('should accept custom defaultLimit', () => {
      const result = validatePagination({}, { defaultLimit: 50 });
      expect(result.limit).toBe(50);
    });
  });

  describe('Offset Calculation', () => {
    const testCases = [
      { page: 1, limit: 10, expectedOffset: 0 },
      { page: 2, limit: 10, expectedOffset: 10 },
      { page: 5, limit: 20, expectedOffset: 80 },
      { page: 10, limit: 100, expectedOffset: 900 }
    ];

    testCases.forEach(({ page, limit, expectedOffset }) => {
      it(`should calculate offset=${expectedOffset} for page=${page}, limit=${limit}`, () => {
        const result = validatePagination({ page, limit });
        expect(result.offset).toBe(expectedOffset);
      });
    });
  });
});

describe('ID Validation', () => {
  describe('Valid IDs', () => {
    const validIds = [1, 100, 999999, '1', '100'];

    validIds.forEach(id => {
      it(`should accept "${id}"`, () => {
        expect(isValidId(id)).toBe(true);
      });
    });
  });

  describe('Invalid IDs', () => {
    // Note: 1.5 is NOT included because parseInt(1.5) = 1 which is valid
    // This matches backend/utils/validators.js behavior (truncates floats)
    const invalidIds = [0, -1, '', null, undefined, 'abc', NaN, Infinity];

    invalidIds.forEach(id => {
      it(`should reject "${id}"`, () => {
        expect(isValidId(id)).toBe(false);
      });
    });
  });
});

describe('Domain Normalization', () => {
  describe('URL to Domain', () => {
    const testCases = [
      { input: 'https://example.com', expected: 'example.com' },
      { input: 'http://example.com', expected: 'example.com' },
      { input: 'https://www.example.com', expected: 'example.com' },
      { input: 'https://example.com/path', expected: 'example.com' },
      { input: 'https://example.com:8080', expected: 'example.com' },
      { input: 'https://sub.example.com', expected: 'sub.example.com' },
      { input: 'https://www.sub.example.com', expected: 'sub.example.com' }
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should normalize "${input}" to "${expected}"`, () => {
        expect(normalizeDomain(input)).toBe(expected);
      });
    });
  });

  describe('Bare Domain', () => {
    const testCases = [
      { input: 'example.com', expected: 'example.com' },
      { input: 'www.example.com', expected: 'example.com' },
      { input: 'example.com/path', expected: 'example.com' }
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should normalize "${input}" to "${expected}"`, () => {
        expect(normalizeDomain(input)).toBe(expected);
      });
    });
  });

  describe('Case Insensitivity', () => {
    it('should lowercase domain', () => {
      expect(normalizeDomain('https://EXAMPLE.COM')).toBe('example.com');
    });

    it('should lowercase mixed case', () => {
      expect(normalizeDomain('https://ExAmPlE.CoM')).toBe('example.com');
    });
  });

  describe('Invalid Inputs', () => {
    const invalidInputs = [null, undefined, '', 123];

    invalidInputs.forEach(input => {
      it(`should return null for "${input}"`, () => {
        expect(normalizeDomain(input)).toBeNull();
      });
    });
  });
});
