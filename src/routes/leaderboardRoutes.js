const express = require('express');
const router = express.Router();
const LeaderboardController = require('../controllers/LeaderboardController');
const { LeaderboardValidation } = require('../middleware/validation');
const rateLimit = require('express-rate-limit');

// Rate limiting for leaderboard endpoints
const leaderboardLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: {
        success: false,
        message: 'Too many requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const updateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 20, // 20 updates per minute
    message: {
        success: false,
        message: 'Too many update requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting to all leaderboard routes
router.use(leaderboardLimiter);

/**
 * @route GET /api/leaderboards
 * @desc Get all leaderboard categories
 * @access Public
 */
router.get('/', LeaderboardController.getLeaderboardCategories);

/**
 * @route GET /api/leaderboards/:category
 * @desc Get leaderboard data for a specific category
 * @access Public
 */
router.get('/:category',
    LeaderboardValidation.validateLeaderboardCategory(),
    LeaderboardValidation.validateLeaderboardQuery(),
    LeaderboardController.getLeaderboard
);

/**
 * @route GET /api/leaderboards/:category/players/:playerId/rank
 * @desc Get player's rank in a specific leaderboard
 * @access Public
 */
router.get('/:category/players/:playerId/rank',
    LeaderboardValidation.validateLeaderboardCategory(),
    LeaderboardValidation.validatePlayerId(),
    LeaderboardController.getPlayerRank
);

/**
 * @route GET /api/leaderboards/:category/players/:playerId/surrounding
 * @desc Get players around a specific player's rank
 * @access Public
 */
router.get('/:category/players/:playerId/surrounding',
    LeaderboardValidation.validateLeaderboardCategory(),
    LeaderboardValidation.validatePlayerId(),
    LeaderboardController.getPlayersAroundRank
);

/**
 * @route GET /api/leaderboards/:category/analytics
 * @desc Get rank change analytics for a category
 * @access Public
 */
router.get('/:category/analytics',
    LeaderboardValidation.validateLeaderboardCategory(),
    LeaderboardValidation.validateAnalyticsQuery(),
    LeaderboardController.getRankChangeAnalytics
);

/**
 * @route POST /api/leaderboards/:category/recalculate
 * @desc Recalculate rankings for a category (Admin only)
 * @access Admin
 */
router.post('/:category/recalculate',
    updateLimiter,
    LeaderboardValidation.validateLeaderboardCategory(),
    LeaderboardController.recalculateRankings
);

/**
 * @route GET /api/leaderboards/players/:playerId/position-history
 * @desc Get position change history for a player
 * @access Public
 */
router.get('/players/:playerId/position-history',
    LeaderboardValidation.validatePlayerId(),
    LeaderboardValidation.validatePositionHistoryQuery(),
    LeaderboardController.getPlayerPositionHistory
);

/**
 * @route POST /api/leaderboards/players/:playerId/update-stats
 * @desc Update player statistics (Internal API)
 * @access Internal
 */
router.post('/players/:playerId/update-stats',
    updateLimiter,
    LeaderboardValidation.validatePlayerId(),
    LeaderboardValidation.validateUpdatePlayerStats(),
    LeaderboardController.updatePlayerStats
);

/**
 * @route GET /api/leaderboards/position-changes/recent
 * @desc Get recent significant position changes
 * @access Public
 */
router.get('/position-changes/recent',
    LeaderboardValidation.validatePositionChangesQuery(),
    LeaderboardController.getRecentPositionChanges
);

/**
 * @route GET /api/leaderboards/personal-bests
 * @desc Get new personal bests
 * @access Public
 */
router.get('/personal-bests',
    LeaderboardValidation.validatePositionChangesQuery(),
    LeaderboardController.getNewPersonalBests
);

module.exports = router;