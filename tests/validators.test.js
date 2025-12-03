/**
 * Validators Tests
 *
 * Tests validation utilities from backend/utils/validators.js:
 * - Pagination validation
 * - ID validation
 * - Array length validation
 */

const {
  validatePagination,
  validateId,
  validateArrayLength
} = require('../backend/utils/validators');

describe('Pagination Validator', () => {
  it('should return defaults for empty input', () => {
    const result = validatePagination({});

    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('should parse valid page and limit', () => {
    const result = validatePagination({ page: '3', limit: '50' });

    expect(result.page).toBe(3);
    expect(result.limit).toBe(50);
  });

  it('should enforce minimum page of 1', () => {
    const result = validatePagination({ page: '-5' });

    expect(result.page).toBe(1);
  });

  it('should enforce minimum limit of 1', () => {
    const result = validatePagination({ limit: '0' });

    expect(result.limit).toBe(20); // Falls back to default since 0 < 1
  });

  it('should enforce maximum limit (throws error)', () => {
    expect(() => validatePagination({ limit: '10000' })).toThrow('Limit cannot exceed 5000');
  });

  it('should handle non-numeric values', () => {
    const result = validatePagination({ page: 'abc', limit: 'xyz' });

    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('should accept custom maxLimit option', () => {
    expect(() => validatePagination({ limit: '200' }, { maxLimit: 100 })).toThrow(
      'Limit cannot exceed 100'
    );
  });

  it('should accept custom defaultLimit option', () => {
    const result = validatePagination({}, { defaultLimit: 50 });
    expect(result.limit).toBe(50);
  });
});

describe('ID Validator', () => {
  it('should return valid integer ID', () => {
    expect(validateId('123')).toBe(123);
    expect(validateId(456)).toBe(456);
  });

  it('should throw error for invalid ID', () => {
    expect(() => validateId('abc')).toThrow('Invalid');
    expect(() => validateId(null)).toThrow('Invalid');
    expect(() => validateId(undefined)).toThrow('Invalid');
    expect(() => validateId(-1)).toThrow('Invalid');
    expect(() => validateId(0)).toThrow('Invalid');
  });

  it('should handle float values by truncating', () => {
    expect(validateId('123.45')).toBe(123);
  });

  it('should include param name in error message', () => {
    expect(() => validateId('abc', 'userId')).toThrow('Invalid userId');
  });
});

describe('Array Length Validator', () => {
  it('should accept valid arrays', () => {
    expect(() => validateArrayLength([1, 2, 3], 10)).not.toThrow();
    expect(() => validateArrayLength(['a'], 5)).not.toThrow();
  });

  it('should throw for non-arrays', () => {
    expect(() => validateArrayLength('not an array', 10)).toThrow('must be an array');
    expect(() => validateArrayLength(null, 10)).toThrow('must be an array');
  });

  it('should throw for empty arrays', () => {
    expect(() => validateArrayLength([], 10)).toThrow('cannot be empty');
  });

  it('should throw for arrays exceeding max length', () => {
    expect(() => validateArrayLength([1, 2, 3, 4, 5, 6], 5)).toThrow(
      'cannot contain more than 5 items'
    );
  });

  it('should include array name in error message', () => {
    expect(() => validateArrayLength([], 10, 'linkIds')).toThrow('linkIds cannot be empty');
  });
});

describe('SQL Injection Prevention', () => {
  // Note: SQL injection is prevented by parameterized queries, not ID validation
  // parseInt() extracts the numeric prefix, so "1; DROP TABLE" → 1
  // This is expected behavior - the actual protection is in database queries

  it('should parse leading numeric prefix (parseInt behavior)', () => {
    // These return valid IDs because parseInt extracts leading numbers
    expect(validateId('1; DROP TABLE users')).toBe(1);
    expect(validateId('1 OR 1=1')).toBe(1);
  });

  it('should reject completely non-numeric strings', () => {
    // These throw because no valid number can be parsed
    expect(() => validateId('DROP TABLE users')).toThrow('Invalid');
    expect(() => validateId('abc123')).toThrow('Invalid');
  });

  it('should accept string floats (truncates to integer)', () => {
    // parseInt("1.5") returns 1, which is valid
    expect(validateId('1.5')).toBe(1);
  });
});
