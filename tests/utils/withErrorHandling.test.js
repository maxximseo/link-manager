/**
 * withErrorHandling Utility Tests
 */

const { withErrorHandling } = require('../../backend/utils/withErrorHandling');

// Mock logger
jest.mock('../../backend/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

const logger = require('../../backend/config/logger');

describe('withErrorHandling Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('withErrorHandling', () => {
    it('should return result of successful function', async () => {
      const fn = async () => 'success';
      const wrappedFn = withErrorHandling(fn, 'testFunction');

      const result = await wrappedFn();

      expect(result).toBe('success');
    });

    it('should pass arguments to wrapped function', async () => {
      const fn = async (a, b) => a + b;
      const wrappedFn = withErrorHandling(fn, 'addFunction');

      const result = await wrappedFn(2, 3);

      expect(result).toBe(5);
    });

    it('should log error and rethrow on failure', async () => {
      const error = new Error('Test error');
      const fn = async () => {
        throw error;
      };
      const wrappedFn = withErrorHandling(fn, 'failingFunction');

      await expect(wrappedFn()).rejects.toThrow('Test error');
      expect(logger.error).toHaveBeenCalledWith('Error in failingFunction:', error);
    });

    it('should work with sync functions', async () => {
      const fn = () => 'sync result';
      const wrappedFn = withErrorHandling(fn, 'syncFunction');

      const result = await wrappedFn();

      expect(result).toBe('sync result');
    });

    it('should preserve error type when rethrowing', async () => {
      class CustomError extends Error {
        constructor(message) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const fn = async () => {
        throw new CustomError('Custom error message');
      };
      const wrappedFn = withErrorHandling(fn, 'customErrorFunction');

      try {
        await wrappedFn();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error.name).toBe('CustomError');
        expect(error.message).toBe('Custom error message');
      }
    });

    it('should handle functions returning promises', async () => {
      const fn = () => Promise.resolve({ data: 'test' });
      const wrappedFn = withErrorHandling(fn, 'promiseFunction');

      const result = await wrappedFn();

      expect(result).toEqual({ data: 'test' });
    });

    it('should handle functions returning rejected promises', async () => {
      const error = new Error('Rejected promise');
      const fn = () => Promise.reject(error);
      const wrappedFn = withErrorHandling(fn, 'rejectedPromiseFunction');

      await expect(wrappedFn()).rejects.toThrow('Rejected promise');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle multiple arguments', async () => {
      const fn = async (a, b, c, d) => [a, b, c, d];
      const wrappedFn = withErrorHandling(fn, 'multiArgFunction');

      const result = await wrappedFn(1, 2, 3, 4);

      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('should handle no arguments', async () => {
      const fn = async () => 'no args';
      const wrappedFn = withErrorHandling(fn, 'noArgFunction');

      const result = await wrappedFn();

      expect(result).toBe('no args');
    });

    it('should handle undefined return', async () => {
      const fn = async () => {};
      const wrappedFn = withErrorHandling(fn, 'undefinedReturnFunction');

      const result = await wrappedFn();

      expect(result).toBeUndefined();
    });

    it('should handle null return', async () => {
      const fn = async () => null;
      const wrappedFn = withErrorHandling(fn, 'nullReturnFunction');

      const result = await wrappedFn();

      expect(result).toBeNull();
    });

    it('should include function name in error log', async () => {
      const fn = async () => {
        throw new Error('Failed');
      };
      const wrappedFn = withErrorHandling(fn, 'mySpecificFunction');

      await expect(wrappedFn()).rejects.toThrow();
      expect(logger.error).toHaveBeenCalledWith('Error in mySpecificFunction:', expect.any(Error));
    });
  });
});
