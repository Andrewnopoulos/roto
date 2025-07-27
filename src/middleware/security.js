/**
 * Security Middleware Collection
 * 
 * This module provides a comprehensive set of security middleware to protect
 * against common web vulnerabilities and attacks. It implements defense-in-depth
 * strategies including rate limiting, input validation, and security headers.
 * 
 * Security features:
 * - Rate limiting to prevent abuse
 * - Request size limiting
 * - IP-based blocking capabilities
 * - Request sanitization
 * - Security logging
 */

const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * Rate limiting middleware to prevent abuse and DDoS attacks
 * Configurable based on environment variables
 */
const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later',
      retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
    });
  }
});

/**
 * Stricter rate limiting for authentication endpoints
 */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later',
    retryAfter: 900 // 15 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    
    res.status(429).json({
      error: 'Too many authentication attempts, please try again later',
      retryAfter: 900
    });
  }
});

/**
 * Request size limiter to prevent large payload attacks
 */
const requestSizeLimiter = (req, res, next) => {
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (req.headers['content-length'] && parseInt(req.headers['content-length']) > maxSize) {
    logger.warn('Request size too large', {
      ip: req.ip,
      contentLength: req.headers['content-length'],
      path: req.path
    });
    
    return res.status(413).json({
      error: 'Request entity too large',
      maxSize: '10MB'
    });
  }
  
  next();
};

/**
 * Input sanitization middleware
 * Removes potentially dangerous characters from request data
 */
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      // Remove potentially dangerous characters
      return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/javascript:/gi, '')
                .replace(/on\w+\s*=/gi, '');
    }
    
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          obj[key] = sanitize(obj[key]);
        }
      }
    }
    
    return obj;
  };
  
  if (req.body) {
    req.body = sanitize(req.body);
  }
  
  if (req.query) {
    req.query = sanitize(req.query);
  }
  
  if (req.params) {
    req.params = sanitize(req.params);
  }
  
  next();
};

/**
 * Security headers middleware
 * Adds additional security headers beyond helmet
 */
const securityHeaders = (req, res, next) => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Add custom security header
  res.setHeader('X-Powered-By', 'Roto-Game-Server');
  
  // Add request ID for tracking
  req.requestId = require('uuid').v4();
  res.setHeader('X-Request-ID', req.requestId);
  
  next();
};

/**
 * IP blocking middleware (for future implementation)
 * Can be extended to block specific IPs or IP ranges
 */
const ipFilter = (req, res, next) => {
  const blockedIPs = process.env.BLOCKED_IPS ? process.env.BLOCKED_IPS.split(',') : [];
  
  if (blockedIPs.includes(req.ip)) {
    logger.warn('Blocked IP attempted access', {
      ip: req.ip,
      path: req.path
    });
    
    return res.status(403).json({
      error: 'Access denied'
    });
  }
  
  next();
};

/**
 * Request validation helper
 * Checks for validation errors and returns appropriate response
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.warn('Request validation failed', {
      ip: req.ip,
      path: req.path,
      errors: errors.array()
    });
    
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(error => ({
        field: error.param,
        message: error.msg,
        value: error.value
      }))
    });
  }
  
  next();
};

/**
 * Common validation rules for different input types
 */
const validationRules = {
  email: body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
    
  password: body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    
  username: body('username')
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be between 3 and 20 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
    
  uuid: (field) => body(field)
    .isUUID()
    .withMessage(`${field} must be a valid UUID`)
};

/**
 * Combined security middleware stack
 * Apply this to routes that need comprehensive security
 */
const securityMiddleware = [
  ipFilter,
  requestSizeLimiter,
  securityHeaders,
  sanitizeInput
];

module.exports = {
  rateLimiter,
  authRateLimiter,
  requestSizeLimiter,
  sanitizeInput,
  securityHeaders,
  ipFilter,
  validateRequest,
  validationRules,
  securityMiddleware: (req, res, next) => {
    // Apply all security middleware in sequence
    let currentIndex = 0;
    
    const runNext = (err) => {
      if (err) return next(err);
      
      if (currentIndex >= securityMiddleware.length) {
        return next();
      }
      
      const middleware = securityMiddleware[currentIndex++];
      middleware(req, res, runNext);
    };
    
    runNext();
  }
};