import winston from 'winston';
import 'winston-daily-rotate-file';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Create format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return `${timestamp} ${level.toUpperCase()}: ${message} ${
      Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
    }`;
  })
);

// Log file configuration
const fileRotateTransport = new winston.transports.DailyRotateFile({
  filename: 'logs/application-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxFiles: '14d',
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

// Console transport
const consoleTransport = new winston.transports.Console({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} ${level}: ${message} ${
        Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
      }`;
    })
  ),
});

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format,
  transports: [
    fileRotateTransport,
    consoleTransport
  ],
  exitOnError: false,
});

// Stream for Morgan
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

// Safe stringify to handle circular references
const safeStringify = (obj, replacer = null, spaces = 2) => {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (key, value) => {
      if (value instanceof Error) {
        return {
          message: value.message,
          stack: process.env.NODE_ENV === 'production' ? undefined : value.stack
        };
      }
      
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return replacer ? replacer(key, value) : value;
    },
    spaces
  );
};

// Simplified request logger middleware
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(2, 15);
  req.requestId = requestId;
  
  // Log only essential request info
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`Request [${requestId}]: ${req.method} ${req.originalUrl}`);
  }
  
  // Log when request completes
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Log minimal info in production, more in development
    if (res.statusCode >= 400) {
      const logLevel = res.statusCode >= 500 ? 'error' : 'warn';
      logger[logLevel](`Response [${requestId}]: ${res.statusCode} ${req.method} ${req.originalUrl} - ${duration}ms`);
    } else if (process.env.NODE_ENV !== 'production') {
      logger.info(`Response [${requestId}]: ${res.statusCode} - ${duration}ms`);
    }
  });
  
  next();
};

// Simplified error logger
export const errorLogger = (err, req, res, next) => {
  const safeError = {
    message: err.message,
    name: err.name,
    status: err.status || err.statusCode,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    path: req.originalUrl,
    method: req.method
  };
  
  logger.error('Error', safeError);
  next(err);
};

export default logger;
