const Redis = require('ioredis');
const logger = require('../utils/logger');

class RedisClient {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.publisher = null;
  }

  async connect() {
    try {
      if (process.env.REDIS_URL) {
        // Use a URL de conexão se estiver disponível
        this.client = new Redis(process.env.REDIS_URL);
        this.subscriber = new Redis(process.env.REDIS_URL);
        this.publisher = new Redis(process.env.REDIS_URL);
      } else {
        // Fallback para configuração manual (para desenvolvimento local)
        const redisConfig = {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          password: process.env.REDIS_PASSWORD,
          retryDelayOnFailover: 100,
          enableReadyCheck: false,
          maxRetriesPerRequest: null,
          lazyConnect: true,
        };
        this.client = new Redis(redisConfig);
        this.subscriber = new Redis(redisConfig);
        this.publisher = new Redis(redisConfig);
      }

      // Event handlers
      this.client.on('connect', () => {
        logger.info('Redis client connected');
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
      });

      this.client.on('error', (error) => {
        logger.error('Redis client error:', error);
      });

      this.client.on('close', () => {
        logger.warn('Redis client connection closed');
      });

      this.client.on('reconnecting', () => {
        logger.info('Redis client reconnecting...');
      });

      // Connect to Redis
      await this.client.connect();
      await this.subscriber.connect();
      await this.publisher.connect();

      logger.info('Redis connections established successfully');
      
    } catch (error) {
      logger.error('Redis connection failed:', error);
      throw error;
    }
  }

  // Cache operations
  async set(key, value, ttl = null) {
    try {
      const serializedValue = JSON.stringify(value);
      if (ttl) {
        return await this.client.setex(key, ttl, serializedValue);
      }
      return await this.client.set(key, serializedValue);
    } catch (error) {
      logger.error('Redis SET error:', { key, error: error.message });
      throw error;
    }
  }

  async get(key) {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis GET error:', { key, error: error.message });
      return null;
    }
  }

  async del(key) {
    try {
      return await this.client.del(key);
    } catch (error) {
      logger.error('Redis DEL error:', { key, error: error.message });
      throw error;
    }
  }

  async exists(key) {
    try {
      return await this.client.exists(key);
    } catch (error) {
      logger.error('Redis EXISTS error:', { key, error: error.message });
      return false;
    }
  }

  async expire(key, ttl) {
    try {
      return await this.client.expire(key, ttl);
    } catch (error) {
      logger.error('Redis EXPIRE error:', { key, ttl, error: error.message });
      throw error;
    }
  }

  // Hash operations
  async hset(key, field, value) {
    try {
      const serializedValue = JSON.stringify(value);
      return await this.client.hset(key, field, serializedValue);
    } catch (error) {
      logger.error('Redis HSET error:', { key, field, error: error.message });
      throw error;
    }
  }

  async hget(key, field) {
    try {
      const value = await this.client.hget(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis HGET error:', { key, field, error: error.message });
      return null;
    }
  }

  async hgetall(key) {
    try {
      const hash = await this.client.hgetall(key);
      const result = {};
      for (const [field, value] of Object.entries(hash)) {
        try {
          result[field] = JSON.parse(value);
        } catch {
          result[field] = value;
        }
      }
      return result;
    } catch (error) {
      logger.error('Redis HGETALL error:', { key, error: error.message });
      return {};
    }
  }

  // List operations
  async lpush(key, ...values) {
    try {
      const serializedValues = values.map(v => JSON.stringify(v));
      return await this.client.lpush(key, ...serializedValues);
    } catch (error) {
      logger.error('Redis LPUSH error:', { key, error: error.message });
      throw error;
    }
  }

  async rpop(key) {
    try {
      const value = await this.client.rpop(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis RPOP error:', { key, error: error.message });
      return null;
    }
  }

  async llen(key) {
    try {
      return await this.client.llen(key);
    } catch (error) {
      logger.error('Redis LLEN error:', { key, error: error.message });
      return 0;
    }
  }

  // Pub/Sub operations
  async publish(channel, message) {
    try {
      const serializedMessage = JSON.stringify(message);
      return await this.publisher.publish(channel, serializedMessage);
    } catch (error) {
      logger.error('Redis PUBLISH error:', { channel, error: error.message });
      throw error;
    }
  }

  async subscribe(channel, callback) {
    try {
      await this.subscriber.subscribe(channel);
      this.subscriber.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          try {
            const parsedMessage = JSON.parse(message);
            callback(parsedMessage);
          } catch (error) {
            logger.error('Error parsing Redis message:', error);
          }
        }
      });
    } catch (error) {
      logger.error('Redis SUBSCRIBE error:', { channel, error: error.message });
      throw error;
    }
  }

  // Rate limiting
  async rateLimit(key, limit, window) {
    try {
      const current = await this.client.incr(key);
      if (current === 1) {
        await this.client.expire(key, window);
      }
      return {
        current,
        remaining: Math.max(0, limit - current),
        resetTime: Date.now() + (window * 1000)
      };
    } catch (error) {
      logger.error('Redis rate limit error:', { key, error: error.message });
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.quit();
      }
      if (this.subscriber) {
        await this.subscriber.quit();
      }
      if (this.publisher) {
        await this.publisher.quit();
      }
      logger.info('Redis connections closed');
    } catch (error) {
      logger.error('Error closing Redis connections:', error);
    }
  }
}

module.exports = new RedisClient();