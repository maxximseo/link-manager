/**
 * Error Handler Utility Tests
 */

const {
  handleError,
  handleValidationError,
  handleNotFoundError,
  handleAuthError,
  handleForbiddenError,
  handleSmartError,
  isSafeErrorMessage
} = require('../../backend/utils/errorHandler');

// Mock logger
jest.mock('../../backend/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

describe('Error Handler Utility', () => {
  let mockRes;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('handleError', () => {
    it('should return only user message in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Database connection failed');

      handleError(mockRes, error, 'Operation failed', 500);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Operation failed'
      });
    });

    it('should include error details in development', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Database connection failed');

      handleError(mockRes, error, 'Operation failed', 500);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      const jsonCall = mockRes.json.mock.calls[0][0];
      expect(jsonCall.error).toBe('Operation failed');
      expect(jsonCall.details).toBe('Database connection failed');
      expect(jsonCall.stack).toBeDefined();
    });

    it('should use default status code 500', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Some error');

      handleError(mockRes, error, 'Failed');

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('should use default user message', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Some error');

      handleError(mockRes, error);

      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Operation failed'
      });
    });
  });

  describe('handleValidationError', () => {
    it('should return 400 status', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Invalid input');

      handleValidationError(mockRes, error, 'Validation failed');

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Validation failed'
      });
    });

    it('should use default message', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Invalid input');

      handleValidationError(mockRes, error);

      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid input'
      });
    });
  });

  describe('handleNotFoundError', () => {
    it('should return 404 status', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Not found');

      handleNotFoundError(mockRes, error, 'Item not found');

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Item not found'
      });
    });

    it('should use default message', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Not found');

      handleNotFoundError(mockRes, error);

      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Resource not found'
      });
    });
  });

  describe('handleAuthError', () => {
    it('should return 401 status', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Auth failed');

      handleAuthError(mockRes, error, 'Login failed');

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Login failed'
      });
    });

    it('should use default message', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Auth failed');

      handleAuthError(mockRes, error);

      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Authentication failed'
      });
    });
  });

  describe('handleForbiddenError', () => {
    it('should return 403 status', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Forbidden');

      handleForbiddenError(mockRes, error, 'Not allowed');

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Not allowed'
      });
    });

    it('should use default message', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Forbidden');

      handleForbiddenError(mockRes, error);

      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Access denied'
      });
    });
  });

  describe('isSafeErrorMessage', () => {
    it('should return true for business logic errors', () => {
      expect(isSafeErrorMessage(new Error('Insufficient balance'))).toBe(true);
      expect(isSafeErrorMessage(new Error('Site not found'))).toBe(true);
      expect(isSafeErrorMessage(new Error('Project not found'))).toBe(true);
      expect(isSafeErrorMessage(new Error('Invalid input'))).toBe(true);
      expect(isSafeErrorMessage(new Error('Maximum limit reached'))).toBe(true);
      expect(isSafeErrorMessage(new Error('Minimum value required'))).toBe(true);
      expect(isSafeErrorMessage(new Error('Already exists'))).toBe(true);
      expect(isSafeErrorMessage(new Error('Cannot delete used item'))).toBe(true);
      expect(isSafeErrorMessage(new Error('Duplicate entry'))).toBe(true);
      expect(isSafeErrorMessage(new Error('exhausted'))).toBe(true);
      expect(isSafeErrorMessage(new Error('does not belong to user'))).toBe(true);
      expect(isSafeErrorMessage(new Error('does not support articles'))).toBe(true);
      expect(isSafeErrorMessage(new Error('No links provided'))).toBe(true);
      expect(isSafeErrorMessage(new Error('No valid links found'))).toBe(true);
      expect(isSafeErrorMessage(new Error('All links are duplicates'))).toBe(true);
      expect(isSafeErrorMessage(new Error('Import failed: invalid format'))).toBe(true);
    });

    it('should return false for system errors', () => {
      expect(isSafeErrorMessage(new Error('ECONNREFUSED'))).toBe(false);
      expect(isSafeErrorMessage(new Error('Connection timeout'))).toBe(false);
      expect(isSafeErrorMessage(new Error('Internal server error'))).toBe(false);
      expect(isSafeErrorMessage(new Error('Syntax error at line 45'))).toBe(false);
    });

    it('should handle errors without message', () => {
      const error = {};
      expect(isSafeErrorMessage(error)).toBe(false);
    });

    it('should handle constraint violation errors', () => {
      expect(isSafeErrorMessage(new Error('violates unique constraint "users_pkey"'))).toBe(true);
      expect(isSafeErrorMessage(new Error('unique constraint violation'))).toBe(true);
    });
  });

  describe('handleSmartError', () => {
    it('should expose safe business error messages', () => {
      const error = new Error('Insufficient balance for purchase');

      handleSmartError(mockRes, error, 'Purchase failed', 400);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Insufficient balance for purchase'
      });
    });

    it('should hide unsafe system error messages', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('ECONNREFUSED - database connection failed');

      handleSmartError(mockRes, error, 'Service unavailable', 500);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Service unavailable'
      });
    });

    it('should use default fallback message', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Unknown system error');

      handleSmartError(mockRes, error);

      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Operation failed'
      });
    });

    it('should use default status code 500', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Unknown error');

      handleSmartError(mockRes, error);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});
