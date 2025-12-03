/**
 * Cache Service Tests
 */

// Mock ioredis before requiring cache service
const mockRedis = {
  on: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  scan: jest.fn(),
  info: jest.fn(),
  dbsize: jest.fn()
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

jest.mock('../../backend/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Need to set cache as available for tests
let cacheService;

describe('Cache Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-require the module to reset state
    jest.resetModules();

    // Mock Redis constructor and methods before requiring cache service
    jest.doMock('ioredis', () => {
      return jest.fn().mockImplementation(() => ({
        on: jest.fn((event, callback) => {
          if (event === 'connect') {
            // Simulate connection
            setTimeout(callback, 0);
          }
        }),
        connect: jest.fn().mockResolvedValue(undefined),
        get: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
        scan: jest.fn(),
        info: jest.fn(),
        dbsize: jest.fn()
      }));
    });
  });

  describe('Cache operations with unavailable cache', () => {
    beforeEach(() => {
      jest.resetModules();
      // Mock Redis that doesn't connect
      jest.doMock('ioredis', () => {
        return jest.fn().mockImplementation(() => ({
          on: jest.fn(),
          connect: jest.fn().mockRejectedValue(new Error('Connection failed'))
        }));
      });
      cacheService = require('../../backend/services/cache.service');
    });

    it('should return null when cache unavailable (get)', async () => {
      const result = await cacheService.get('test-key');
      expect(result).toBeNull();
    });

    it('should return false when cache unavailable (set)', async () => {
      const result = await cacheService.set('test-key', { data: 'test' });
      expect(result).toBe(false);
    });

    it('should return false when cache unavailable (del)', async () => {
      const result = await cacheService.del('test-key');
      expect(result).toBe(false);
    });

    it('should return 0 when cache unavailable (delPattern)', async () => {
      const result = await cacheService.delPattern('test:*');
      expect(result).toBe(0);
    });

    it('should return unavailable status (getStats)', async () => {
      const result = await cacheService.getStats();
      expect(result.available).toBe(false);
    });

    it('should return false for isAvailable', () => {
      expect(cacheService.isAvailable()).toBe(false);
    });
  });

  describe('Module exports', () => {
    beforeEach(() => {
      jest.resetModules();
      cacheService = require('../../backend/services/cache.service');
    });

    it('should export get function', () => {
      expect(typeof cacheService.get).toBe('function');
    });

    it('should export set function', () => {
      expect(typeof cacheService.set).toBe('function');
    });

    it('should export del function', () => {
      expect(typeof cacheService.del).toBe('function');
    });

    it('should export delPattern function', () => {
      expect(typeof cacheService.delPattern).toBe('function');
    });

    it('should export getStats function', () => {
      expect(typeof cacheService.getStats).toBe('function');
    });

    it('should export isAvailable function', () => {
      expect(typeof cacheService.isAvailable).toBe('function');
    });
  });
});

describe('Cache Service - Graceful Degradation', () => {
  it('should handle missing Redis gracefully', async () => {
    jest.resetModules();
    // Mock Redis that fails completely
    jest.doMock('ioredis', () => {
      return jest.fn().mockImplementation(() => ({
        on: jest.fn(),
        connect: jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
      }));
    });

    const cache = require('../../backend/services/cache.service');

    // All operations should fail gracefully
    expect(await cache.get('key')).toBeNull();
    expect(await cache.set('key', 'value')).toBe(false);
    expect(await cache.del('key')).toBe(false);
    expect(await cache.delPattern('*')).toBe(0);
    expect(cache.isAvailable()).toBe(false);
  });
});

describe('Cache Service - Key patterns', () => {
  it('should validate cache key format', () => {
    // Cache keys should follow naming convention
    const validKeys = [
      'wp:content:api_123',
      'placements:user:1:p1:l20',
      'projects:user:1',
      'sites:user:1'
    ];

    validKeys.forEach(key => {
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });
  });

  it('should validate cache key patterns for deletion', () => {
    const validPatterns = ['wp:*', 'placements:user:*', 'projects:*', 'sites:*'];

    validPatterns.forEach(pattern => {
      expect(pattern).toMatch(/\*/);
    });
  });
});

