/**
 * Global Error Handling Middleware
 * 
 * This middleware provides centralized error handling for the entire application.
 * It ensures consistent error responses, proper logging, and security by not
 * exposing sensitive information in production environments.
 * 
 * Features:
 * - Environment-aware error responses
 * - Comprehensive error logging
 * - Security-focused error sanitization
 * - Support for various error types
 * - HTTP status code determination
 */

const logger = require('../utils/logger');

/**
 * Custom error class for application-specific errors
 */
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = this.constructor.name;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Determine appropriate HTTP status code from error
 * @param {Error} error - The error object
 * @returns {number} HTTP status code
 */
function getStatusCode(error) {
  // Use existing status code if available
  if (error.statusCode) {
    return error.statusCode;
  }
  
  // Check for specific error types
  if (error.name === 'ValidationError') {
    return 400;
  }
  
  if (error.name === 'UnauthorizedError' || error.name === 'JsonWebTokenError') {
    return 401;
  }
  
  if (error.name === 'ForbiddenError') {
    return 403;
  }
  
  if (error.name === 'NotFoundError') {
    return 404;
  }
  
  if (error.name === 'ConflictError') {
    return 409;
  }
  
  if (error.code === 'LIMIT_FILE_SIZE') {
    return 413;
  }
  
  if (error.type === 'entity.parse.failed') {
    return 400;
  }
  
  // Default to 500 for unknown errors
  return 500;
}

/**
 * Sanitize error for client response
 * Removes sensitive information in production
 * @param {Error} error - The error object
 * @param {boolean} isDevelopment - Whether in development mode
 * @returns {Object} Sanitized error object
 */
function sanitizeError(error, isDevelopment) {
  const statusCode = getStatusCode(error);
  
  // Base error response
  const errorResponse = {
    error: {
      message: error.message || 'Internal Server Error',
      status: statusCode,
      timestamp: new Date().toISOString()
    }
  };
  
  // Add additional details in development
  if (isDevelopment) {
    errorResponse.error.stack = error.stack;
    errorResponse.error.name = error.name;
    
    // Add any additional error properties
    Object.keys(error).forEach(key => {
      if (!['message', 'stack', 'name'].includes(key)) {
        errorResponse.error[key] = error[key];
      }
    });
  } else {
    // In production, only show generic messages for 5xx errors
    if (statusCode >= 500) {
      errorResponse.error.message = 'Internal Server Error';
    }
  }
  
  return errorResponse;
}

/**
 * Log error with appropriate level and context
 * @param {Error} error - The error object
 * @param {Object} req - Express request object
 * @param {number} statusCode - HTTP status code
 */
function logError(error, req, statusCode) {
  const logLevel = statusCode >= 500 ? 'error' : 'warn';
  
  const errorContext = {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user ? req.user.id : null
    },
    statusCode
  };
  
  logger[logLevel]('Request error occurred', errorContext);
}

/**
 * Main error handling middleware
 * This must be the last middleware in the stack
 */
function errorHandler(error, req, res, next) {
  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(error);
  }
  
  const isDevelopment = process.env.NODE_ENV === 'development';
  const statusCode = getStatusCode(error);
  
  // Log the error
  logError(error, req, statusCode);
  
  // Sanitize error for response
  const sanitizedError = sanitizeError(error, isDevelopment);
  
  // Send error response
  res.status(statusCode).json(sanitizedError);
}

/**
 * Middleware to handle 404 errors for undefined routes
 */
function notFoundHandler(req, res, next) {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error);
}

/**
 * Async error wrapper for route handlers
 * Automatically catches and forwards async errors
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped route handler
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create a new application error
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {boolean} isOperational - Whether error is operational
 * @returns {AppError} New application error
 */
function createError(message, statusCode = 500, isOperational = true) {
  return new AppError(message, statusCode, isOperational);
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  createError,
  AppError
};