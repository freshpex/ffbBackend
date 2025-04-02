import logger from './logger.js';

// Simple in-memory metrics storage
const metrics = {
  requests: {
    total: 0,
    byEndpoint: new Map(),
    byMethod: new Map(),
    byStatus: new Map()
  },
  responseTime: {
    total: 0,
    count: 0,
    byEndpoint: new Map()
  },
  errors: {
    total: 0,
    byEndpoint: new Map(),
    byType: new Map()
  },
  slowRequests: [],
  startTime: Date.now()
};

// Utility to increment a map counter
const incrementMapCounter = (map, key) => {
  map.set(key, (map.get(key) || 0) + 1);
};

// Utility to update a map average
const updateMapAverage = (map, key, value) => {
  if (!map.has(key)) {
    map.set(key, { total: 0, count: 0, avg: 0 });
  }
  
  const stat = map.get(key);
  stat.total += value;
  stat.count += 1;
  stat.avg = stat.total / stat.count;
};

// Performance monitoring middleware
export const performanceMonitor = (options = {}) => {
  const defaults = {
    slowThreshold: 1000,
    sampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    maxSlowRequests: 100,
  };
  
  const opts = { ...defaults, ...options };
  
  return (req, res, next) => {
    // Skip based on sample rate
    if (Math.random() > opts.sampleRate) {
      return next();
    }
    
    // Start timer
    const start = process.hrtime();
    
    // Track endpoint
    const endpoint = req.route?.path || req.path || req.originalUrl;
    const method = req.method;
    
    // Add response hook
    res.on('finish', () => {
      // Calculate time
      const [seconds, nanoseconds] = process.hrtime(start);
      const durationMs = (seconds * 1000) + (nanoseconds / 1000000);
      const statusCode = res.statusCode || 500;
      
      // Update metrics
      metrics.requests.total += 1;
      incrementMapCounter(metrics.requests.byEndpoint, endpoint);
      incrementMapCounter(metrics.requests.byMethod, method);
      incrementMapCounter(metrics.requests.byStatus, statusCode);
      
      // Response time metrics
      metrics.responseTime.total += durationMs;
      metrics.responseTime.count += 1;
      updateMapAverage(metrics.responseTime.byEndpoint, endpoint, durationMs);
      
      // Error metrics
      if (statusCode >= 400) {
        metrics.errors.total += 1;
        incrementMapCounter(metrics.errors.byEndpoint, endpoint);
        incrementMapCounter(metrics.errors.byType, statusCode >= 500 ? 'server' : 'client');
      }
      
      // Track slow requests
      if (durationMs > opts.slowThreshold) {
        logger.warn(`Slow request: ${method} ${endpoint} (${durationMs.toFixed(2)}ms)`);
        
        metrics.slowRequests.push({
          timestamp: new Date(),
          duration: durationMs,
          endpoint,
          method,
          statusCode
        });
        
        // Keep array size limited
        if (metrics.slowRequests.length > opts.maxSlowRequests) {
          metrics.slowRequests.shift();
        }
      }
    });
    
    next();
  };
};

// Memory monitoring middleware
export const memoryMonitor = (req, res, next) => {
  const memoryThresholdMB = 1024; // 1GB
  const memoryUsage = process.memoryUsage();
  
  // Check if memory usage exceeds threshold
  if (memoryUsage.heapUsed > memoryThresholdMB * 1024 * 1024) {
    // Only log in production or if it's serious
    if (process.env.NODE_ENV === 'production') {
      logger.warn('High memory usage detected', {
        memoryUsage: {
          rss: (memoryUsage.rss / (1024 * 1024)).toFixed(2),
          heapTotal: (memoryUsage.heapTotal / (1024 * 1024)).toFixed(2),
          heapUsed: (memoryUsage.heapUsed / (1024 * 1024)).toFixed(2),
          external: (memoryUsage.external / (1024 * 1024)).toFixed(2),
        },
      });
    }
  }
  
  next();
};

export const checkMemoryUsage = () => {
  const memoryUsage = process.memoryUsage();
  return {
    rss: (memoryUsage.rss / 1024 / 1024).toFixed(2),
    heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
    heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
    external: (memoryUsage.external / 1024 / 1024).toFixed(2),
  };
};
