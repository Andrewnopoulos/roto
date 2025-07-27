const SeasonService = require('../services/SeasonService');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

class SeasonController {
    /**
     * Create a new season (Admin only)
     * POST /api/seasons
     */
    async createSeason(req, res) {
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
            const { name, startDate, endDate } = req.body;

            const season = await SeasonService.createSeason({
                name,
                startDate,
                endDate
            });

            res.status(201).json({
                success: true,
                message: 'Season created successfully',
                data: season
            });

        } catch (error) {
            logger.error('Error in createSeason:', error);
            
            if (error.message.includes('overlap') || error.message.includes('before')) {
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
     * Start a season (Admin only)
     * POST /api/seasons/:seasonId/start
     */
    async startSeason(req, res) {
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
            const { seasonId } = req.params;

            const season = await SeasonService.startSeason(parseInt(seasonId));

            res.json({
                success: true,
                message: 'Season started successfully',
                data: season
            });

        } catch (error) {
            logger.error('Error in startSeason:', error);
            
            if (error.message.includes('not found') || error.message.includes('not ready')) {
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
     * End a season (Admin only)
     * POST /api/seasons/:seasonId/end
     */
    async endSeason(req, res) {
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
            const { seasonId } = req.params;
            const { 
                createSnapshot = true, 
                resetWeeklyMonthly = true 
            } = req.body;

            const season = await SeasonService.endSeason(parseInt(seasonId), {
                createSnapshot,
                resetWeeklyMonthly
            });

            res.json({
                success: true,
                message: 'Season ended successfully',
                data: season
            });

        } catch (error) {
            logger.error('Error in endSeason:', error);
            
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
     * Get current active season
     * GET /api/seasons/current
     */
    async getCurrentSeason(req, res) {
        try {
            const season = await SeasonService.getCurrentSeason();

            if (!season) {
                return res.status(404).json({
                    success: false,
                    message: 'No active season found'
                });
            }

            res.json({
                success: true,
                data: season
            });

        } catch (error) {
            logger.error('Error in getCurrentSeason:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get all seasons with pagination
     * GET /api/seasons
     */
    async getSeasons(req, res) {
        try {
            const {
                page = 1,
                limit = 20,
                includeInactive = true
            } = req.query;

            const pageNum = Math.max(1, parseInt(page));
            const limitNum = Math.max(1, Math.min(100, parseInt(limit)));
            const includeInactiveBool = includeInactive === 'true';

            const result = await SeasonService.getSeasons({
                page: pageNum,
                limit: limitNum,
                includeInactive: includeInactiveBool
            });

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('Error in getSeasons:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get season details by ID
     * GET /api/seasons/:seasonId
     */
    async getSeasonById(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { seasonId } = req.params;
            const pool = require('../config/database');

            const result = await pool.query(
                'SELECT * FROM seasons WHERE id = $1',
                [parseInt(seasonId)]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Season not found'
                });
            }

            res.json({
                success: true,
                data: result.rows[0]
            });

        } catch (error) {
            logger.error('Error in getSeasonById:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get season winners
     * GET /api/seasons/:seasonId/winners
     */
    async getSeasonWinners(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { seasonId } = req.params;
            const {
                categoryName = 'seasonal_rating',
                topCount = 10
            } = req.query;

            const topCountNum = Math.max(1, Math.min(100, parseInt(topCount)));

            const winners = await SeasonService.getSeasonWinners(
                parseInt(seasonId),
                categoryName,
                topCountNum
            );

            res.json({
                success: true,
                data: winners
            });

        } catch (error) {
            logger.error('Error in getSeasonWinners:', error);
            
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
     * Update season details (Admin only)
     * PUT /api/seasons/:seasonId
     */
    async updateSeason(req, res) {
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
            const { seasonId } = req.params;
            const { name, startDate, endDate } = req.body;
            const pool = require('../config/database');

            // Validate dates if provided
            if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
                return res.status(400).json({
                    success: false,
                    message: 'Season start date must be before end date'
                });
            }

            // Build dynamic update query
            const updateFields = [];
            const updateValues = [];
            let paramIndex = 1;

            if (name) {
                updateFields.push(`name = $${paramIndex}`);
                updateValues.push(name);
                paramIndex++;
            }

            if (startDate) {
                updateFields.push(`start_date = $${paramIndex}`);
                updateValues.push(startDate);
                paramIndex++;
            }

            if (endDate) {
                updateFields.push(`end_date = $${paramIndex}`);
                updateValues.push(endDate);
                paramIndex++;
            }

            if (updateFields.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No fields to update'
                });
            }

            updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
            updateValues.push(parseInt(seasonId));

            const query = `
                UPDATE seasons 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING *
            `;

            const result = await pool.query(query, updateValues);

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Season not found'
                });
            }

            res.json({
                success: true,
                message: 'Season updated successfully',
                data: result.rows[0]
            });

        } catch (error) {
            logger.error('Error in updateSeason:', error);
            
            if (error.code === '23505') { // Unique constraint violation
                return res.status(400).json({
                    success: false,
                    message: 'Season name already exists'
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
     * Delete a season (Admin only)
     * DELETE /api/seasons/:seasonId
     */
    async deleteSeason(req, res) {
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
            const { seasonId } = req.params;
            const pool = require('../config/database');

            // Check if season is active
            const activeCheck = await pool.query(
                'SELECT is_active FROM seasons WHERE id = $1',
                [parseInt(seasonId)]
            );

            if (activeCheck.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Season not found'
                });
            }

            if (activeCheck.rows[0].is_active) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete an active season'
                });
            }

            // Delete the season (cascading deletes will handle related data)
            const result = await pool.query(
                'DELETE FROM seasons WHERE id = $1 RETURNING *',
                [parseInt(seasonId)]
            );

            res.json({
                success: true,
                message: 'Season deleted successfully',
                data: result.rows[0]
            });

        } catch (error) {
            logger.error('Error in deleteSeason:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Process scheduled season transitions (Internal API)
     * POST /api/seasons/process-transitions
     */
    async processSeasonTransitions(req, res) {
        try {
            // TODO: Add internal API authentication
            await SeasonService.scheduleSeasonTransitions();

            res.json({
                success: true,
                message: 'Season transitions processed successfully'
            });

        } catch (error) {
            logger.error('Error in processSeasonTransitions:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
}

module.exports = new SeasonController();