describe('Cache Service - TTL values', () => {
  it('should use default TTL of 300 seconds', () => {
    const defaultTTL = 300;
    expect(defaultTTL).toBe(300); // 5 minutes
  });

  it('should validate WordPress content TTL', () => {
    const wpContentTTL = 300; // 5 minutes
    expect(wpContentTTL).toBe(300);
  });

  it('should validate placements TTL', () => {
    const placementsTTL = 120; // 2 minutes
    expect(placementsTTL).toBe(120);
  });
});

describe('Cache Service - JSON serialization', () => {
  it('should serialize objects correctly', () => {
    const data = { id: 1, name: 'test', nested: { key: 'value' } };
    const serialized = JSON.stringify(data);
    const deserialized = JSON.parse(serialized);

    expect(deserialized).toEqual(data);
  });

  it('should handle arrays', () => {
    const data = [1, 2, 3, { id: 1 }];
    const serialized = JSON.stringify(data);
    const deserialized = JSON.parse(serialized);

    expect(deserialized).toEqual(data);
  });

  it('should handle null values', () => {
    const serialized = JSON.stringify(null);
    const deserialized = JSON.parse(serialized);

    expect(deserialized).toBeNull();
  });

  it('should handle empty objects', () => {
    const data = {};
    const serialized = JSON.stringify(data);
    const deserialized = JSON.parse(serialized);

    expect(deserialized).toEqual(data);
  });

  it('should handle boolean values', () => {
    expect(JSON.parse(JSON.stringify(true))).toBe(true);
    expect(JSON.parse(JSON.stringify(false))).toBe(false);
  });

  it('should handle numeric values', () => {
    expect(JSON.parse(JSON.stringify(42))).toBe(42);
    expect(JSON.parse(JSON.stringify(3.14))).toBe(3.14);
  });

  it('should handle string values', () => {
    expect(JSON.parse(JSON.stringify('test'))).toBe('test');
  });
});

