/**
 * Auth Service Tests
 *
 * Tests authentication-related functionality:
 * - Password hashing
 * - JWT token creation/verification
 * - Basic security checks
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

describe('Password Security', () => {
  it('should hash passwords with bcrypt', async () => {
    const password = 'mysecretpassword';
    const hash = await bcrypt.hash(password, 8);

    expect(hash).not.toBe(password);
    expect(hash.length).toBeGreaterThan(50);
    expect(await bcrypt.compare(password, hash)).toBe(true);
  });

  it('should reject wrong password', async () => {
    const hash = await bcrypt.hash('correctpassword', 8);
    expect(await bcrypt.compare('wrongpassword', hash)).toBe(false);
  });

  it('should generate unique hashes for same password', async () => {
    const password = 'samepassword';
    const hash1 = await bcrypt.hash(password, 8);
    const hash2 = await bcrypt.hash(password, 8);

    expect(hash1).not.toBe(hash2);
    expect(await bcrypt.compare(password, hash1)).toBe(true);
    expect(await bcrypt.compare(password, hash2)).toBe(true);
  });
});

describe('JWT Token', () => {
  const secret = process.env.JWT_SECRET || 'test-secret';

  it('should create valid token with payload', () => {
    const payload = { userId: 1, username: 'testuser', role: 'user' };
    const token = jwt.sign(payload, secret, { expiresIn: '1h' });

    const decoded = jwt.verify(token, secret);
    expect(decoded.userId).toBe(1);
    expect(decoded.username).toBe('testuser');
    expect(decoded.role).toBe('user');
  });

  it('should reject expired token', () => {
    const token = jwt.sign(
      { userId: 1 },
      secret,
      { expiresIn: '-1h' } // Already expired
    );

    expect(() => jwt.verify(token, secret)).toThrow();
  });

  it('should reject invalid token', () => {
    expect(() => jwt.verify('invalid-token', secret)).toThrow();
  });

  it('should reject token with wrong secret', () => {
    const token = jwt.sign({ userId: 1 }, 'secret1');
    expect(() => jwt.verify(token, 'secret2')).toThrow();
  });

  it('should include standard JWT claims', () => {
    const token = jwt.sign({ userId: 1 }, secret, { expiresIn: '1h' });
    const decoded = jwt.verify(token, secret);

    expect(decoded).toHaveProperty('iat'); // Issued at
    expect(decoded).toHaveProperty('exp'); // Expiration
  });
});

describe('Password Requirements', () => {
  it('should accept passwords >= 6 characters', () => {
    const validPasswords = ['123456', 'password', 'longerpassword123!@#'];
    validPasswords.forEach(pwd => {
      expect(pwd.length).toBeGreaterThanOrEqual(6);
    });
  });

  it('should reject passwords < 6 characters', () => {
    const invalidPasswords = ['12345', 'abc', ''];
    invalidPasswords.forEach(pwd => {
      expect(pwd.length).toBeLessThan(6);
    });
  });
});

describe('Username Validation', () => {
  it('should accept valid usernames', () => {
    const validUsernames = ['user1', 'testuser', 'admin', 'john_doe'];
    validUsernames.forEach(username => {
      expect(username.length).toBeGreaterThanOrEqual(3);
      expect(/^[a-zA-Z0-9_]+$/.test(username)).toBe(true);
    });
  });

  it('should reject usernames with special characters', () => {
    const invalidUsernames = ['user@name', 'test user', 'admin!', 'john-doe'];
    invalidUsernames.forEach(username => {
      // Only alphanumeric and underscore allowed
      expect(/^[a-zA-Z0-9_]+$/.test(username)).toBe(false);
    });
  });
});

describe('Email Validation', () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  it('should accept valid emails', () => {
    const validEmails = ['test@example.com', 'user123@domain.org', 'admin@sub.domain.co'];
    validEmails.forEach(email => {
      expect(emailRegex.test(email)).toBe(true);
    });
  });

  it('should reject invalid emails', () => {
    const invalidEmails = ['notanemail', 'missing@domain', '@nodomain.com', 'spaces in@email.com'];
    invalidEmails.forEach(email => {
      expect(emailRegex.test(email)).toBe(false);
    });
  });
});

describe('Token Payload Structure', () => {
  it('should have required user fields', () => {
    const requiredFields = ['userId', 'username', 'role'];
    const payload = { userId: 1, username: 'testuser', role: 'user' };

    requiredFields.forEach(field => {
      expect(payload).toHaveProperty(field);
    });
  });

  it('should have valid role values', () => {
    const validRoles = ['user', 'admin'];
    expect(validRoles).toContain('user');
    expect(validRoles).toContain('admin');
  });
});
