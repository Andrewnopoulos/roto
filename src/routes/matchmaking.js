/**
 * Matchmaking Routes
 * 
 * Handles matchmaking queue operations, quickplay functionality,
 * and skill-based player matching for the Rota game platform.
 */

const express = require('express');
const router = express.Router();

// Import middleware and utilities
const { validateRequest } = require('../middleware/security');
const { asyncHandler } = require('../middleware/errorHandler');
const authMiddleware = require('../middleware/memoryAuth');

// Import controllers
const matchmakingController = require('../controllers/matchmakingController');

/**
 * POST /api/matchmaking/guest-quickplay
 * Start guest quickplay - create room for anonymous play
 * 
 * No authentication required
 * Response: { success, message, roomId, isGuest }
 */
router.post('/guest-quickplay',
  asyncHandler(matchmakingController.guestQuickplay)
);

// All other matchmaking routes require authentication
router.use(authMiddleware.authenticate);

/**
 * POST /api/matchmaking/quickplay
 * Start quickplay - instantly join casual matchmaking queue
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { success, message, queueEntry }
 */
router.post('/quickplay',
  asyncHandler(matchmakingController.quickplay)
);

/**
 * POST /api/matchmaking/join
 * Join matchmaking queue with custom preferences
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Body: { ranked?, gameMode?, allowSpectators? }
 * Response: { success, message, queueEntry }
 */
router.post('/join',
  asyncHandler(matchmakingController.joinQueue)
);

/**
 * DELETE /api/matchmaking/leave
 * Leave the matchmaking queue
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { success, message }
 */
router.delete('/leave',
  asyncHandler(matchmakingController.leaveQueue)
);

/**
 * GET /api/matchmaking/status
 * Get current queue status for the user and global stats
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { success, playerStatus, globalStatus }
 */
router.get('/status',
  asyncHandler(matchmakingController.getQueueStatus)
);

/**
 * POST /api/matchmaking/cancel
 * Cancel search and get suggestions for better matchmaking
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { success, message, suggestions }
 */
router.post('/cancel',
  asyncHandler(matchmakingController.cancelSearch)
);

/**
 * GET /api/matchmaking/stats
 * Get matchmaking statistics and performance data
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { success, stats }
 */
router.get('/stats',
  asyncHandler(matchmakingController.getMatchmakingStats)
);

// Admin routes - require additional permissions
/**
 * GET /api/matchmaking/admin/global-status
 * Get detailed global queue information (admin only)
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { success, globalStatus }
 */
router.get('/admin/global-status',
  asyncHandler(matchmakingController.getGlobalQueueStatus)
);

/**
 * POST /api/matchmaking/admin/force-match
 * Force match creation between two players (admin only)
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Body: { player1Id, player2Id }
 * Response: { success, message, matchData }
 */
router.post('/admin/force-match',
  asyncHandler(matchmakingController.forceMatch)
);

module.exports = router;