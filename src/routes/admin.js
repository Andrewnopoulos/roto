/**
 * Admin Routes
 * 
 * Handles administrative functions for the Rota game platform.
 * All routes require admin authentication and implement comprehensive
 * logging for audit trails. Access to these routes is restricted to
 * users with administrative privileges.
 */

const express = require('express');
const router = express.Router();

// Import middleware and utilities
const { validateRequest } = require('../middleware/security');
const { asyncHandler } = require('../middleware/errorHandler');
const authMiddleware = require('../middleware/auth');

// Import controllers (to be implemented)
const adminController = require('../controllers/adminController');

/**
 * Apply authentication and admin authorization to all routes
 * All routes in this module require admin privileges
 */
router.use(authMiddleware.authenticate);
router.use(authMiddleware.requireAdmin);

/**
 * GET /api/admin/dashboard
 * Get admin dashboard overview with key metrics
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { success, dashboard }
 */
router.get('/dashboard',
  asyncHandler(adminController.getDashboard)
);

/**
 * GET /api/admin/stats
 * Get detailed platform statistics
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Query: { period?, detailed? }
 * Response: { success, stats }
 */
router.get('/stats',
  asyncHandler(adminController.getStats)
);

/**
 * GET /api/admin/users
 * Get user management list with search and filtering
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Query: { page?, limit?, search?, status?, role? }
 * Response: { success, users, pagination }
 */
router.get('/users',
  asyncHandler(adminController.getUsers)
);

/**
 * GET /api/admin/users/:userId
 * Get detailed information about a specific user
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { userId }
 * Response: { success, user, detailedStats }
 */
router.get('/users/:userId',
  asyncHandler(adminController.getUserDetails)
);

/**
 * PUT /api/admin/users/:userId/status
 * Update user account status (active, suspended, banned)
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { userId }
 * Body: { status, reason?, duration? }
 * Response: { success, user, message }
 */
router.put('/users/:userId/status',
  asyncHandler(adminController.updateUserStatus)
);

/**
 * PUT /api/admin/users/:userId/role
 * Update user role/permissions
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { userId }
 * Body: { role }
 * Response: { success, user, message }
 */
router.put('/users/:userId/role',
  asyncHandler(adminController.updateUserRole)
);

/**
 * GET /api/admin/games
 * Get list of all games with admin details
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Query: { page?, limit?, status?, host? }
 * Response: { success, games, pagination }
 */
router.get('/games',
  asyncHandler(adminController.getGames)
);

/**
 * DELETE /api/admin/games/:gameId
 * Force end/delete a game (emergency action)
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { gameId }
 * Body: { reason }
 * Response: { success, message }
 */
router.delete('/games/:gameId',
  asyncHandler(adminController.forceEndGame)
);

/**
 * GET /api/admin/matches
 * Get all matches with admin filtering options
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Query: { page?, limit?, status?, reported?, date? }
 * Response: { success, matches, pagination }
 */
router.get('/matches',
  asyncHandler(adminController.getMatches)
);

/**
 * GET /api/admin/reports
 * Get reported matches and user reports
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Query: { page?, limit?, status?, type? }
 * Response: { success, reports, pagination }
 */
router.get('/reports',
  asyncHandler(adminController.getReports)
);

/**
 * PUT /api/admin/reports/:reportId
 * Update report status and resolution
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { reportId }
 * Body: { status, resolution?, action? }
 * Response: { success, report, message }
 */
router.put('/reports/:reportId',
  asyncHandler(adminController.updateReport)
);

/**
 * GET /api/admin/logs
 * Get system logs with filtering (security-sensitive)
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Query: { page?, limit?, level?, date?, search? }
 * Response: { success, logs, pagination }
 */
router.get('/logs',
  asyncHandler(adminController.getLogs)
);

/**
 * POST /api/admin/announcements
 * Create platform-wide announcements
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Body: { title, message, type, targetUsers?, expiresAt? }
 * Response: { success, announcement }
 */
router.post('/announcements',
  asyncHandler(adminController.createAnnouncement)
);

/**
 * GET /api/admin/announcements
 * Get all announcements
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Query: { page?, limit?, active? }
 * Response: { success, announcements, pagination }
 */
router.get('/announcements',
  asyncHandler(adminController.getAnnouncements)
);

/**
 * PUT /api/admin/announcements/:announcementId
 * Update an announcement
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { announcementId }
 * Body: { title?, message?, type?, active? }
 * Response: { success, announcement }
 */
router.put('/announcements/:announcementId',
  asyncHandler(adminController.updateAnnouncement)
);

/**
 * DELETE /api/admin/announcements/:announcementId
 * Delete an announcement
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { announcementId }
 * Response: { success, message }
 */
router.delete('/announcements/:announcementId',
  asyncHandler(adminController.deleteAnnouncement)
);

/**
 * POST /api/admin/maintenance
 * Set platform maintenance mode
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Body: { enabled, message?, estimatedDuration? }
 * Response: { success, maintenanceStatus }
 */
router.post('/maintenance',
  asyncHandler(adminController.setMaintenanceMode)
);

module.exports = router;