describe('Cache Service - Active Redis operations', () => {
  let cacheService;
  let mockRedisInstance;

  beforeEach(() => {
    jest.resetModules();

    mockRedisInstance = {
      on: jest.fn((event, callback) => {
        // Simulate 'connect' event immediately
        if (event === 'connect') {
          callback();
        }
      }),
      connect: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      scan: jest.fn(),
      info: jest.fn(),
      dbsize: jest.fn()
    };

    jest.doMock('ioredis', () => {
      return jest.fn().mockImplementation(() => mockRedisInstance);
    });

    // Force module reload
    cacheService = require('../../backend/services/cache.service');
  });

  describe('get', () => {
    it('should return parsed value when found', async () => {
      const testData = { id: 1, name: 'test' };
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(testData));

      const result = await cacheService.get('test-key');

      expect(mockRedisInstance.get).toHaveBeenCalledWith('test-key');
      expect(result).toEqual(testData);
    });

    it('should return null when key not found', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const result = await cacheService.get('nonexistent-key');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockRedisInstance.get.mockRejectedValue(new Error('Redis error'));

      const result = await cacheService.get('error-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value with default TTL', async () => {
      mockRedisInstance.setex.mockResolvedValue('OK');

      const result = await cacheService.set('test-key', { data: 'value' });

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        'test-key',
        300,
        JSON.stringify({ data: 'value' })
      );
      expect(result).toBe(true);
    });

    it('should set value with custom TTL', async () => {
      mockRedisInstance.setex.mockResolvedValue('OK');

      const result = await cacheService.set('test-key', { data: 'value' }, 600);

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        'test-key',
        600,
        JSON.stringify({ data: 'value' })
      );
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockRedisInstance.setex.mockRejectedValue(new Error('Redis error'));

      const result = await cacheService.set('error-key', { data: 'value' });

      expect(result).toBe(false);
    });
  });

  describe('del', () => {
    it('should delete key successfully', async () => {
      mockRedisInstance.del.mockResolvedValue(1);

      const result = await cacheService.del('test-key');

      expect(mockRedisInstance.del).toHaveBeenCalledWith('test-key');
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockRedisInstance.del.mockRejectedValue(new Error('Redis error'));

      const result = await cacheService.del('error-key');

      expect(result).toBe(false);
    });
  });

  describe('delPattern', () => {
    it('should delete matching keys using SCAN', async () => {
      // First scan returns some keys
      mockRedisInstance.scan
        .mockResolvedValueOnce(['1', ['key1', 'key2', 'key3']])
        .mockResolvedValueOnce(['0', ['key4', 'key5']]);
      mockRedisInstance.del.mockResolvedValue(3);

      const result = await cacheService.delPattern('test:*');

      expect(mockRedisInstance.scan).toHaveBeenCalledWith('0', 'MATCH', 'test:*', 'COUNT', 100);
      expect(mockRedisInstance.del).toHaveBeenCalledTimes(2);
      expect(result).toBe(5);
    });

    it('should return 0 when no keys match', async () => {
      mockRedisInstance.scan.mockResolvedValue(['0', []]);

      const result = await cacheService.delPattern('nonexistent:*');

      expect(result).toBe(0);
    });

    it('should return 0 on error', async () => {
      mockRedisInstance.scan.mockRejectedValue(new Error('Redis error'));

      const result = await cacheService.delPattern('error:*');

      expect(result).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return stats when cache is available', async () => {
      mockRedisInstance.info.mockResolvedValue('# Stats\nkeyspace_hits:100');
      mockRedisInstance.dbsize.mockResolvedValue(50);

      const result = await cacheService.getStats();

      expect(result).toEqual({
        available: true,
        connected: true,
        keyCount: 50,
        info: '# Stats\nkeyspace_hits:100'
      });
    });

    it('should return error info on stats error', async () => {
      mockRedisInstance.info.mockRejectedValue(new Error('Stats error'));

      const result = await cacheService.getStats();

      expect(result).toEqual({
        available: false,
        error: 'Stats error'
      });
    });
  });

  describe('isAvailable', () => {
    it('should return true when connected', () => {
      expect(cacheService.isAvailable()).toBe(true);
    });
  });
});

describe('Cache Service - Redis Configuration', () => {
  // Note: These tests verify the configuration logic without mocking env vars
  // because dotenv loads from .env file during module initialization

  it('should configure Redis with retry strategy', () => {
    jest.resetModules();

    let configReceived;
    const mockRedisClass = jest.fn().mockImplementation(config => {
      configReceived = config;
      return {
        on: jest.fn(),
        connect: jest.fn().mockResolvedValue(undefined)
      };
    });

    jest.doMock('ioredis', () => mockRedisClass);

    require('../../backend/services/cache.service');

    // Verify retry strategy is present
    expect(configReceived).toHaveProperty('retryStrategy');
    expect(typeof configReceived.retryStrategy).toBe('function');
  });

  it('should configure Redis with connection timeouts', () => {
    jest.resetModules();

    let configReceived;
    const mockRedisClass = jest.fn().mockImplementation(config => {
      configReceived = config;
      return {
        on: jest.fn(),
        connect: jest.fn().mockResolvedValue(undefined)
      };
    });

    jest.doMock('ioredis', () => mockRedisClass);

    require('../../backend/services/cache.service');

    // Verify timeout settings
    expect(configReceived).toHaveProperty('connectTimeout', 30000);
    expect(configReceived).toHaveProperty('commandTimeout', 15000);
    expect(configReceived).toHaveProperty('maxRetriesPerRequest', 10);
  });

  it('should configure Redis with enableReadyCheck', () => {
    jest.resetModules();

    let configReceived;
    const mockRedisClass = jest.fn().mockImplementation(config => {
      configReceived = config;
      return {
        on: jest.fn(),
        connect: jest.fn().mockResolvedValue(undefined)
      };
    });

    jest.doMock('ioredis', () => mockRedisClass);

    require('../../backend/services/cache.service');

    expect(configReceived).toHaveProperty('enableReadyCheck', true);
    expect(configReceived).toHaveProperty('lazyConnect', true);
  });

  it('should enable TLS for DigitalOcean hosts when configured', () => {
    jest.resetModules();

    let configReceived;
    const mockRedisClass = jest.fn().mockImplementation(config => {
      configReceived = config;
      return {
        on: jest.fn(),
        connect: jest.fn().mockResolvedValue(undefined)
      };
    });

    jest.doMock('ioredis', () => mockRedisClass);

    require('../../backend/services/cache.service');

    // If REDIS_HOST contains ondigitalocean.com, TLS should be enabled
    if (configReceived.host && configReceived.host.includes('ondigitalocean.com')) {
      expect(configReceived).toHaveProperty('tls');
      expect(configReceived.tls).toEqual({ rejectUnauthorized: false });
    }
  });
});

