import winston from 'winston';
import 'winston-daily-rotate-file';
import util from 'util';

// Define log levels and colors
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// Add colors to winston
winston.addColors(colors);

// Custom format for better readability
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    // Create a colorized level
    let levelOutput = level.toUpperCase();
    
    // Format the log message
    return `${timestamp} ${levelOutput}: ${message} ${
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

// Create a console transport with colors for terminal output
const consoleTransport = new winston.transports.Console({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      // Format the colorized log message
      return `${timestamp} ${level}: ${message} ${
        Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
      }`;
    })
  ),
});

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format,
  transports: [
    fileRotateTransport,
    consoleTransport
  ],
  // Don't exit on error
  exitOnError: false,
});

// Create a stream object for Morgan
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

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

// ANSI color codes for colored console output
const ansiColors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m"
};

// Create HTTP request logger middleware with safe object handling
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(2, 15);
  
  // Set request ID for tracking through logs
  req.requestId = requestId;
  
  // Determine method color
  const methodColor = getMethodColor(req.method);
  
  // Add bold, colored console log for IMMEDIATE visibility in terminal
  console.log(`${ansiColors.cyan}┌─────────────────────────────────────────┐${ansiColors.reset}`);
  console.log(`${ansiColors.cyan}│ 🔄 REQUEST [${requestId}]: ${methodColor}${req.method}${ansiColors.reset} ${req.originalUrl}`);
  console.log(`${ansiColors.cyan}│ ${ansiColors.yellow}${new Date().toISOString()}${ansiColors.reset}`);
  
  // Log query parameters if present
  if (Object.keys(req.query).length > 0) {
    console.log(`${ansiColors.cyan}│ Query: ${ansiColors.yellow}${JSON.stringify(req.query)}${ansiColors.reset}`);
  }
  
  // Log request body for non-GET requests (omitting sensitive data)
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length > 0) {
    const safeBody = { ...req.body };
    // Redact sensitive fields
    if (safeBody.password) safeBody.password = '******';
    if (safeBody.token) safeBody.token = '******';
    if (safeBody.firebaseToken) safeBody.firebaseToken = '******';
    if (safeBody.apiKey) safeBody.apiKey = '******';
    
    console.log(`${ansiColors.cyan}│ Body: ${ansiColors.yellow}${JSON.stringify(safeBody)}${ansiColors.reset}`);
  }
  
  console.log(`${ansiColors.cyan}│ IP: ${ansiColors.white}${req.ip || req.headers['x-forwarded-for'] || 'unknown'}${ansiColors.reset}`);
  console.log(`${ansiColors.cyan}└─────────────────────────────────────────┘${ansiColors.reset}`);
  
  // Prepare safe request info for logging
  const safeReq = {
    id: requestId,
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
          ([key]) => !['password', 'token', 'secret', 'firebaseToken'].includes(key.toLowerCase())
        )
      )
    })
  };
  
  // Log the incoming request
  logger.info(`Request [${requestId}]: ${req.method} ${req.originalUrl}`, { 
    request: safeReq,
    ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress
  });
  
  // Log when the request is completed
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logObject = {
      id: requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress
    };
    
    // Add user ID if authenticated
    if (req.user && req.user.userId) {
      logObject.userId = req.user.userId;
      logObject.userEmail = req.user.email;
      logObject.userRole = req.user.role;
    }
    
    // Choose color based on status code
    let statusColor = ansiColors.green; // 2xx
    if (res.statusCode >= 500) statusColor = ansiColors.red; // 5xx
    else if (res.statusCode >= 400) statusColor = ansiColors.yellow; // 4xx
    else if (res.statusCode >= 300) statusColor = ansiColors.cyan; // 3xx
    
    // Log response with color-coded status
    console.log(`${ansiColors.magenta}┌─────────────────────────────────────────┐${ansiColors.reset}`);
    console.log(`${ansiColors.magenta}│ 📤 RESPONSE [${requestId}]: ${methodColor}${req.method}${ansiColors.reset} ${req.originalUrl}`);
    console.log(`${ansiColors.magenta}│ ${statusColor}${res.statusCode}${ansiColors.reset} completed in ${ansiColors.yellow}${duration}ms${ansiColors.reset}`);
    console.log(`${ansiColors.magenta}└─────────────────────────────────────────┘${ansiColors.reset}`);
    
    // Choose log level based on status code
    if (res.statusCode >= 500) {
      logger.error(`Response [${requestId}]: Server Error`, logObject);
    } else if (res.statusCode >= 400) {
      logger.warn(`Response [${requestId}]: Client Error`, logObject);
    } else {
      logger.info(`Response [${requestId}]: Completed`, logObject);
    }
  });
  
  next();
};

// Helper function to get color based on HTTP method
function getMethodColor(method) {
  switch (method.toUpperCase()) {
    case 'GET': return ansiColors.green;
    case 'POST': return ansiColors.blue;
    case 'PUT': return ansiColors.yellow;
    case 'PATCH': return ansiColors.cyan;
    case 'DELETE': return ansiColors.red;
    default: return ansiColors.white;
  }
}

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
  
  // Add colored console log for errors
  console.log(`${ansiColors.red}┌─────────────────────────────────────────┐${ansiColors.reset}`);
  console.log(`${ansiColors.red}│ 🔥 ERROR: ${err.message}`);
  console.log(`${ansiColors.red}│ ${req.method} ${req.originalUrl}`);
  console.log(`${ansiColors.red}└─────────────────────────────────────────┘${ansiColors.reset}`);
  
  logger.error('Uncaught Exception', safeError);
  next(err);
};

// Export the logger for use elsewhere in the application
export default logger;
