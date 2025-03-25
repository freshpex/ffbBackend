import logger from './logger.js';

// Custom error class with status code and error type
export class ApiError extends Error {
  constructor(message, statusCode, type = 'general_error', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.type = type;
    this.details = details;
    this.isOperational = true; // Indicate this is an expected error
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

// Not Found error handler middleware
export const notFoundHandler = (req, res, next) => {
  const error = new ApiError(`Not Found - ${req.originalUrl}`, 404, 'not_found');
  next(error);
};

// Central error handler middleware
export const errorHandler = (err, req, res, next) => {
  // Default values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong';
  let type = err.type || 'server_error';
  let details = err.details || null;
  
  // Set operational status
  const isOperational = err.isOperational || false;
  
  // Handle different error types
  if (err.name === 'ValidationError') {
    // Mongoose validation error
    statusCode = 400;
    message = 'Validation Error';
    type = 'validation_error';
    details = Object.values(err.errors).map(e => e.message);
  } else if (err.name === 'CastError') {
    // Mongoose cast error (e.g., invalid ObjectId)
    statusCode = 400;
    message = 'Invalid ID format';
    type = 'invalid_id';
  } else if (err.code === 11000) {
    // MongoDB duplicate key error
    statusCode = 409;
    message = 'Duplicate key error';
    type = 'duplicate_key';
    details = err.keyValue;
  } else if (err.name === 'JsonWebTokenError') {
    // JWT errors
    statusCode = 401;
    message = 'Invalid token';
    type = 'authentication_error';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    type = 'authentication_error';
  }
  
  // If this is a known/expected error, log as warning
  if (isOperational) {
    logger.warn(`${statusCode} - ${message}`, {
      type,
      path: req.path,
      method: req.method
    });
  } else {
    // For unexpected errors, log as error with stack trace
    logger.error(`Unhandled error: ${message}`, {
      statusCode,
      type,
      path: req.path,
      method: req.method,
      stack: err.stack,
      body: req.body
    });
  }
  
  // In production, don't send stack traces
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

// Async handler to avoid try/catch in route handlers
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default { ApiError, notFoundHandler, errorHandler, asyncHandler };
