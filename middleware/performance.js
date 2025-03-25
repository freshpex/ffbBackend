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
  slowRequests: [], // Array of slow request details
  startTime: Date.now()
};

// Utility to safely increment a map counter
const incrementMapCounter = (map, key) => {
  map.set(key, (map.get(key) || 0) + 1);
};

// Utility to safely add to a map average
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
    slowThreshold: 1000, // Log requests taking more than 1s
    sampleRate: 1.0, // Sample all requests by default
    maxSlowRequests: 100, // Keep track of at most 100 slow requests
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
        
        // Keep a limited history of slow requests
        if (metrics.slowRequests.length >= opts.maxSlowRequests) {
          // Remove the oldest entry
          metrics.slowRequests.shift();
        }
        
        metrics.slowRequests.push({
          method,
          endpoint,
          duration: durationMs,
          statusCode,
          timestamp: new Date().toISOString(),
          userId: req.user?.userId || null
        });
      }
    });
    
    next();
  };
};

// Utility to get performance metrics
export const getMetrics = () => {
  // Calculate additional metrics
  const avgResponseTime = metrics.responseTime.count > 0 
    ? metrics.responseTime.total / metrics.responseTime.count 
    : 0;
  
  // Calculate error rate
  const errorRate = metrics.requests.total > 0 
    ? (metrics.errors.total / metrics.requests.total) * 100 
    : 0;
  
  // Convert maps to objects for better serialization
  const endpointStats = Object.fromEntries(
    Array.from(metrics.responseTime.byEndpoint.entries()).map(([key, value]) => [
      key, 
      { 
        avg: value.avg.toFixed(2), 
        count: value.count, 
        errors: metrics.errors.byEndpoint.get(key) || 0 
      }
    ])
  );
  
  return {
    uptime: Math.floor((Date.now() - metrics.startTime) / 1000),
    requests: {
      total: metrics.requests.total,
      byMethod: Object.fromEntries(metrics.requests.byMethod),
      byStatus: Object.fromEntries(metrics.requests.byStatus)
    },
    responseTime: {
      avg: avgResponseTime.toFixed(2),
      byEndpoint: endpointStats
    },
    errors: {
      total: metrics.errors.total,
      rate: errorRate.toFixed(2) + '%',
      byType: Object.fromEntries(metrics.errors.byType)
    },
    slowRequests: metrics.slowRequests.slice(-10) // Return the 10 most recent slow requests
  };
};

// Middleware to reset metrics
export const resetMetrics = () => {
  metrics.requests.total = 0;
  metrics.requests.byEndpoint.clear();
  metrics.requests.byMethod.clear();
  metrics.requests.byStatus.clear();
  
  metrics.responseTime.total = 0;
  metrics.responseTime.count = 0;
  metrics.responseTime.byEndpoint.clear();
  
  metrics.errors.total = 0;
  metrics.errors.byEndpoint.clear();
  metrics.errors.byType.clear();
  
  metrics.slowRequests = [];
  metrics.startTime = Date.now();
  
  return { success: true, message: 'Metrics have been reset' };
};

// Route handler to get performance metrics
export const metricsHandler = (req, res) => {
  res.json(getMetrics());
};

export default performanceMonitor;

// Modify the memory monitoring to run less frequently
export const memoryMonitor = (req, res, next) => {
  // Only run monitoring on a sample of requests (e.g., 10%)
  if (Math.random() < 0.1) {
    const memoryUsage = process.memoryUsage();
    
    // Check if memory usage is high
    if (memoryUsage.heapUsed / memoryUsage.heapTotal > 0.85 || 
        memoryUsage.rss > 100 * 1024 * 1024) { // 100MB threshold
      logger.warn('High memory usage detected', {
        service: 'broker-api',
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