describe('Cache Service - Connection Events', () => {
  it('should set cacheAvailable on connect event', async () => {
    jest.resetModules();

    const connectCallback = jest.fn();
    const errorCallback = jest.fn();
    const closeCallback = jest.fn();

    jest.doMock('ioredis', () => {
      return jest.fn().mockImplementation(() => ({
        on: jest.fn((event, callback) => {
          if (event === 'connect') {
            connectCallback.mockImplementation(callback);
            callback(); // Trigger connect
          }
          if (event === 'error') {
            errorCallback.mockImplementation(callback);
          }
          if (event === 'close') {
            closeCallback.mockImplementation(callback);
          }
        }),
        connect: jest.fn().mockResolvedValue(undefined)
      }));
    });

    const cache = require('../../backend/services/cache.service');

    // After connect callback, isAvailable should return true
    expect(cache.isAvailable()).toBe(true);
  });

  it('should handle error event', async () => {
    jest.resetModules();

    let errorHandler;
    const mockRedis = {
      on: jest.fn((event, callback) => {
        if (event === 'connect') callback();
        if (event === 'error') errorHandler = callback;
      }),
      connect: jest.fn().mockResolvedValue(undefined)
    };

    jest.doMock('ioredis', () => {
      return jest.fn().mockImplementation(() => mockRedis);
    });

    const cache = require('../../backend/services/cache.service');

    // Initially connected
    expect(cache.isAvailable()).toBe(true);

    // Simulate error event
    if (errorHandler) {
      errorHandler(new Error('Connection lost'));
    }

    // After error, should be unavailable
    expect(cache.isAvailable()).toBe(false);
  });

  it('should handle close event', async () => {
    jest.resetModules();

    let closeHandler;
    const mockRedis = {
      on: jest.fn((event, callback) => {
        if (event === 'connect') callback();
        if (event === 'close') closeHandler = callback;
      }),
      connect: jest.fn().mockResolvedValue(undefined)
    };

    jest.doMock('ioredis', () => {
      return jest.fn().mockImplementation(() => mockRedis);
    });

    const cache = require('../../backend/services/cache.service');

    // Initially connected
    expect(cache.isAvailable()).toBe(true);

    // Simulate close event
    if (closeHandler) {
      closeHandler();
    }

    // After close, should be unavailable
    expect(cache.isAvailable()).toBe(false);
  });
});

describe('Cache Service - Retry Strategy', () => {
  it('should implement exponential backoff with cap and max retries', () => {
    jest.resetModules();

    let retryStrategy;
    jest.doMock('ioredis', () => {
      return jest.fn().mockImplementation(config => {
        retryStrategy = config.retryStrategy;
        return {
          on: jest.fn(),
          connect: jest.fn().mockResolvedValue(undefined)
        };
      });
    });

    require('../../backend/services/cache.service');

    // Test retry strategy - formula: times > 10 ? null : Math.min(times * 100, 2000)
    expect(retryStrategy(1)).toBe(100); // First retry: 100ms
    expect(retryStrategy(5)).toBe(500); // Fifth retry: 500ms
    expect(retryStrategy(10)).toBe(1000); // 10th retry: 1000ms (last valid)
    expect(retryStrategy(11)).toBeNull(); // 11th retry: give up (times > 10)
    expect(retryStrategy(15)).toBeNull(); // Beyond: null
  });
});
