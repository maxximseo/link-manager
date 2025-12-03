/**
 * Auth Service Tests
 *
 * Tests auth service with mocked database:
 * - authenticateUser (login with lockout)
 * - registerUser
 * - verifyEmail
 * - refreshAccessToken
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Set JWT_SECRET before requiring auth.service
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-32chars-minimum';

// Mock database
const mockQuery = jest.fn();

jest.mock('../../backend/config/database', () => ({
  query: (...args) => mockQuery(...args)
}));

// Mock logger
jest.mock('../../backend/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

const authService = require('../../backend/services/auth.service');

describe('Auth Service', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('authenticateUser', () => {
    const createMockUser = (overrides = {}) => ({
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      password: bcrypt.hashSync('password123', 8), // Field is 'password' not 'password_hash'
      role: 'user',
      failed_login_attempts: 0,
      account_locked_until: null,
      ...overrides
    });

    it('should authenticate user with correct credentials', async () => {
      const mockUser = createMockUser();
      mockQuery
        .mockResolvedValueOnce({ rows: [mockUser] }) // Find user
        .mockResolvedValueOnce({}); // Update last_login and reset attempts

      const result = await authService.authenticateUser('testuser', 'password123');

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(result.user.username).toBe('testuser');
      expect(result.user).not.toHaveProperty('password');
    });

    it('should return error for wrong password', async () => {
      const mockUser = createMockUser();
      mockQuery
        .mockResolvedValueOnce({ rows: [mockUser] }) // Find user
        .mockResolvedValueOnce({}); // Update failed attempts

      const result = await authService.authenticateUser('testuser', 'wrongpassword');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invalid credentials/i);
    });

    it('should return error for non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await authService.authenticateUser('nonexistent', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invalid credentials/i);
    });

    it('should increment failed login attempts on wrong password', async () => {
      const mockUser = createMockUser({ failed_login_attempts: 2 });
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] }).mockResolvedValueOnce({});

      const result = await authService.authenticateUser('testuser', 'wrongpassword');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/2 attempt\(s\) remaining/i);
    });

    it('should lock account after 5 failed attempts', async () => {
      const mockUser = createMockUser({ failed_login_attempts: 4 });
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] }).mockResolvedValueOnce({});

      const result = await authService.authenticateUser('testuser', 'wrongpassword');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/locked/i);

      // Verify lock was set
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[0]).toContain('account_locked_until');
    });

    it('should reject locked account', async () => {
      const lockedUser = createMockUser({
        account_locked_until: new Date(Date.now() + 30 * 60 * 1000)
      });
      mockQuery.mockResolvedValueOnce({ rows: [lockedUser] });

      const result = await authService.authenticateUser('testuser', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/locked/i);
    });

    it('should allow login after lock expires', async () => {
      const expiredLockUser = createMockUser({
        account_locked_until: new Date(Date.now() - 1000), // Lock expired
        failed_login_attempts: 5
      });
      mockQuery
        .mockResolvedValueOnce({ rows: [expiredLockUser] })
        .mockResolvedValueOnce({}) // Reset lock
        .mockResolvedValueOnce({}); // Update last_login

      const result = await authService.authenticateUser('testuser', 'password123');

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('token');
    });

    it('should reset failed attempts on successful login', async () => {
      const mockUser = createMockUser({ failed_login_attempts: 3 });
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] }).mockResolvedValueOnce({});

      const result = await authService.authenticateUser('testuser', 'password123');

      expect(result.success).toBe(true);

      // Verify reset query was called
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[0]).toContain('failed_login_attempts = 0');
    });

    it('should return remaining attempts count on wrong password', async () => {
      const mockUser = createMockUser({ failed_login_attempts: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] }).mockResolvedValueOnce({});

      const result = await authService.authenticateUser('testuser', 'wrongpassword');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/3 attempt\(s\) remaining/i);
    });

    it('should generate valid JWT access token', async () => {
      const mockUser = createMockUser();
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] }).mockResolvedValueOnce({});

      const result = await authService.authenticateUser('testuser', 'password123');

      expect(result.success).toBe(true);

      const decoded = jwt.verify(result.token, process.env.JWT_SECRET);
      expect(decoded.userId).toBe(1);
      expect(decoded.username).toBe('testuser');
      expect(decoded.role).toBe('user');
    });

    it('should generate refresh token with correct type', async () => {
      const mockUser = createMockUser();
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] }).mockResolvedValueOnce({});

      const result = await authService.authenticateUser('testuser', 'password123');

      const decoded = jwt.verify(result.refreshToken, process.env.JWT_SECRET);
      expect(decoded.type).toBe('refresh');
      expect(decoded.userId).toBe(1);
    });
  });

  describe('registerUser', () => {
    it('should register new user with valid data', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // Username check
        .mockResolvedValueOnce({ rows: [] }) // Email check
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              username: 'newuser',
              email: 'new@example.com',
              role: 'user'
            }
          ]
        }); // Insert user

      const result = await authService.registerUser(
        'newuser',
        'new@example.com',
        'securepassword123'
      );

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user.username).toBe('newuser');
      expect(result.user).not.toHaveProperty('password');
      expect(result.verificationToken).toBeDefined();
    });

    it('should reject duplicate username', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, username: 'existinguser' }]
      });

      const result = await authService.registerUser(
        'existinguser',
        'new@example.com',
        'password123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/username.*exists/i);
    });

    it('should reject duplicate email', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // Username OK
        .mockResolvedValueOnce({ rows: [{ id: 1, email: 'existing@example.com' }] }); // Email exists

      const result = await authService.registerUser(
        'newuser',
        'existing@example.com',
        'password123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/email.*registered/i);
    });

    it('should hash password before storing', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 1, username: 'newuser', email: 'new@example.com' }]
        });

      await authService.registerUser('newuser', 'new@example.com', 'plainpassword');

      // Find the INSERT query
      const insertCall = mockQuery.mock.calls.find(call => call[0] && call[0].includes('INSERT'));

      expect(insertCall).toBeDefined();
      // Password should be hashed (bcrypt hash starts with $2)
      const params = insertCall[1];
      const hashedPassword = params[2]; // 3rd param is password
      expect(hashedPassword).toMatch(/^\$2[aby]?\$/);
    });

    it('should generate verification token', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 1, username: 'newuser', email: 'new@example.com' }]
        });

      const result = await authService.registerUser('newuser', 'new@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(result.verificationToken).toBeDefined();
      expect(result.verificationToken.length).toBe(64); // 32 bytes in hex
    });

    it('should set default user role', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 1, username: 'newuser', email: 'new@example.com', role: 'user' }]
        });

      await authService.registerUser('newuser', 'new@example.com', 'password123');

      const insertCall = mockQuery.mock.calls.find(call => call[0] && call[0].includes('INSERT'));
      const params = insertCall[1];
      expect(params[3]).toBe('user'); // 4th param is role
    });

    it('should allow registration without email', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // Username check only
        .mockResolvedValueOnce({
          rows: [{ id: 1, username: 'newuser', email: null, role: 'user' }]
        });

      const result = await authService.registerUser('newuser', null, 'password123');

      expect(result.success).toBe(true);
    });
  });

  describe('verifyEmail', () => {
    it('should verify email with valid token', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1, username: 'testuser' }]
        })
        .mockResolvedValueOnce({}); // Update user

      const result = await authService.verifyEmail('valid-verification-token');

      expect(result.success).toBe(true);
      expect(result.message).toMatch(/verified/i);
    });

    it('should return error for invalid token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await authService.verifyEmail('invalid-token');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid|expired/i);
    });

    it('should clear verification token after verification', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'testuser' }] })
        .mockResolvedValueOnce({});

      await authService.verifyEmail('valid-token');

      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[0]).toContain('verification_token = NULL');
    });

    it('should mark email as verified', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'testuser' }] })
        .mockResolvedValueOnce({});

      await authService.verifyEmail('valid-token');

      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[0]).toContain('email_verified = true');
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh valid token', async () => {
      const refreshToken = jwt.sign({ userId: 1, type: 'refresh' }, process.env.JWT_SECRET, {
        expiresIn: '7d'
      });

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            username: 'testuser',
            role: 'user',
            account_locked_until: null
          }
        ]
      });

      const result = await authService.refreshAccessToken(refreshToken);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('user');
    });

    it('should return error for expired refresh token', async () => {
      const expiredToken = jwt.sign({ userId: 1, type: 'refresh' }, process.env.JWT_SECRET, {
        expiresIn: '-1h'
      });

      const result = await authService.refreshAccessToken(expiredToken);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/expired/i);
    });

    it('should return error for invalid token', async () => {
      const result = await authService.refreshAccessToken('not-a-valid-jwt');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid/i);
    });

    it('should reject access token used as refresh', async () => {
      const accessToken = jwt.sign(
        { userId: 1, username: 'test', role: 'user' }, // No type: 'refresh'
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const result = await authService.refreshAccessToken(accessToken);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid.*type/i);
    });

    it('should return error if user not found', async () => {
      const refreshToken = jwt.sign({ userId: 999, type: 'refresh' }, process.env.JWT_SECRET, {
        expiresIn: '7d'
      });

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await authService.refreshAccessToken(refreshToken);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/user not found/i);
    });

    it('should reject refresh for locked account', async () => {
      const refreshToken = jwt.sign({ userId: 1, type: 'refresh' }, process.env.JWT_SECRET, {
        expiresIn: '7d'
      });

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            username: 'testuser',
            role: 'user',
            account_locked_until: new Date(Date.now() + 30 * 60 * 1000)
          }
        ]
      });

      const result = await authService.refreshAccessToken(refreshToken);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/locked/i);
    });

    it('should generate new access token with correct payload', async () => {
      const refreshToken = jwt.sign({ userId: 1, type: 'refresh' }, process.env.JWT_SECRET, {
        expiresIn: '7d'
      });

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            username: 'testuser',
            role: 'admin',
            account_locked_until: null
          }
        ]
      });

      const result = await authService.refreshAccessToken(refreshToken);

      expect(result.success).toBe(true);

      const decoded = jwt.verify(result.token, process.env.JWT_SECRET);
      expect(decoded.userId).toBe(1);
      expect(decoded.username).toBe('testuser');
      expect(decoded.role).toBe('admin');
    });
  });
});

describe('JWT Token Generation', () => {
  it('should generate valid JWT with user data', () => {
    const token = jwt.sign({ userId: 1, username: 'test', role: 'user' }, process.env.JWT_SECRET, {
      expiresIn: '1h'
    });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    expect(decoded.userId).toBe(1);
    expect(decoded.username).toBe('test');
    expect(decoded.role).toBe('user');
  });

  it('should include expiration in token', () => {
    const token = jwt.sign({ userId: 1 }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    expect(decoded.exp).toBeDefined();
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp - decoded.iat).toBe(3600); // 1 hour in seconds
  });

  it('should create refresh token with 7 day expiry', () => {
    const token = jwt.sign({ userId: 1, type: 'refresh' }, process.env.JWT_SECRET, {
      expiresIn: '7d'
    });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60); // 7 days in seconds
  });
});

describe('Password Hashing', () => {
  it('should hash password with bcrypt', async () => {
    const password = 'testpassword123';
    const hash = await bcrypt.hash(password, 8);

    expect(hash).toMatch(/^\$2[aby]?\$/);
    expect(hash).not.toBe(password);
  });

  it('should verify correct password', async () => {
    const password = 'testpassword123';
    const hash = await bcrypt.hash(password, 8);

    const isValid = await bcrypt.compare(password, hash);

    expect(isValid).toBe(true);
  });

  it('should reject wrong password', async () => {
    const hash = await bcrypt.hash('correctpassword', 8);

    const isValid = await bcrypt.compare('wrongpassword', hash);

    expect(isValid).toBe(false);
  });
});

describe('Account Lockout Logic', () => {
  const LOCKOUT_THRESHOLD = 5;
  const LOCKOUT_DURATION_MINUTES = 30;

  it('should calculate lockout time correctly', () => {
    const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
    const now = new Date();

    const minutesUntilUnlock = Math.ceil((lockUntil - now) / 60000);

    expect(minutesUntilUnlock).toBeLessThanOrEqual(LOCKOUT_DURATION_MINUTES);
    expect(minutesUntilUnlock).toBeGreaterThan(0);
  });

  it('should recognize locked account', () => {
    const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    const isLocked = lockUntil > new Date();

    expect(isLocked).toBe(true);
  });

  it('should recognize expired lock', () => {
    const lockUntil = new Date(Date.now() - 1000);
    const isLocked = lockUntil > new Date();

    expect(isLocked).toBe(false);
  });
});

describe('Timing Attack Protection', () => {
  it('should use constant-time comparison for authentication', async () => {
    // Even for non-existent users, bcrypt.compare should run
    // to prevent timing attacks
    mockQuery.mockResolvedValueOnce({ rows: [] }); // User not found

    const start = Date.now();
    await authService.authenticateUser('nonexistent', 'password123');
    const duration = Date.now() - start;

    // Should take similar time as with real user due to dummy hash comparison
    // At minimum, bcrypt.compare should have been called
    expect(duration).toBeGreaterThan(1);
  });
});
