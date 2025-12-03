/**
 * Jest Test Setup
 *
 * Configures test environment before running tests
 */

// Load environment variables
require('dotenv').config();

// Set test environment
process.env.NODE_ENV = 'test';

// Mock logger to prevent console spam during tests
jest.mock('../backend/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Global test timeout
jest.setTimeout(30000);

// Clean up after all tests
afterAll(async () => {
  // Close any open handles
  await new Promise(resolve => setTimeout(resolve, 500));
});
