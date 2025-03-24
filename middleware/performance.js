import logger from './logger.js';

// Simple performance monitoring middleware
export const performanceMonitor = (req, res, next) => {
  const start = process.hrtime();
  
  // Once the response is finished
  res.on('finish', () => {
    const diff = process.hrtime(start);
    const time = diff[0] * 1000 + diff[1] / 1000000;
    
    // Log slow requests (over 1000ms)
    if (time > 1000) {
      logger.warn(`Slow request: ${req.method} ${req.originalUrl} took ${time.toFixed(2)}ms`, {
        method: req.method,
        url: req.originalUrl,
        timeMs: time.toFixed(2),
        statusCode: res.statusCode,
        userId: req.user?.userId
      });
    }
    
    // Add timing header
    if (!res.headersSent) {
      try {
        res.set('X-Response-Time', `${time.toFixed(2)}ms`);
      } catch (err) {
                logger.debug('Could not set response time header', { error: err.message });
      }
    }
  });
  
  next();
};

// Memory usage monitor
export const memoryMonitor = (req, res, next) => {
  const memoryUsage = process.memoryUsage();
  const threshold = 0.8;
  
  const memoryUsageInMB = {
    rss: (memoryUsage.rss / 1024 / 1024).toFixed(2),
    heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
    heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
    external: (memoryUsage.external / 1024 / 1024).toFixed(2),
  };
  
  // Check if memory usage is above threshold then force garbage collection
  if (memoryUsage.heapUsed / memoryUsage.heapTotal > threshold) {
    logger.warn('High memory usage detected', { memoryUsage: memoryUsageInMB });
    
    if (memoryUsage.heapUsed / memoryUsage.heapTotal > 0.9 && global.gc) {
      logger.warn('Attempting to force garbage collection');
      try {
        global.gc();
      } catch (e) {
        logger.error('Failed to force garbage collection', { error: e.message });
      }
    }
  }
  
  next();
};

// Export a function to check and log memory usage on demand
export const checkMemoryUsage = () => {
  const memoryUsage = process.memoryUsage();
  const memoryUsageInMB = {
    rss: (memoryUsage.rss / 1024 / 1024).toFixed(2),
    heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
    heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
    external: (memoryUsage.external / 1024 / 1024).toFixed(2),
  };
  
  logger.debug('Current memory usage', { memoryUsage: memoryUsageInMB });
  return memoryUsageInMB;
};
