import winston from 'winston';
import util from 'util';

// Define log formats
const { combine, timestamp, printf, colorize, json, errors } = winston.format;

// Safe stringify function to handle circular references
const safeStringify = (obj, replacer = null, spaces = 2, cycleReplacer = null) => {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (key, value) => {
      // Handle Error objects specially
      if (value instanceof Error) {
        return {
          message: value.message,
          stack: process.env.NODE_ENV === 'production' ? undefined : value.stack
        };
      }
      
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return cycleReplacer ? cycleReplacer(key, value) : '[Circular]';
        }
        seen.add(value);
      }
      return replacer ? replacer(key, value) : value;
    },
    spaces
  );
};

// Create development format (more human-readable)
const developmentFormat = combine(
  errors({ stack: true }),
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? 
      `\n${util.inspect(meta, { colors: true, depth: 5 })}` : '';
    return `${timestamp} ${level}: ${message}${metaStr}`;
  })
);

// Create production format (structured JSON for cloud logging)
const productionFormat = combine(
  errors({ stack: true }),
  timestamp(),
  json()
);

// Create the logger instance with console-only transport
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: process.env.NODE_ENV === 'production' ? productionFormat : developmentFormat,
  defaultMeta: { service: 'broker-api' },
  transports: [
    // Console transport only
    new winston.transports.Console()
  ]
});

// Create HTTP request logger middleware with safe object handling
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Prepare safe request info for logging
  const safeReq = {
    method: req.method,
    url: req.originalUrl,
    query: req.query,
    params: req.params,
    headers: {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length'],
      'accept': req.headers['accept'],
      // Omit sensitive headers like authorization
    },
    // Include body for non-GET/HEAD requests, but omit sensitive fields
    ...(req.method !== 'GET' && req.method !== 'HEAD' && {
      body: Object.fromEntries(
        Object.entries(req.body || {}).filter(
          ([key]) => !['password', 'token', 'secret'].includes(key)
        )
      )
    })
  };
  
  // Log the incoming request
  logger.info(`Request received: ${req.method} ${req.originalUrl}`, { 
    request: safeReq,
    ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress
  });
  
  // Log when the request is completed
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logObject = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress
    };
    
    // Add user ID if authenticated
    if (req.user && req.user.userId) {
      logObject.userId = req.user.userId;
    }
    
    // Choose log level based on status code
    if (res.statusCode >= 500) {
      logger.error('Server Error', logObject);
    } else if (res.statusCode >= 400) {
      logger.warn('Client Error', logObject);
    } else {
      logger.info('Request Completed', logObject);
    }
  });
  
  next();
};

// Error logging middleware with safe error handling
export const errorLogger = (err, req, res, next) => {
  // Extract important, safe-to-log properties
  const safeError = {
    message: err.message,
    name: err.name,
    status: err.status || err.statusCode,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    path: req.originalUrl,
    method: req.method
  };
  
  logger.error('Uncaught Exception', safeError);
  next(err);
};

// Export the logger for use elsewhere in the application
export default logger;
