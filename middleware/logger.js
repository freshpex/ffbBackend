import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import util from 'util';

// Ensure logs directory exists
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

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
          name: value.name,
          stack: value.stack,
          ...(value.code && { code: value.code })
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

// Define log formats
const { combine, timestamp, printf, colorize, json } = winston.format;

// Custom format for console output
const consoleFormat = combine(
  colorize(),
  timestamp(),
  printf(info => {
    const { level, message, timestamp, ...meta } = info;
    
    // Handle metadata safely
    let metaString = '';
    if (Object.keys(meta).length > 0) {
      try {
        metaString = Object.keys(meta).length ? ` ${safeStringify(meta)}` : '';
      } catch (error) {
        metaString = ' [Metadata Stringification Error]';
      }
    }
    
    return `${timestamp} [${level}]: ${message}${metaString}`;
  })
);

// Custom format for file output
const fileFormat = combine(
  timestamp(),
  winston.format(info => {
    // Clone info to avoid modifying the original object
    const formattedInfo = { ...info };
    
    // Safely handle any potentially circular structures
    Object.keys(formattedInfo).forEach(key => {
      if (typeof formattedInfo[key] === 'object' && formattedInfo[key] !== null) {
        try {
          // Test if the object can be stringified normally
          JSON.stringify(formattedInfo[key]);
        } catch (error) {
          // If stringification fails, replace with safe version
          if (error.message.includes('circular')) {
            formattedInfo[key] = JSON.parse(
              safeStringify(formattedInfo[key], null, 2, () => '[Circular]')
            );
          }
        }
      }
    });
    
    return formattedInfo;
  })(),
  json()
);

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: fileFormat,
  defaultMeta: { service: 'broker-api' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat
    }),
    
    // Rotating file transport for all logs
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    }),
    
    // Separate file for errors only
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      level: 'error'
    })
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
