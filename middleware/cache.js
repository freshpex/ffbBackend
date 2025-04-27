import logger from "./logger.js";

// Cache durations in seconds
const CACHE_DURATIONS = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  VERY_LONG: 86400, // 24 hours
};

// Routes that should be cached with their TTL
const CACHE_ROUTES = {
  "/api/market/tickers": CACHE_DURATIONS.SHORT,
  "/api/market/stats": CACHE_DURATIONS.SHORT,
  "/api/market/exchangeInfo": CACHE_DURATIONS.LONG,
  "/api/investments/plans": CACHE_DURATIONS.VERY_LONG,
};

// Setup the Redis cache middleware
export const setupRedisCache = (app, redisClient) => {
  if (!redisClient || !redisClient.isReady) {
    logger.warn("Redis client not available, caching disabled");
    return;
  }

  // Cache middleware
  app.use(async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== "GET") return next();

    // Check if this route should be cached
    const routeToCacheCheck = Object.keys(CACHE_ROUTES).find((route) =>
      req.originalUrl.startsWith(route),
    );

    if (!routeToCacheCheck) return next();

    // Create cache key from URL and query params
    const cacheKey = `api:${req.originalUrl}`;

    try {
      const cachedResponse = await redisClient.get(cacheKey);

      if (cachedResponse) {
        const parsedResponse = JSON.parse(cachedResponse);
        logger.debug(`Cache hit for ${cacheKey}`);
        return res.status(200).json(parsedResponse);
      }

      // Cache miss, capture the response
      const originalSend = res.send;

      res.send = function (body) {
        // Only cache successful responses
        if (res.statusCode === 200) {
          try {
            const ttl = CACHE_ROUTES[routeToCacheCheck];
            redisClient.setEx(cacheKey, ttl, body);
            logger.debug(`Cached ${cacheKey} for ${ttl} seconds`);
          } catch (err) {
            logger.error("Error caching response:", err);
          }
        }

        return originalSend.call(this, body);
      };

      next();
    } catch (err) {
      logger.error("Cache middleware error:", err);
      next();
    }
  });
};

// Function to clear specific cache entries
export const clearCache = async (redisClient, pattern) => {
  if (!redisClient || !redisClient.isReady) return;

  try {
    const keys = await redisClient.keys(`api:${pattern}*`);

    if (keys.length > 0) {
      await redisClient.del(keys);
      logger.info(`Cleared ${keys.length} cache entries matching ${pattern}`);
    }
  } catch (err) {
    logger.error("Error clearing cache:", err);
  }
};
