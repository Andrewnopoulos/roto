/**
 * Game Controller
 * Handles game-related API endpoints with rating and statistics integration
 */

const GameIntegrationService = require('../services/GameIntegrationService');
const RatingService = require('../services/RatingService');
const { validateRequest, authenticateUser } = require('../middleware/validation');

class GameController {
    constructor() {
        this.gameIntegrationService = new GameIntegrationService();
        this.ratingService = new RatingService();
    }

    /**
     * Complete a game and process all updates
     * POST /api/games/:gameId/complete
     */
    async completeGame(req, res) {
        try {
            const { gameId } = req.params;
            const gameResult = req.body;

            // Validate game ID
            if (!gameId || isNaN(parseInt(gameId))) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid game ID'
                });
            }

            // Validate required fields
            const requiredFields = [
                'player1Id', 'player2Id', 'gameDurationSeconds'
            ];

            for (const field of requiredFields) {
                if (gameResult[field] === undefined || gameResult[field] === null) {
                    return res.status(400).json({
                        success: false,
                        error: `Missing required field: ${field}`
                    });
                }
            }

            // Validate winner (can be null for draw)
            if (gameResult.winnerId !== null && 
                gameResult.winnerId !== gameResult.player1Id && 
                gameResult.winnerId !== gameResult.player2Id) {
                return res.status(400).json({
                    success: false,
                    error: 'Winner must be one of the players or null for draw'
                });
            }

            // Validate game duration
            if (gameResult.gameDurationSeconds < 1 || gameResult.gameDurationSeconds > 86400) {
                return res.status(400).json({
                    success: false,
                    error: 'Game duration must be between 1 second and 24 hours'
                });
            }

            // Add game ID to result data
            const completeGameData = {
                ...gameResult,
                gameId: parseInt(gameId)
            };

            // Process game completion
            const processingResult = await this.gameIntegrationService.processGameCompletion(
                completeGameData
            );

            res.json({
                success: true,
                data: processingResult,
                message: 'Game completed successfully'
            });

        } catch (error) {
            console.error('Error completing game:', error);
            
            if (error.message.includes('not found') || 
                error.message.includes('Invalid') ||
                error.message.includes('must be')) {
                return res.status(400).json({
                    success: false,
                    error: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get match prediction between two players
     * GET /api/games/prediction?player1=123&player2=456
     */
    async getMatchPrediction(req, res) {
        try {
            const { player1, player2 } = req.query;

            // Validate player IDs
            if (!player1 || !player2 || isNaN(parseInt(player1)) || isNaN(parseInt(player2))) {
                return res.status(400).json({
                    success: false,
                    error: 'Both player1 and player2 must be valid user IDs'
                });
            }

            const player1Id = parseInt(player1);
            const player2Id = parseInt(player2);

            if (player1Id === player2Id) {
                return res.status(400).json({
                    success: false,
                    error: 'Players cannot be the same'
                });
            }

            const prediction = await this.gameIntegrationService.getMatchPrediction(
                player1Id, 
                player2Id
            );

            res.json({
                success: true,
                data: prediction
            });

        } catch (error) {
            console.error('Error getting match prediction:', error);
            
            if (error.message.includes('not found')) {
                return res.status(404).json({
                    success: false,
                    error: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get rating calculations for hypothetical match results
     * POST /api/games/rating-preview
     */
    async getRatingPreview(req, res) {
        try {
            const { player1Id, player2Id, result } = req.body;

            // Validate inputs
            if (!player1Id || !player2Id || !result) {
                return res.status(400).json({
                    success: false,
                    error: 'player1Id, player2Id, and result are required'
                });
            }

            if (!['player1_wins', 'player2_wins', 'draw'].includes(result)) {
                return res.status(400).json({
                    success: false,
                    error: 'Result must be "player1_wins", "player2_wins", or "draw"'
                });
            }

            // Get match prediction which includes rating calculations
            const prediction = await this.gameIntegrationService.getMatchPrediction(
                parseInt(player1Id), 
                parseInt(player2Id)
            );

            // Extract rating changes based on result
            let ratingChanges;
            switch (result) {
                case 'player1_wins':
                    ratingChanges = {
                        player1Change: prediction.prediction.expectedRatingChanges.player1Win,
                        player2Change: prediction.prediction.expectedRatingChanges.player2Loss
                    };
                    break;
                case 'player2_wins':
                    ratingChanges = {
                        player1Change: prediction.prediction.expectedRatingChanges.player1Loss,
                        player2Change: prediction.prediction.expectedRatingChanges.player2Win
                    };
                    break;
                case 'draw':
                    // For draws, estimate changes as smaller values
                    const drawFactor = 0.3; // Draws typically result in smaller rating changes
                    ratingChanges = {
                        player1Change: Math.round(prediction.prediction.expectedRatingChanges.player1Win * drawFactor),
                        player2Change: Math.round(prediction.prediction.expectedRatingChanges.player2Win * drawFactor)
                    };
                    break;
            }

            res.json({
                success: true,
                data: {
                    currentRatings: {
                        player1: prediction.players.player1.rating,
                        player2: prediction.players.player2.rating
                    },
                    ratingChanges,
                    newRatings: {
                        player1: prediction.players.player1.rating + ratingChanges.player1Change,
                        player2: prediction.players.player2.rating + ratingChanges.player2Change
                    },
                    result,
                    winProbabilities: {
                        player1: prediction.prediction.player1WinProbability,
                        player2: prediction.prediction.player2WinProbability,
                        draw: prediction.prediction.drawProbability
                    }
                }
            });

        } catch (error) {
            console.error('Error getting rating preview:', error);
            
            if (error.message.includes('not found')) {
                return res.status(404).json({
                    success: false,
                    error: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Apply rating decay for inactive players (admin only)
     * POST /api/games/apply-rating-decay
     */
    async applyRatingDecay(req, res) {
        try {
            // Check admin authorization
            if (!req.user || !req.user.isAdmin) {
                return res.status(403).json({
                    success: false,
                    error: 'Admin access required'
                });
            }

            const { daysSinceLastGame = 90 } = req.body;

            // Validate days parameter
            if (daysSinceLastGame < 30 || daysSinceLastGame > 365) {
                return res.status(400).json({
                    success: false,
                    error: 'Days since last game must be between 30 and 365'
                });
            }

            const decayResult = await this.gameIntegrationService.applyRatingDecay(
                daysSinceLastGame
            );

            res.json({
                success: true,
                data: decayResult,
                message: `Rating decay applied to ${decayResult.ratingsDecayed} players`
            });

        } catch (error) {
            console.error('Error applying rating decay:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get recent games with statistics
     * GET /api/games/recent?limit=20
     */
    async getRecentGames(req, res) {
        try {
            const { limit = 20 } = req.query;
            const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));

            // This would typically come from a game service
            // For now, return a placeholder response
            res.json({
                success: true,
                data: {
                    games: [],
                    count: 0,
                    message: 'Recent games endpoint - integrate with existing game service'
                }
            });

        } catch (error) {
            console.error('Error fetching recent games:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get game statistics by ID
     * GET /api/games/:gameId/statistics
     */
    async getGameStatistics(req, res) {
        try {
            const { gameId } = req.params;

            if (!gameId || isNaN(parseInt(gameId))) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid game ID'
                });
            }

            // This would fetch from game_statistics table
            // For now, return a placeholder response
            res.json({
                success: true,
                data: {
                    gameId: parseInt(gameId),
                    message: 'Game statistics endpoint - implement database query'
                }
            });

        } catch (error) {
            console.error('Error fetching game statistics:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get rating distribution statistics
     * GET /api/games/rating-distribution
     */
    async getRatingDistribution(req, res) {
        try {
            // This would calculate rating distribution from the database
            const ratingCategories = [
                { category: 'Novice', range: '< 1200', count: 0 },
                { category: 'Beginner', range: '1200-1399', count: 0 },
                { category: 'Intermediate', range: '1400-1599', count: 0 },
                { category: 'Advanced', range: '1600-1799', count: 0 },
                { category: 'Expert', range: '1800-1999', count: 0 },
                { category: 'Master', range: '2000-2199', count: 0 },
                { category: 'Grandmaster', range: '≥ 2200', count: 0 }
            ];

            res.json({
                success: true,
                data: {
                    distribution: ratingCategories,
                    totalPlayers: 0,
                    averageRating: 1200,
                    message: 'Rating distribution endpoint - implement database aggregation'
                }
            });

        } catch (error) {
            console.error('Error fetching rating distribution:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Validate game data structure
     * @param {Object} gameData - Game data to validate
     * @returns {Object} Validation result
     */
    validateGameData(gameData) {
        const errors = [];

        // Check required fields
        const requiredFields = ['player1Id', 'player2Id', 'gameDurationSeconds'];
        for (const field of requiredFields) {
            if (gameData[field] === undefined || gameData[field] === null) {
                errors.push(`Missing required field: ${field}`);
            }
        }

        // Validate player IDs
        if (gameData.player1Id === gameData.player2Id) {
            errors.push('Players cannot be the same');
        }

        // Validate duration
        if (gameData.gameDurationSeconds && 
            (gameData.gameDurationSeconds < 1 || gameData.gameDurationSeconds > 86400)) {
            errors.push('Game duration must be between 1 second and 24 hours');
        }

        // Validate move history if provided
        if (gameData.moveHistory && Array.isArray(gameData.moveHistory)) {
            for (let i = 0; i < gameData.moveHistory.length; i++) {
                const move = gameData.moveHistory[i];
                if (!move.playerId || 
                    (move.playerId !== gameData.player1Id && move.playerId !== gameData.player2Id)) {
                    errors.push(`Move ${i} has invalid playerId`);
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

module.exports = GameController;