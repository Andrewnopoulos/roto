const express = require('express');
const router = express.Router();
const GameController = require('../controllers/GameController');
const { GameValidation, LeaderboardValidation } = require('../middleware/validation');
const rateLimit = require('express-rate-limit');

// Rate limiting for game endpoints
const gameLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: {
        success: false,
        message: 'Too many requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const gameProcessingLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 50, // 50 game processing requests per minute
    message: {
        success: false,
        message: 'Too many game processing requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting to all game routes
router.use(gameLimiter);

/**
 * @route POST /api/games/result
 * @desc Process a single game result
 * @access Internal
 */
router.post('/result',
    gameProcessingLimiter,
    GameValidation.validateGameResult(),
    GameController.processGameResult
);

/**
 * @route POST /api/games/batch-results
 * @desc Process multiple game results in batch
 * @access Internal
 */
router.post('/batch-results',
    gameProcessingLimiter,
    GameValidation.validateBatchGameResults(),
    GameController.processBatchGameResults
);

/**
 * @route GET /api/games/players/:playerId/rating
 * @desc Get player's current rating
 * @access Public
 */
router.get('/players/:playerId/rating',
    LeaderboardValidation.validatePlayerId(),
    GameController.getPlayerRating
);

/**
 * @route GET /api/games/win-probability
 * @desc Calculate win probability between two players
 * @access Public
 */
router.get('/win-probability',
    GameValidation.validateWinProbability(),
    GameController.calculateWinProbability
);

/**
 * @route POST /api/games/simulate-rating-changes
 * @desc Simulate rating changes for a hypothetical match
 * @access Public
 */
router.post('/simulate-rating-changes',
    GameValidation.validateSimulateRatingChanges(),
    GameController.simulateRatingChanges
);

/**
 * @route GET /api/games/head-to-head
 * @desc Get head-to-head statistics between two players
 * @access Public
 */
router.get('/head-to-head',
    GameValidation.validateHeadToHead(),
    GameController.getHeadToHeadStats
);

/**
 * @route GET /api/games/recent
 * @desc Get recent game results
 * @access Public
 */
router.get('/recent',
    GameValidation.validateRecentGamesQuery(),
    GameController.getRecentGameResults
);

/**
 * @route GET /api/games/statistics
 * @desc Get game statistics
 * @access Public
 */
router.get('/statistics',
    GameValidation.validateStatisticsQuery(),
    GameController.getGameStatistics
);

module.exports = router;