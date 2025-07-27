/**
 * Game Routes
 * Defines all API routes for game-related functionality with rating integration
 */

const express = require('express');
const router = express.Router();
const GameController = require('../controllers/GameController');
const { authenticateUser, validateRequest, requireAdmin } = require('../middleware/validation');
const { rateLimiter, strictRateLimiter } = require('../middleware/rateLimiting');

const gameController = new GameController();

// Apply rate limiting to all game routes
router.use(rateLimiter);

/**
 * Public Routes (no authentication required)
 */

// Get match prediction between two players
router.get('/prediction',
    validateRequest(['query:player1', 'query:player2']),
    gameController.getMatchPrediction.bind(gameController)
);

// Get rating distribution statistics
router.get('/rating-distribution',
    gameController.getRatingDistribution.bind(gameController)
);

// Get recent games (public data only)
router.get('/recent',
    gameController.getRecentGames.bind(gameController)
);

/**
 * Protected Routes (authentication required)
 */

// Complete a game and update ratings/statistics
router.post('/:gameId/complete',
    authenticateUser,
    strictRateLimiter, // Stricter rate limiting for game completion
    validateRequest([
        'params:gameId',
        'body:player1Id',
        'body:player2Id', 
        'body:gameDurationSeconds'
    ]),
    gameController.completeGame.bind(gameController)
);

// Get rating preview for hypothetical match results
router.post('/rating-preview',
    authenticateUser,
    validateRequest([
        'body:player1Id',
        'body:player2Id',
        'body:result'
    ]),
    gameController.getRatingPreview.bind(gameController)
);

// Get game statistics by ID
router.get('/:gameId/statistics',
    authenticateUser,
    validateRequest(['params:gameId']),
    gameController.getGameStatistics.bind(gameController)
);

/**
 * Admin Routes (admin authentication required)
 */

// Apply rating decay for inactive players
router.post('/apply-rating-decay',
    authenticateUser,
    requireAdmin,
    strictRateLimiter,
    gameController.applyRatingDecay.bind(gameController)
);

/**
 * Validation middleware for game completion
 */
const validateGameCompletion = (req, res, next) => {
    const { body } = req;
    
    // Additional validation for game completion
    if (body.winnerId !== null && 
        body.winnerId !== body.player1Id && 
        body.winnerId !== body.player2Id) {
        return res.status(400).json({
            success: false,
            error: 'Winner must be one of the players or null for draw'
        });
    }
    
    if (body.gameDurationSeconds < 1 || body.gameDurationSeconds > 86400) {
        return res.status(400).json({
            success: false,
            error: 'Game duration must be between 1 second and 24 hours'
        });
    }
    
    if (body.player1Id === body.player2Id) {
        return res.status(400).json({
            success: false,
            error: 'Players cannot be the same'
        });
    }
    
    // Validate move history if provided
    if (body.moveHistory && Array.isArray(body.moveHistory)) {
        for (let i = 0; i < body.moveHistory.length; i++) {
            const move = body.moveHistory[i];
            if (!move.playerId || 
                (move.playerId !== body.player1Id && move.playerId !== body.player2Id)) {
                return res.status(400).json({
                    success: false,
                    error: `Move ${i} has invalid playerId`
                });
            }
            
            // Validate move timestamp if provided
            if (move.timestamp && !Date.parse(move.timestamp)) {
                return res.status(400).json({
                    success: false,
                    error: `Move ${i} has invalid timestamp`
                });
            }
        }
    }
    
    next();
};

// Apply additional validation to game completion
router.post('/:gameId/complete', validateGameCompletion);

/**
 * Validation middleware for rating preview
 */
const validateRatingPreview = (req, res, next) => {
    const { result } = req.body;
    
    const validResults = ['player1_wins', 'player2_wins', 'draw'];
    if (!validResults.includes(result)) {
        return res.status(400).json({
            success: false,
            error: 'Result must be "player1_wins", "player2_wins", or "draw"'
        });
    }
    
    next();
};

// Apply validation to rating preview
router.post('/rating-preview', validateRatingPreview);

/**
 * Error handling middleware for game routes
 */
router.use((error, req, res, next) => {
    console.error('Game route error:', error);
    
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
    
    if (error.name === 'ForbiddenError') {
        return res.status(403).json({
            success: false,
            error: 'Access forbidden'
        });
    }
    
    // Database errors
    if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
            success: false,
            error: 'Duplicate entry - game may already be completed'
        });
    }
    
    if (error.code === 'ER_NO_REFERENCED_ROW') {
        return res.status(400).json({
            success: false,
            error: 'Referenced player or game not found'
        });
    }
    
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

module.exports = router;