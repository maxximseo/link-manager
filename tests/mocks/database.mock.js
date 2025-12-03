/**
 * Database Mock for Testing
 *
 * Provides mock implementations for database queries and transactions
 */

const mockQuery = jest.fn();
const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};
const mockPool = {
  connect: jest.fn().mockResolvedValue(mockClient)
};

// Helper to reset all mocks
const resetMocks = () => {
  mockQuery.mockReset();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
  mockPool.connect.mockResolvedValue(mockClient);
};

// Helper to setup transaction mocks
const setupTransaction = () => {
  mockClient.query
    .mockResolvedValueOnce({}) // BEGIN
    .mockResolvedValueOnce({}) // ... operations ...
    .mockResolvedValueOnce({}); // COMMIT
};

// Helper to setup failed transaction (rollback)
const setupFailedTransaction = (errorMessage = 'Database error') => {
  mockClient.query
    .mockResolvedValueOnce({}) // BEGIN
    .mockRejectedValueOnce(new Error(errorMessage));
};

module.exports = {
  mockQuery,
  mockClient,
  mockPool,
  resetMocks,
  setupTransaction,
  setupFailedTransaction,

  // For jest.mock usage
  createMock: () => ({
    query: (...args) => mockQuery(...args),
    pool: mockPool
  })
};
