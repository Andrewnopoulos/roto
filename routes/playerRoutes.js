/**
 * Player Routes
 * Defines all API routes for player-related functionality
 */

const express = require('express');
const router = express.Router();
const PlayerController = require('../controllers/PlayerController');
const { authenticateUser, validateRequest } = require('../middleware/validation');
const { rateLimiter } = require('../middleware/rateLimiting');

const playerController = new PlayerController();

// Apply rate limiting to all player routes
router.use(rateLimiter);

/**
 * Public Routes (no authentication required)
 */

// Get public player profile
router.get('/:userId/profile', 
    validateRequest(['params:userId']),
    playerController.getProfile.bind(playerController)
);

// Search players
router.get('/search',
    validateRequest(['query:q']),
    playerController.searchPlayers.bind(playerController)
);

// Get leaderboard
router.get('/leaderboard',
    playerController.getLeaderboard.bind(playerController)
);

// Get achievement leaderboard
router.get('/achievements/leaderboard',
    playerController.getAchievementLeaderboard.bind(playerController)
);

/**
 * Protected Routes (authentication required)
 */

// Get own profile (with private data)
router.get('/me/profile',
    authenticateUser,
    (req, res) => {
        req.params.userId = req.user.id;
        playerController.getProfile(req, res);
    }
);

// Update own profile
router.put('/profile',
    authenticateUser,
    validateRequest(['body:username', 'body:email'], { optional: true }),
    playerController.updateProfile.bind(playerController)
);

// Get own preferences
router.get('/preferences',
    authenticateUser,
    playerController.getPreferences.bind(playerController)
);

// Update preferences
router.put('/preferences',
    authenticateUser,
    playerController.updatePreferences.bind(playerController)
);

// Get own statistics
router.get('/me/statistics',
    authenticateUser,
    (req, res) => {
        req.params.userId = req.user.id;
        playerController.getStatistics(req, res);
    }
);

// Get player statistics (with privacy checks)
router.get('/:userId/statistics',
    validateRequest(['params:userId']),
    playerController.getStatistics.bind(playerController)
);

// Get own achievements
router.get('/me/achievements',
    authenticateUser,
    (req, res) => {
        req.params.userId = req.user.id;
        playerController.getAchievements(req, res);
    }
);

// Get player achievements (with privacy checks)
router.get('/:userId/achievements',
    validateRequest(['params:userId']),
    playerController.getAchievements.bind(playerController)
);

// Get own game history
router.get('/me/games',
    authenticateUser,
    (req, res) => {
        req.params.userId = req.user.id;
        playerController.getGameHistory(req, res);
    }
);

// Get player game history (with privacy checks)
router.get('/:userId/games',
    validateRequest(['params:userId']),
    playerController.getGameHistory.bind(playerController)
);

/**
 * Error handling middleware for player routes
 */
router.use((error, req, res, next) => {
    console.error('Player route error:', error);
    
    if (error.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: error.details
        });
    }
    
    if (error.name === 'UnauthorizedError') {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }
    
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

module.exports = router;