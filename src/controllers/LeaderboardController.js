const LeaderboardService = require('../services/LeaderboardService');
const SeasonService = require('../services/SeasonService');
const PositionTrackingService = require('../services/PositionTrackingService');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

class LeaderboardController {
    /**
     * Get leaderboard data
     * GET /api/leaderboards/:category
     */
    async getLeaderboard(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { category } = req.params;
            const {
                page = 1,
                limit = 50,
                sortBy = 'rating',
                sortOrder = 'DESC',
                seasonId = null
            } = req.query;

            // Validate pagination parameters
            const pageNum = Math.max(1, parseInt(page));
            const limitNum = Math.max(1, Math.min(100, parseInt(limit))); // Max 100 per page

            const leaderboardData = await LeaderboardService.getLeaderboard(
                category,
                seasonId,
                {
                    page: pageNum,
                    limit: limitNum,
                    sortBy,
                    sortOrder
                }
            );

            res.json({
                success: true,
                data: leaderboardData
            });

        } catch (error) {
            logger.error('Error in getLeaderboard:', error);
            
            if (error.message.includes('not found')) {
                return res.status(404).json({
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
     * Get player's rank in a specific leaderboard
     * GET /api/leaderboards/:category/players/:playerId/rank
     */
    async getPlayerRank(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { category, playerId } = req.params;
            const { seasonId = null } = req.query;

            const playerRank = await LeaderboardService.getPlayerRank(
                parseInt(playerId),
                category,
                seasonId
            );

            if (!playerRank) {
                return res.status(404).json({
                    success: false,
                    message: 'Player not found in this leaderboard'
                });
            }

            res.json({
                success: true,
                data: playerRank
            });

        } catch (error) {
            logger.error('Error in getPlayerRank:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get players around a specific rank
     * GET /api/leaderboards/:category/players/:playerId/surrounding
     */
    async getPlayersAroundRank(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { category, playerId } = req.params;
            const { seasonId = null, range = 5 } = req.query;

            const rangeNum = Math.max(1, Math.min(20, parseInt(range))); // Max range of 20

            const surroundingPlayers = await LeaderboardService.getPlayersAroundRank(
                parseInt(playerId),
                category,
                seasonId,
                rangeNum
            );

            if (!surroundingPlayers) {
                return res.status(404).json({
                    success: false,
                    message: 'Player not found in this leaderboard'
                });
            }

            res.json({
                success: true,
                data: surroundingPlayers
            });

        } catch (error) {
            logger.error('Error in getPlayersAroundRank:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get multiple leaderboard categories
     * GET /api/leaderboards
     */
    async getLeaderboardCategories(req, res) {
        try {
            const pool = require('../config/database');
            
            const result = await pool.query(`
                SELECT 
                    id,
                    name,
                    description,
                    reset_frequency,
                    is_active
                FROM leaderboard_categories
                WHERE is_active = true
                ORDER BY 
                    CASE reset_frequency 
                        WHEN 'none' THEN 1 
                        WHEN 'seasonal' THEN 2 
                        WHEN 'monthly' THEN 3 
                        WHEN 'weekly' THEN 4 
                        ELSE 5 
                    END,
                    name
            `);

            res.json({
                success: true,
                data: {
                    categories: result.rows
                }
            });

        } catch (error) {
            logger.error('Error in getLeaderboardCategories:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Recalculate rankings for a category (Admin only)
     * POST /api/leaderboards/:category/recalculate
     */
    async recalculateRankings(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            // TODO: Add admin authentication middleware
            const { category } = req.params;
            const { seasonId = null } = req.body;

            await LeaderboardService.recalculateRankings(category, seasonId);

            res.json({
                success: true,
                message: `Rankings recalculated for category: ${category}`
            });

        } catch (error) {
            logger.error('Error in recalculateRankings:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get position change history for a player
     * GET /api/leaderboards/players/:playerId/position-history
     */
    async getPlayerPositionHistory(req, res) {
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
            const {
                categoryName = null,
                seasonId = null,
                limit = 100,
                days = 30
            } = req.query;

            const history = await PositionTrackingService.getPlayerPositionHistory(
                parseInt(playerId),
                {
                    categoryName,
                    seasonId,
                    limit: Math.min(500, parseInt(limit)),
                    days: Math.min(365, parseInt(days))
                }
            );

            res.json({
                success: true,
                data: history
            });

        } catch (error) {
            logger.error('Error in getPlayerPositionHistory:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get recent significant position changes
     * GET /api/leaderboards/position-changes/recent
     */
    async getRecentPositionChanges(req, res) {
        try {
            const {
                limit = 50,
                categoryName = null,
                seasonId = null,
                minRankChange = 5,
                hours = 24
            } = req.query;

            const changes = await PositionTrackingService.getRecentSignificantChanges({
                limit: Math.min(200, parseInt(limit)),
                categoryName,
                seasonId,
                minRankChange: Math.max(1, parseInt(minRankChange)),
                hours: Math.min(168, parseInt(hours)) // Max 1 week
            });

            res.json({
                success: true,
                data: changes
            });

        } catch (error) {
            logger.error('Error in getRecentPositionChanges:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get new personal bests
     * GET /api/leaderboards/personal-bests
     */
    async getNewPersonalBests(req, res) {
        try {
            const {
                categoryName = null,
                seasonId = null,
                limit = 50,
                hours = 24
            } = req.query;

            const personalBests = await PositionTrackingService.getNewPersonalBests({
                categoryName,
                seasonId,
                limit: Math.min(200, parseInt(limit)),
                hours: Math.min(168, parseInt(hours))
            });

            res.json({
                success: true,
                data: personalBests
            });

        } catch (error) {
            logger.error('Error in getNewPersonalBests:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get rank change analytics
     * GET /api/leaderboards/:category/analytics
     */
    async getRankChangeAnalytics(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { category } = req.params;
            const {
                seasonId = null,
                days = 7
            } = req.query;

            const analytics = await PositionTrackingService.getRankChangeAnalytics(
                category,
                seasonId,
                Math.min(90, parseInt(days))
            );

            res.json({
                success: true,
                data: analytics
            });

        } catch (error) {
            logger.error('Error in getRankChangeAnalytics:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Update player statistics (Internal API)
     * POST /api/leaderboards/players/:playerId/update-stats
     */
    async updatePlayerStats(req, res) {
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
            const { gameResult, categories = ['global_rating', 'global_wins'] } = req.body;

            await LeaderboardService.updatePlayerStats(
                parseInt(playerId),
                gameResult,
                categories
            );

            res.json({
                success: true,
                message: 'Player statistics updated successfully'
            });

        } catch (error) {
            logger.error('Error in updatePlayerStats:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
}

module.exports = new LeaderboardController();