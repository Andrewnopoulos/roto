/**
 * Leaderboard Routes
 * 
 * Handles leaderboard and ranking operations for the Rota game platform.
 * Provides various leaderboard views including global rankings, friend rankings,
 * and time-based leaderboards with proper caching for performance.
 */

const express = require('express');
const router = express.Router();

// Import middleware and utilities
const { asyncHandler } = require('../middleware/errorHandler');
const authMiddleware = require('../middleware/auth');

// Import controllers (to be implemented)
const leaderboardController = require('../controllers/leaderboardController');

/**
 * GET /api/leaderboard/global
 * Get global leaderboard rankings
 * 
 * Query: { page?, limit?, period?, gameMode? }
 * Response: { success, leaderboard, pagination, userRank? }
 */
router.get('/global',
  asyncHandler(leaderboardController.getGlobalLeaderboard)
);

/**
 * GET /api/leaderboard/top-players
 * Get top players with detailed stats
 * 
 * Query: { limit?, period? }
 * Response: { success, topPlayers }
 */
router.get('/top-players',
  asyncHandler(leaderboardController.getTopPlayers)
);

/**
 * GET /api/leaderboard/stats
 * Get general platform statistics
 * 
 * Response: { success, stats }
 */
router.get('/stats',
  asyncHandler(leaderboardController.getPlatformStats)
);

// Authentication required for routes below
router.use(authMiddleware.authenticate);

/**
 * GET /api/leaderboard/friends
 * Get leaderboard of user's friends
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Query: { page?, limit?, period? }
 * Response: { success, friendsLeaderboard, userRank }
 */
router.get('/friends',
  asyncHandler(leaderboardController.getFriendsLeaderboard)
);

/**
 * GET /api/leaderboard/user/rank
 * Get current user's rank and surrounding players
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Query: { period?, gameMode?, range? }
 * Response: { success, userRank, surroundingPlayers }
 */
router.get('/user/rank',
  asyncHandler(leaderboardController.getUserRank)
);

/**
 * GET /api/leaderboard/user/history
 * Get user's ranking history over time
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Query: { period?, gameMode? }
 * Response: { success, rankingHistory }
 */
router.get('/user/history',
  asyncHandler(leaderboardController.getUserRankingHistory)
);

/**
 * GET /api/leaderboard/seasonal
 * Get seasonal leaderboard rankings
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Query: { season?, page?, limit? }
 * Response: { success, seasonalLeaderboard, userRank }
 */
router.get('/seasonal',
  asyncHandler(leaderboardController.getSeasonalLeaderboard)
);

/**
 * GET /api/leaderboard/achievements
 * Get achievement leaderboard (most achievements, rare achievements, etc.)
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Query: { type?, page?, limit? }
 * Response: { success, achievementLeaderboard }
 */
router.get('/achievements',
  asyncHandler(leaderboardController.getAchievementLeaderboard)
);

module.exports = router;