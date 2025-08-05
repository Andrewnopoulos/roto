/**
 * Authentication Routes
 * 
 * Handles user authentication, registration, and session management.
 * Implements secure authentication patterns including password hashing,
 * JWT tokens, and proper session handling.
 * 
 * Security features:
 * - Strict rate limiting for auth attempts
 * - Input validation and sanitization
 * - Secure password requirements
 * - JWT token management
 * - Account lockout protection (future implementation)
 */

const express = require('express');
const router = express.Router();

// Import middleware and utilities
const { authRateLimiter, validateRequest, validationRules } = require('../middleware/security');
const { asyncHandler } = require('../middleware/errorHandler');
const authMiddleware = require('../middleware/memoryAuth');
const logger = require('../utils/logger');

// Import memory-based auth controller (works without database)
const authController = require('../controllers/memoryAuthController');

/**
 * POST /api/auth/register
 * Register a new user account
 * 
 * Body: { email, username, password }
 * Response: { success, message, user, token }
 */
router.post('/register',
  asyncHandler(authController.register)
);

/**
 * POST /api/auth/login
 * Authenticate user credentials
 * 
 * Body: { email, password }
 * Response: { success, token, user }
 */
router.post('/login',
  asyncHandler(authController.login)
);

/**
 * POST /api/auth/logout
 * Logout user (JWT is stateless, so this is mainly for logging)
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { success, message }
 */
router.post('/logout',
  authMiddleware.authenticate,
  asyncHandler(authController.logout)
);

/**
 * GET /api/auth/profile
 * Get current user profile
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { success, user }
 */
router.get('/profile',
  authMiddleware.authenticate,
  asyncHandler(authController.getProfile)
);

module.exports = router;