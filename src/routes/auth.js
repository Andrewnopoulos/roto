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
const logger = require('../utils/logger');

// Import controllers (to be implemented)
const authController = require('../controllers/authController');

/**
 * POST /api/auth/register
 * Register a new user account
 * 
 * Body: { email, username, password, confirmPassword }
 * Response: { success, message, user }
 */
router.post('/register',
  authRateLimiter,
  [
    validationRules.email,
    validationRules.username,
    validationRules.password,
    validateRequest
  ],
  asyncHandler(authController.register)
);

/**
 * POST /api/auth/login
 * Authenticate user credentials
 * 
 * Body: { email, password }
 * Response: { success, token, refreshToken, user }
 */
router.post('/login',
  authRateLimiter,
  [
    validationRules.email,
    validateRequest
  ],
  asyncHandler(authController.login)
);

/**
 * POST /api/auth/logout
 * Invalidate user session and tokens
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { success, message }
 */
router.post('/logout',
  asyncHandler(authController.logout)
);

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 * 
 * Body: { refreshToken }
 * Response: { success, token, refreshToken }
 */
router.post('/refresh',
  authRateLimiter,
  asyncHandler(authController.refreshToken)
);

/**
 * POST /api/auth/forgot-password
 * Initiate password reset process
 * 
 * Body: { email }
 * Response: { success, message }
 */
router.post('/forgot-password',
  authRateLimiter,
  [
    validationRules.email,
    validateRequest
  ],
  asyncHandler(authController.forgotPassword)
);

/**
 * POST /api/auth/reset-password
 * Reset password using reset token
 * 
 * Body: { token, password, confirmPassword }
 * Response: { success, message }
 */
router.post('/reset-password',
  authRateLimiter,
  [
    validationRules.password,
    validateRequest
  ],
  asyncHandler(authController.resetPassword)
);

/**
 * GET /api/auth/verify-email/:token
 * Verify email address using verification token
 * 
 * Params: { token }
 * Response: { success, message }
 */
router.get('/verify-email/:token',
  asyncHandler(authController.verifyEmail)
);

/**
 * POST /api/auth/resend-verification
 * Resend email verification
 * 
 * Body: { email }
 * Response: { success, message }
 */
router.post('/resend-verification',
  authRateLimiter,
  [
    validationRules.email,
    validateRequest
  ],
  asyncHandler(authController.resendVerification)
);

module.exports = router;