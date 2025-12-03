/**
 * Cache Mock for Testing
 *
 * Provides mock implementations for Redis cache operations
 */

const mockGet = jest.fn().mockResolvedValue(null);
const mockSet = jest.fn().mockResolvedValue(true);
const mockDel = jest.fn().mockResolvedValue(true);
const mockDelPattern = jest.fn().mockResolvedValue(true);
const mockIsAvailable = jest.fn().mockReturnValue(true);

// Helper to reset all mocks
const resetMocks = () => {
  mockGet.mockReset().mockResolvedValue(null);
  mockSet.mockReset().mockResolvedValue(true);
  mockDel.mockReset().mockResolvedValue(true);
  mockDelPattern.mockReset().mockResolvedValue(true);
  mockIsAvailable.mockReset().mockReturnValue(true);
};

// Helper to setup cache hit
const setupCacheHit = value => {
  mockGet.mockResolvedValueOnce(value);
};

// Helper to simulate cache unavailable
const setupCacheUnavailable = () => {
  mockIsAvailable.mockReturnValue(false);
  mockGet.mockResolvedValue(null);
};

module.exports = {
  mockGet,
  mockSet,
  mockDel,
  mockDelPattern,
  mockIsAvailable,
  resetMocks,
  setupCacheHit,
  setupCacheUnavailable,

  // For jest.mock usage
  createMock: () => ({
    get: mockGet,
    set: mockSet,
    del: mockDel,
    delPattern: mockDelPattern,
    isAvailable: mockIsAvailable
  })
};
