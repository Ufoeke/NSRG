const redis = require('redis');
const { logger } = require('./connection');

// Check if we're in development mode without Docker
const isDevelopmentMode = process.env.NODE_ENV !== 'production' && !process.env.REDIS_ENABLED;

let client = null;

// Only create Redis client if not in development mode or if explicitly enabled
if (!isDevelopmentMode) {
  // Create Redis client with proper Docker configuration
  client = redis.createClient({
    url: `redis://${process.env.REDIS_HOST || 'redis'}:${process.env.REDIS_PORT || 6379}`,
    password: process.env.REDIS_PASSWORD || undefined,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 50, 500)
    },
    retry_delay_on_failover: 100,
    retry_delay_on_cluster_down: 300,
    max_attempts: 3
  });

  // Handle Redis connection events
  client.on('connect', () => {
    logger.info('Redis client connected');
  });

  client.on('ready', () => {
    logger.info('Redis client ready');
  });

  client.on('error', (err) => {
    logger.error('Redis client error:', err);
  });

  client.on('end', () => {
    logger.warn('Redis client connection ended');
  });

  client.on('reconnecting', () => {
    logger.info('Redis client reconnecting');
  });

  // Connect to Redis
  const connectRedis = async () => {
    try {
      if (!client.isOpen) {
        await client.connect();
        logger.info('Redis connection established');
      }
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
    }
  };

  // Initialize connection
  connectRedis();
} else {
  logger.info('Development mode: Redis caching disabled');
}

// Cache utility functions
const cache = {
  // Get value from cache
  async get(key) {
    try {
      if (!client || !client.isReady) {
        // In development mode, just return null (cache miss)
        return null;
      }
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  },

  // Set value in cache with expiration
  async setex(key, seconds, value) {
    try {
      if (!client || !client.isReady) {
        // In development mode, just return success without caching
        return true;
      }
      await client.setEx(key, seconds, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Cache setex error:', error);
      return false;
    }
  },

  // Set value in cache without expiration
  async set(key, value) {
    try {
      if (!client || !client.isReady) {
        // In development mode, just return success without caching
        return true;
      }
      await client.set(key, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  },

  // Delete key from cache
  async del(key) {
    try {
      if (!client || !client.isReady) {
        // In development mode, just return success
        return true;
      }
      await client.del(key);
      return true;
    } catch (error) {
      logger.error('Cache del error:', error);
      return false;
    }
  },

  // Delete keys matching pattern
  async invalidatePattern(pattern) {
    try {
      if (!client || !client.isReady) {
        // In development mode, just return success
        return true;
      }
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(keys);
      }
      return true;
    } catch (error) {
      logger.error('Cache invalidatePattern error:', error);
      return false;
    }
  },

  // Check if key exists
  async exists(key) {
    try {
      if (!client || !client.isReady) {
        // In development mode, always return false (no cache)
        return false;
      }
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  },

  // Set expiration on existing key
  async expire(key, seconds) {
    try {
      if (!client || !client.isReady) {
        // In development mode, just return success
        return true;
      }
      await client.expire(key, seconds);
      return true;
    } catch (error) {
      logger.error('Cache expire error:', error);
      return false;
    }
  },

  // Get multiple keys
  async mget(keys) {
    try {
      if (!client || !client.isReady) {
        // In development mode, return empty array
        return [];
      }
      const values = await client.mGet(keys);
      return values.map(value => value ? JSON.parse(value) : null);
    } catch (error) {
      logger.error('Cache mget error:', error);
      return [];
    }
  },

  // Set multiple key-value pairs
  async mset(pairs) {
    try {
      if (!client || !client.isReady) {
        // In development mode, just return success
        return true;
      }
      const serializedPairs = [];
      for (let i = 0; i < pairs.length; i += 2) {
        serializedPairs.push(pairs[i]); // key
        serializedPairs.push(JSON.stringify(pairs[i + 1])); // value
      }
      await client.mSet(serializedPairs);
      return true;
    } catch (error) {
      logger.error('Cache mset error:', error);
      return false;
    }
  },

  // Get cache statistics
  async stats() {
    try {
      if (!client || !client.isReady) {
        return {
          connected: false,
          mode: 'development',
          message: 'Redis caching disabled in development mode'
        };
      }
      const info = await client.info('memory');
      const keyCount = await client.dbSize();
      return {
        connected: true,
        keyCount,
        memory: info
      };
    } catch (error) {
      logger.error('Cache stats error:', error);
      return { connected: false, error: error.message };
    }
  },

  // Flush all cache
  async flush() {
    try {
      if (!client || !client.isReady) {
        logger.warn('Redis client not ready, skipping cache flush');
        return false;
      }
      await client.flushDb();
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  }
};

// Cache middleware for Express routes
const cacheMiddleware = (duration = 300) => {
  return async (req, res, next) => {
    try {
      if (!client || !client.isReady) {
        return next();
      }
      
      const key = `cache:${req.originalUrl || req.url}`;
      const cached = await cache.get(key);
      
      if (cached) {
        return res.json(cached);
      }
      
      // Store original res.json function
      const originalJson = res.json;
      
      // Override res.json to cache the response
      res.json = function(data) {
        // Cache the response data
        cache.setex(key, duration, data);
        // Call original json function
        return originalJson.call(this, data);
      };
      
      next();
    } catch (error) {
      logger.error('Cache middleware error:', error);
      next();
    }
  };
};

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Closing Redis connection...');
  if (client && client.isReady) {
    await client.quit();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Closing Redis connection...');
  if (client && client.isReady) {
    await client.quit();
  }
  process.exit(0);
});

module.exports = {
  client,
  cache,
  cacheMiddleware
}; 