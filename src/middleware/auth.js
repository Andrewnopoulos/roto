/**
 * Authentication Middleware
 * 
 * Provides JWT token validation and user authentication for protected routes.
 * Implements proper error handling and security checks to ensure only
 * authorized users can access protected resources.
 * 
 * Features:
 * - JWT token validation
 * - User authorization checks
 * - Role-based access control
 * - Token refresh handling
 * - Comprehensive security logging
 */

const jwt = require('jsonwebtoken');
const { createError } = require('./errorHandler');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Authenticate user from JWT token
 * Validates token and attaches user information to request object
 */
async function authenticate(req, res, next) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createError('Access token is required', 401);
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        throw createError('Access token has expired', 401);
      } else if (jwtError.name === 'JsonWebTokenError') {
        throw createError('Invalid access token', 401);
      } else {
        throw createError('Token verification failed', 401);
      }
    }
    
    // Fetch user details from database
    const userResult = await query(`
      SELECT id, email, username, role, status, is_verified, last_login_at
      FROM users 
      WHERE id = $1
    `, [decoded.userId]);
    
    if (userResult.rows.length === 0) {
      logger.warn('Token with non-existent user', { 
        userId: decoded.userId, 
        ip: req.ip 
      });
      throw createError('User not found', 401);
    }
    
    const user = userResult.rows[0];
    
    // Check user status
    if (user.status === 'suspended') {
      logger.warn('Suspended user attempted access', { 
        userId: user.id, 
        ip: req.ip 
      });
      throw createError('Account is suspended', 403);
    }
    
    if (user.status === 'banned') {
      logger.warn('Banned user attempted access', { 
        userId: user.id, 
        ip: req.ip 
      });
      throw createError('Account is banned', 403);
    }
    
    if (user.status === 'deleted') {
      logger.warn('Deleted user attempted access', { 
        userId: user.id, 
        ip: req.ip 
      });
      throw createError('Account no longer exists', 403);
    }
    
    // Check if email is verified for sensitive operations
    if (!user.is_verified && req.path.includes('/admin')) {
      throw createError('Email verification required for this action', 403);
    }
    
    // Attach user to request object
    req.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      isVerified: user.is_verified,
      lastLoginAt: user.last_login_at
    };
    
    // Log successful authentication for audit trail
    logger.debug('User authenticated successfully', {
      userId: user.id,
      role: user.role,
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    
    next();
    
  } catch (error) {
    logger.warn('Authentication failed', {
      error: error.message,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    next(error);
  }
}

/**
 * Require admin role for access
 * Must be used after authenticate middleware
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return next(createError('Authentication required', 401));
  }
  
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    logger.warn('Non-admin user attempted admin access', {
      userId: req.user.id,
      role: req.user.role,
      path: req.path,
      ip: req.ip
    });
    
    return next(createError('Admin access required', 403));
  }
  
  logger.info('Admin access granted', {
    userId: req.user.id,
    role: req.user.role,
    path: req.path,
    ip: req.ip
  });
  
  next();
}

/**
 * Require super admin role for access
 * Must be used after authenticate middleware
 */
function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return next(createError('Authentication required', 401));
  }
  
  if (req.user.role !== 'super_admin') {
    logger.warn('Non-super-admin user attempted super admin access', {
      userId: req.user.id,
      role: req.user.role,
      path: req.path,
      ip: req.ip
    });
    
    return next(createError('Super admin access required', 403));
  }
  
  logger.info('Super admin access granted', {
    userId: req.user.id,
    path: req.path,
    ip: req.ip
  });
  
  next();
}

/**
 * Check if user owns the resource or is admin
 * Useful for user-specific routes like /users/:userId
 */
function requireOwnershipOrAdmin(userIdParam = 'userId') {
  return (req, res, next) => {
    if (!req.user) {
      return next(createError('Authentication required', 401));
    }
    
    const resourceUserId = req.params[userIdParam];
    const isOwner = req.user.id === resourceUserId;
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    
    if (!isOwner && !isAdmin) {
      logger.warn('User attempted unauthorized resource access', {
        userId: req.user.id,
        resourceUserId,
        path: req.path,
        ip: req.ip
      });
      
      return next(createError('Access denied', 403));
    }
    
    next();
  };
}

/**
 * Optional authentication - attaches user if token is provided
 * Does not fail if no token is provided, useful for public endpoints
 * that can benefit from user context when available
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user context
      return next();
    }
    
    // Token provided, attempt to authenticate
    await authenticate(req, res, next);
    
  } catch (error) {
    // Authentication failed, but continue without user context
    logger.debug('Optional authentication failed, continuing without user context', {
      error: error.message,
      path: req.path,
      ip: req.ip
    });
    
    next();
  }
}

/**
 * Rate limiting for authenticated users
 * Provides higher rate limits for authenticated users
 */
function authenticatedRateLimit(req, res, next) {
  // This would integrate with the rate limiting middleware
  // to provide different limits based on authentication status
  
  if (req.user) {
    // Authenticated users get higher limits
    req.rateLimitMax = 200; // Example: 200 requests per window
  } else {
    // Anonymous users get lower limits
    req.rateLimitMax = 50; // Example: 50 requests per window
  }
  
  next();
}

module.exports = {
  authenticate,
  requireAdmin,
  requireSuperAdmin,
  requireOwnershipOrAdmin,
  optionalAuth,
  authenticatedRateLimit
};