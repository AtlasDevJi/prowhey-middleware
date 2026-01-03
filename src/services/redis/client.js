const Redis = require('ioredis');
const { logger } = require('../logger');

let redisClient = null;

function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  const config = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    db: parseInt(process.env.REDIS_DB || '0', 10),
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableOfflineQueue: true,
    lazyConnect: false,
  };

  if (process.env.REDIS_PASSWORD) {
    config.password = process.env.REDIS_PASSWORD;
  }

  redisClient = new Redis(config);

  redisClient.on('connect', () => {
    logger.info('Redis connecting', { host: config.host, port: config.port });
  });

  redisClient.on('ready', () => {
    logger.info('Redis connected', { host: config.host, port: config.port });
  });

  redisClient.on('error', (err) => {
    logger.error('Redis connection error', { error: err.message });
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  redisClient.on('reconnecting', (delay) => {
    logger.info('Redis reconnecting', { delay });
  });

  return redisClient;
}

function closeRedisClient() {
  if (redisClient) {
    redisClient.quit();
    redisClient = null;
  }
}

module.exports = { getRedisClient, closeRedisClient };


