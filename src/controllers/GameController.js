const GameIntegrationService = require('../services/GameIntegrationService');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

class GameController {
    /**
     * Process a single game result
     * POST /api/games/result
     */
    async processGameResult(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const gameData = req.body;
            const result = await GameIntegrationService.processGameResult(gameData);

            res.status(201).json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('Error in processGameResult:', error);
            
            if (error.message.includes('already been processed')) {
                return res.status(409).json({
                    success: false,
                    message: error.message
                });
            }
            
            if (error.message.includes('not found') || error.message.includes('invalid')) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Process multiple game results in batch
     * POST /api/games/batch-results
     */
    async processBatchGameResults(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { gameResults } = req.body;

            if (!Array.isArray(gameResults) || gameResults.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'gameResults must be a non-empty array'
                });
            }

            if (gameResults.length > 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Maximum 100 game results can be processed in a single batch'
                });
            }

            const result = await GameIntegrationService.processBulkGameResults(gameResults);

            res.status(200).json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('Error in processBatchGameResults:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get player's current rating
     * GET /api/games/players/:playerId/rating
     */
    async getPlayerRating(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { playerId } = req.params;
            const { category = 'global_rating' } = req.query;

            const rating = await GameIntegrationService.getPlayerRating(
                parseInt(playerId),
                category
            );

            res.json({
                success: true,
                data: {
                    playerId: parseInt(playerId),
                    category,
                    rating
                }
            });

        } catch (error) {
            logger.error('Error in getPlayerRating:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Calculate win probability between two players
     * GET /api/games/win-probability
     */
    async calculateWinProbability(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { player1Id, player2Id, category = 'global_rating' } = req.query;

            const player1Rating = await GameIntegrationService.getPlayerRating(
                parseInt(player1Id),
                category
            );

            const player2Rating = await GameIntegrationService.getPlayerRating(
                parseInt(player2Id),
                category
            );

            const player1WinProbability = GameIntegrationService.calculateWinProbability(
                player1Rating,
                player2Rating
            );

            const player2WinProbability = 1 - player1WinProbability;

            res.json({
                success: true,
                data: {
                    player1Id: parseInt(player1Id),
                    player2Id: parseInt(player2Id),
                    category,
                    player1Rating,
                    player2Rating,
                    winProbabilities: {
                        player1: Math.round(player1WinProbability * 100 * 100) / 100, // 2 decimal places
                        player2: Math.round(player2WinProbability * 100 * 100) / 100
                    }
                }
            });

        } catch (error) {
            logger.error('Error in calculateWinProbability:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Simulate rating changes for a hypothetical match
     * POST /api/games/simulate-rating-changes
     */
    async simulateRatingChanges(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { player1Id, player2Id, winnerId, category = 'global_rating' } = req.body;

            const player1Rating = await GameIntegrationService.getPlayerRating(
                parseInt(player1Id),
                category
            );

            const player2Rating = await GameIntegrationService.getPlayerRating(
                parseInt(player2Id),
                category
            );

            const ratingChanges = GameIntegrationService.simulateRatingChanges(
                player1Rating,
                player2Rating,
                winnerId ? parseInt(winnerId) : null,
                parseInt(player1Id),
                parseInt(player2Id)
            );

            res.json({
                success: true,
                data: {
                    category,
                    currentRatings: {
                        player1: player1Rating,
                        player2: player2Rating
                    },
                    simulatedChanges: ratingChanges
                }
            });

        } catch (error) {
            logger.error('Error in simulateRatingChanges:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get head-to-head statistics between two players
     * GET /api/games/head-to-head
     */
    async getHeadToHeadStats(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { player1Id, player2Id, limit = 10 } = req.query;

            const limitNum = Math.max(1, Math.min(50, parseInt(limit)));

            const stats = await GameIntegrationService.getHeadToHeadStats(
                parseInt(player1Id),
                parseInt(player2Id),
                limitNum
            );

            res.json({
                success: true,
                data: stats
            });

        } catch (error) {
            logger.error('Error in getHeadToHeadStats:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get recent game results
     * GET /api/games/recent
     */
    async getRecentGameResults(req, res) {
        try {
            const { 
                limit = 50, 
                playerId = null,
                gameType = null,
                hours = 24 
            } = req.query;

            const limitNum = Math.max(1, Math.min(200, parseInt(limit)));
            const hoursNum = Math.max(1, Math.min(168, parseInt(hours))); // Max 1 week

            const pool = require('../config/database');
            
            let whereConditions = [`gr.created_at >= CURRENT_TIMESTAMP - INTERVAL '${hoursNum} hours'`];
            let queryParams = [];
            let paramIndex = 1;

            if (playerId) {
                whereConditions.push(`(gr.player1_id = $${paramIndex} OR gr.player2_id = $${paramIndex})`);
                queryParams.push(parseInt(playerId));
                paramIndex++;
            }

            if (gameType) {
                whereConditions.push(`gr.game_type = $${paramIndex}`);
                queryParams.push(gameType);
                paramIndex++;
            }

            queryParams.push(limitNum);

            const query = `
                SELECT 
                    gr.game_id,
                    gr.player1_id,
                    gr.player2_id,
                    gr.winner_id,
                    gr.game_type,
                    gr.result_type,
                    gr.duration_seconds,
                    gr.created_at,
                    p1.username as player1_username,
                    p1.display_name as player1_display_name,
                    p2.username as player2_username,
                    p2.display_name as player2_display_name,
                    pw.username as winner_username,
                    pw.display_name as winner_display_name
                FROM game_results gr
                JOIN players p1 ON gr.player1_id = p1.id
                JOIN players p2 ON gr.player2_id = p2.id
                LEFT JOIN players pw ON gr.winner_id = pw.id
                WHERE ${whereConditions.join(' AND ')}
                ORDER BY gr.created_at DESC
                LIMIT $${paramIndex}
            `;

            const result = await pool.query(query, queryParams);

            res.json({
                success: true,
                data: {
                    games: result.rows,
                    totalGames: result.rows.length,
                    filters: { playerId, gameType, hours: hoursNum }
                }
            });

        } catch (error) {
            logger.error('Error in getRecentGameResults:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get game statistics
     * GET /api/games/statistics
     */
    async getGameStatistics(req, res) {
        try {
            const { 
                period = 'daily', // 'daily', 'weekly', 'monthly'
                days = 30 
            } = req.query;

            const daysNum = Math.max(1, Math.min(365, parseInt(days)));
            const pool = require('../config/database');

            let groupByClause;
            switch (period) {
                case 'weekly':
                    groupByClause = "DATE_TRUNC('week', created_at)";
                    break;
                case 'monthly':
                    groupByClause = "DATE_TRUNC('month', created_at)";
                    break;
                default:
                    groupByClause = "DATE_TRUNC('day', created_at)";
            }

            const query = `
                SELECT 
                    ${groupByClause} as period,
                    COUNT(*) as total_games,
                    COUNT(CASE WHEN result_type = 'win' THEN 1 END) as completed_games,
                    COUNT(CASE WHEN result_type = 'draw' THEN 1 END) as draws,
                    COUNT(CASE WHEN result_type = 'forfeit' THEN 1 END) as forfeits,
                    AVG(duration_seconds) as avg_duration,
                    COUNT(DISTINCT player1_id) + COUNT(DISTINCT player2_id) as unique_players
                FROM game_results
                WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '${daysNum} days'
                GROUP BY ${groupByClause}
                ORDER BY period DESC
            `;

            const result = await pool.query(query);

            res.json({
                success: true,
                data: {
                    statistics: result.rows,
                    period,
                    days: daysNum
                }
            });

        } catch (error) {
            logger.error('Error in getGameStatistics:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
}

module.exports = new GameController();