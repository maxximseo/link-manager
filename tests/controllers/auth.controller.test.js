/**
 * Auth Controller Tests
 */

const authController = require('../../backend/controllers/auth.controller');

// Mock dependencies
jest.mock('../../backend/services/auth.service');
jest.mock('../../backend/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

const authService = require('../../backend/services/auth.service');

describe('Auth Controller', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = {
      body: {},
      params: {},
      user: { id: 1, username: 'testuser', role: 'user' }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should return 400 if username is missing', async () => {
      mockReq.body = { password: 'password123' };

      await authController.login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Username and password are required'
      });
    });

    it('should return 400 if password is missing', async () => {
      mockReq.body = { username: 'testuser' };

      await authController.login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Username and password are required'
      });
    });

    it('should return 401 if authentication fails', async () => {
      mockReq.body = { username: 'testuser', password: 'wrongpassword' };
      authService.authenticateUser.mockResolvedValue({
        success: false,
        error: 'Invalid credentials'
      });

      await authController.login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('should return token on successful login', async () => {
      mockReq.body = { username: 'testuser', password: 'password123' };
      authService.authenticateUser.mockResolvedValue({
        success: true,
        token: 'jwt-token-123',
        refreshToken: 'refresh-token-456',
        expiresIn: 604800,
        user: { id: 1, username: 'testuser', role: 'user' }
      });

      await authController.login(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        token: 'jwt-token-123',
        refreshToken: 'refresh-token-456',
        expiresIn: 604800,
        user: { id: 1, username: 'testuser', role: 'user' }
      });
    });

    it('should return 500 on service error', async () => {
      mockReq.body = { username: 'testuser', password: 'password123' };
      authService.authenticateUser.mockRejectedValue(new Error('Database error'));

      await authController.login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Server error during login' });
    });
  });

  describe('register', () => {
    it('should return 400 if username is missing', async () => {
      mockReq.body = { password: 'password123', confirmPassword: 'password123' };

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Username and password are required'
      });
    });

    it('should return 400 if password is missing', async () => {
      mockReq.body = { username: 'testuser' };

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 if passwords do not match', async () => {
      mockReq.body = {
        username: 'testuser',
        password: 'password123',
        confirmPassword: 'different'
      };

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Passwords do not match' });
    });

    it('should return 400 if password is too short', async () => {
      mockReq.body = {
        username: 'testuser',
        password: 'short',
        confirmPassword: 'short'
      };

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Password must be at least 8 characters long'
      });
    });

    it('should return 400 if username is too short', async () => {
      mockReq.body = {
        username: 'ab',
        password: 'password123',
        confirmPassword: 'password123'
      };

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Username must be at least 3 characters long'
      });
    });

    it('should return 400 if username has invalid characters', async () => {
      mockReq.body = {
        username: 'test@user!',
        password: 'password123',
        confirmPassword: 'password123'
      };

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Username can only contain letters, numbers, and underscores'
      });
    });

    it('should return 400 if email format is invalid', async () => {
      mockReq.body = {
        username: 'testuser',
        email: 'invalid-email',
        password: 'password123',
        confirmPassword: 'password123'
      };

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid email format' });
    });

    it('should register user successfully', async () => {
      mockReq.body = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'password123'
      };
      authService.registerUser.mockResolvedValue({
        success: true,
        message: 'User registered successfully',
        user: { id: 1, username: 'testuser' }
      });

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'User registered successfully',
        user: { id: 1, username: 'testuser' }
      });
    });

    it('should return 400 if registration fails', async () => {
      mockReq.body = {
        username: 'existinguser',
        password: 'password123',
        confirmPassword: 'password123'
      };
      authService.registerUser.mockResolvedValue({
        success: false,
        error: 'Username already exists'
      });

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Username already exists' });
    });

    it('should return 500 on service error', async () => {
      mockReq.body = {
        username: 'testuser',
        password: 'password123',
        confirmPassword: 'password123'
      };
      authService.registerUser.mockRejectedValue(new Error('Database error'));

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Server error during registration' });
    });
  });

  describe('verifyEmail', () => {
    it('should return 400 if token is missing', async () => {
      mockReq.params = {};

      await authController.verifyEmail(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Verification token is required'
      });
    });

    it('should verify email successfully', async () => {
      mockReq.params = { token: 'valid-token' };
      authService.verifyEmail.mockResolvedValue({
        success: true,
        message: 'Email verified successfully'
      });

      await authController.verifyEmail(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Email verified successfully' });
    });

    it('should return 400 if verification fails', async () => {
      mockReq.params = { token: 'invalid-token' };
      authService.verifyEmail.mockResolvedValue({
        success: false,
        error: 'Invalid or expired token'
      });

      await authController.verifyEmail(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    });

    it('should return 500 on service error', async () => {
      mockReq.params = { token: 'valid-token' };
      authService.verifyEmail.mockRejectedValue(new Error('Database error'));

      await authController.verifyEmail(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Server error during email verification'
      });
    });
  });

  describe('refreshToken', () => {
    it('should return 400 if refresh token is missing', async () => {
      mockReq.body = {};

      await authController.refreshToken(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Refresh token is required' });
    });

    it('should refresh token successfully', async () => {
      mockReq.body = { refreshToken: 'valid-refresh-token' };
      authService.refreshAccessToken.mockResolvedValue({
        success: true,
        token: 'new-jwt-token',
        expiresIn: 604800,
        user: { id: 1, username: 'testuser' }
      });

      await authController.refreshToken(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        token: 'new-jwt-token',
        expiresIn: 604800,
        user: { id: 1, username: 'testuser' }
      });
    });

    it('should return 401 if refresh token is invalid', async () => {
      mockReq.body = { refreshToken: 'invalid-refresh-token' };
      authService.refreshAccessToken.mockResolvedValue({
        success: false,
        error: 'Invalid refresh token'
      });

      await authController.refreshToken(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid refresh token' });
    });

    it('should return 500 on service error', async () => {
      mockReq.body = { refreshToken: 'valid-refresh-token' };
      authService.refreshAccessToken.mockRejectedValue(new Error('Database error'));

      await authController.refreshToken(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Server error during token refresh' });
    });
  });
});
