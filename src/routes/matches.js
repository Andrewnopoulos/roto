/**
 * Match Management Routes
 * 
 * Handles match history, statistics, and match-related operations.
 * Provides endpoints for viewing completed matches, analyzing game data,
 * and managing match records.
 */

const express = require('express');
const router = express.Router();

// Import middleware and utilities
const { validateRequest } = require('../middleware/security');
const { asyncHandler } = require('../middleware/errorHandler');
const authMiddleware = require('../middleware/auth');

// Import controllers (to be implemented)
const matchController = require('../controllers/matchController');

/**
 * GET /api/matches/recent
 * Get recent public matches for the platform
 * 
 * Query: { page?, limit? }
 * Response: { success, matches, pagination }
 */
router.get('/recent',
  asyncHandler(matchController.getRecentMatches)
);

/**
 * GET /api/matches/:matchId
 * Get specific match details and replay data
 * 
 * Params: { matchId }
 * Response: { success, match }
 */
router.get('/:matchId',
  asyncHandler(matchController.getMatch)
);

// Authentication required for routes below
router.use(authMiddleware.authenticate);

/**
 * GET /api/matches/user/history
 * Get current user's match history
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Query: { page?, limit?, status?, opponent? }
 * Response: { success, matches, pagination, stats }
 */
router.get('/user/history',
  asyncHandler(matchController.getUserMatchHistory)
);

/**
 * GET /api/matches/user/stats
 * Get current user's detailed match statistics
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Query: { period?, gameMode? }
 * Response: { success, stats }
 */
router.get('/user/stats',
  asyncHandler(matchController.getUserMatchStats)
);

/**
 * POST /api/matches/:matchId/report
 * Report a match for review (cheating, inappropriate behavior, etc.)
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { matchId }
 * Body: { reason, description }
 * Response: { success, message }
 */
router.post('/:matchId/report',
  asyncHandler(matchController.reportMatch)
);

/**
 * GET /api/matches/:matchId/replay
 * Get match replay data (for matches user participated in)
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { matchId }
 * Response: { success, replayData }
 */
router.get('/:matchId/replay',
  asyncHandler(matchController.getMatchReplay)
);

/**
 * POST /api/matches/:matchId/favorite
 * Add match to user's favorites
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { matchId }
 * Response: { success, message }
 */
router.post('/:matchId/favorite',
  asyncHandler(matchController.favoriteMatch)
);

/**
 * DELETE /api/matches/:matchId/favorite
 * Remove match from user's favorites
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { matchId }
 * Response: { success, message }
 */
router.delete('/:matchId/favorite',
  asyncHandler(matchController.unfavoriteMatch)
);

/**
 * GET /api/matches/user/favorites
 * Get user's favorite matches
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Query: { page?, limit? }
 * Response: { success, matches, pagination }
 */
router.get('/user/favorites',
  asyncHandler(matchController.getUserFavoriteMatches)
);

/**
 * GET /api/matches/analysis/:matchId
 * Get detailed match analysis and insights
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { matchId }
 * Response: { success, analysis }
 */
router.get('/analysis/:matchId',
  asyncHandler(matchController.getMatchAnalysis)
);

module.exports = router;