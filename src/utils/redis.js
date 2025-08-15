import { createClient } from 'redis';
import dotenv from 'dotenv';
import logger from './logger.js';

dotenv.config();

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  retry_strategy: (options) => {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      logger.error('Redis server connection refused');
      return new Error('Redis server connection refused');
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      logger.error('Redis retry time exhausted');
      return new Error('Retry time exhausted');
    }
    if (options.attempt > 10) {
      return undefined;
    }
    return Math.min(options.attempt * 100, 3000);
  }
});

redisClient.on('error', (err) => {
  logger.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  logger.info('✅ Redis Client Connected');
});

redisClient.on('ready', () => {
  logger.info('📡 Redis Client Ready');
});

redisClient.on('end', () => {
  logger.info('📴 Redis Client Disconnected');
});

export const connectRedis = async () => {
  try {
    await redisClient.connect();
    logger.info('🔄 Redis connected successfully');
  } catch (error) {
    logger.error('❌ Redis connection failed:', error);
    throw error;
  }
};

// Cache utilities
export const setCache = async (key, value, expiration = 3600) => {
  try {
    await redisClient.setEx(key, expiration, JSON.stringify(value));
  } catch (error) {
    logger.error('Redis set error:', error);
  }
};

export const getCache = async (key) => {
  try {
    const value = await redisClient.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.error('Redis get error:', error);
    return null;
  }
};

export const deleteCache = async (key) => {
  try {
    await redisClient.del(key);
  } catch (error) {
    logger.error('Redis delete error:', error);
  }
};

export const flushCache = async () => {
  try {
    await redisClient.flushAll();
    logger.info('Redis cache flushed');
  } catch (error) {
    logger.error('Redis flush error:', error);
  }
};

export default redisClient;
