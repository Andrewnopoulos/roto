/**
 * User Management Routes
 * 
 * Handles user profile operations, preferences, and account management.
 * All routes require authentication and implement proper authorization
 * to ensure users can only access and modify their own data.
 */

const express = require('express');
const router = express.Router();

// Import middleware and utilities
const { validateRequest, validationRules } = require('../middleware/security');
const { asyncHandler } = require('../middleware/errorHandler');
const authMiddleware = require('../middleware/auth');

// Import controllers (to be implemented)
const userController = require('../controllers/userController');

/**
 * Apply authentication middleware to all user routes
 * All routes in this module require a valid JWT token
 */
router.use(authMiddleware.authenticate);

/**
 * GET /api/users/profile
 * Get current user's profile information
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { success, user }
 */
router.get('/profile',
  asyncHandler(userController.getProfile)
);

/**
 * PUT /api/users/profile
 * Update current user's profile information
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Body: { username?, email?, firstName?, lastName?, avatar? }
 * Response: { success, user }
 */
router.put('/profile',
  [
    // Optional validation - only validate if fields are provided
    validationRules.username.optional(),
    validationRules.email.optional(),
    validateRequest
  ],
  asyncHandler(userController.updateProfile)
);

/**
 * GET /api/users/stats
 * Get current user's game statistics
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { success, stats }
 */
router.get('/stats',
  asyncHandler(userController.getStats)
);

/**
 * GET /api/users/match-history
 * Get current user's match history with pagination
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Query: { page?, limit?, status? }
 * Response: { success, matches, pagination }
 */
router.get('/match-history',
  asyncHandler(userController.getMatchHistory)
);

/**
 * POST /api/users/change-password
 * Change user's password
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Body: { currentPassword, newPassword, confirmPassword }
 * Response: { success, message }
 */
router.post('/change-password',
  [
    validationRules.password.withMessage('New password must meet security requirements'),
    validateRequest
  ],
  asyncHandler(userController.changePassword)
);

/**
 * GET /api/users/preferences
 * Get user's game preferences and settings
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { success, preferences }
 */
router.get('/preferences',
  asyncHandler(userController.getPreferences)
);

/**
 * PUT /api/users/preferences
 * Update user's game preferences and settings
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Body: { theme?, notifications?, gameSettings? }
 * Response: { success, preferences }
 */
router.put('/preferences',
  asyncHandler(userController.updatePreferences)
);

/**
 * DELETE /api/users/account
 * Delete user account (soft delete with confirmation)
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Body: { password, confirmation }
 * Response: { success, message }
 */
router.delete('/account',
  asyncHandler(userController.deleteAccount)
);

/**
 * GET /api/users/friends
 * Get user's friends list
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { success, friends }
 */
router.get('/friends',
  asyncHandler(userController.getFriends)
);

/**
 * POST /api/users/friends/request
 * Send friend request to another user
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Body: { userId }
 * Response: { success, message }
 */
router.post('/friends/request',
  [
    validationRules.uuid('userId'),
    validateRequest
  ],
  asyncHandler(userController.sendFriendRequest)
);

/**
 * PUT /api/users/friends/accept/:requestId
 * Accept a friend request
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { requestId }
 * Response: { success, message }
 */
router.put('/friends/accept/:requestId',
  asyncHandler(userController.acceptFriendRequest)
);

/**
 * DELETE /api/users/friends/:friendId
 * Remove a friend from friends list
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { friendId }
 * Response: { success, message }
 */
router.delete('/friends/:friendId',
  asyncHandler(userController.removeFriend)
);

module.exports = router;