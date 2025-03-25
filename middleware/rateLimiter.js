import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';
import logger from './logger.js';

let redisClient;
let useRedis = false;

// Initialize Redis if configured
const initRedisClient = async () => {
  if (process.env.USE_REDIS === 'true' && process.env.REDIS_URL) {
    try {
      redisClient = createClient({
        url: process.env.REDIS_URL
      });
      
      redisClient.on('error', (err) => {
        logger.error('Redis error:', err);
        useRedis = false;
      });
      
      await redisClient.connect();
      useRedis = true;
      logger.info('Redis connected for rate limiting');
    } catch (error) {
      logger.error('Redis connection failed:', error);
      useRedis = false;
    }
  }
};

// Initialize Redis on startup
initRedisClient();

// Create a store based on availability
const getStore = () => {
  if (useRedis && redisClient) {
    return new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rate-limit:'
    });
  }
  
  return undefined; // Use default memory store
};

// Standard API rate limiter
export const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW) * 60 * 10000 || 15 * 60 * 10000, // 15 minutes by default
  max: Number(process.env.RATE_LIMIT_MAX) || 100, // 100 requests per window by default
  standardHeaders: true,
  legacyHeaders: false,
  store: getStore(),
  message: {
    success: false,
    error: {
      message: 'Too many requests, please try again later.',
      type: 'rate_limit_exceeded'
    }
  },
  skip: (req) => {
    // Skip rate limiting for trusted IPs if configured
    if (process.env.TRUSTED_IPS) {
      const trustedIps = process.env.TRUSTED_IPS.split(',');
      const clientIp = req.ip || req.headers['x-forwarded-for'];
      return trustedIps.includes(clientIp);
    }
    return false;
  },
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    return req.user ? `user:${req.user.userId}` : req.ip;
  },
  onLimitReached: (req, res, options) => {
    logger.warn(`Rate limit exceeded for ${req.ip}`, {
      path: req.path,
      method: req.method,
      user: req.user?.userId
    });
  }
});

// Stricter auth endpoint limiter
export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 100000, // 1 hour
  max: 20, // 20 attempts per hour
  standardHeaders: true,
  legacyHeaders: false,
  store: getStore(),
  message: {
    success: false,
    error: {
      message: 'Too many authentication attempts, please try again later.',
      type: 'auth_rate_limit_exceeded'
    }
  },
  keyGenerator: (req) => {
    // Use email if provided, otherwise IP
    const email = req.body.email?.toLowerCase();
    return email ? `auth:${email}` : `ip:${req.ip}`;
  },
  onLimitReached: (req, res, options) => {
    const email = req.body.email?.toLowerCase();
    logger.warn(`Auth rate limit exceeded`, {
      ip: req.ip,
      email: email,
      path: req.path
    });
  }
});

// Trading endpoint limiter
export const tradingLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 60, // 60 requests per 5 minutes
  standardHeaders: true,
  legacyHeaders: false,
  store: getStore(),
  message: {
    success: false,
    error: {
      message: 'Trading request rate exceeded, please try again later.',
      type: 'trading_rate_limit_exceeded'
    }
  },
  keyGenerator: (req) => {
    return req.user ? `trading:${req.user.userId}` : `ip:${req.ip}`;
  }
});

export default { apiLimiter, authLimiter, tradingLimiter };
