import logger from './logger.js';

// API error class
export class ApiError extends Error {
  constructor(message, statusCode, type = 'api_error', isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.type = type;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 404 handler
export const notFoundHandler = (req, res, next) => {
  const error = new ApiError(`Not Found - ${req.originalUrl}`, 404, 'not_found');
  next(error);
};

// Error handler middleware
export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong';
  let type = err.type || 'server_error';
  let details = err.details;
  let isOperational = err.isOperational || false;
  
  // Handle common errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    type = 'validation_error';
    details = err.errors;
    isOperational = true;
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
    type = 'invalid_id';
    isOperational = true;
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate key error';
    type = 'duplicate_key';
    details = err.keyValue;
    isOperational = true;
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    type = 'authentication_error';
    isOperational = true;
  }
  
  // Log based on error severity
  if (isOperational) {
    logger.warn(`${statusCode} - ${message}`, { type, path: req.path, method: req.method });
  } else {
    logger.error(`Unhandled error: ${message}`, {
      statusCode,
      type,
      path: req.path,
      method: req.method,
      stack: err.stack
    });
  }
  
  // Build response object
  const response = {
    success: false,
    error: {
      message,
      type,
      ...(details && { details }),
      ...(process.env.NODE_ENV !== 'production' && !isOperational && { stack: err.stack })
    }
  };
  
  res.status(statusCode).json(response);
};

// Async handler wrapper
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default { ApiError, notFoundHandler, errorHandler, asyncHandler };
