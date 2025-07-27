const pool = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const LeaderboardService = require('./LeaderboardService');

class SeasonService {
    constructor() {
        this.cacheExpiry = 3600; // 1 hour cache for season data
    }

    /**
     * Create a new competitive season
     */
    async createSeason(seasonData) {
        const { name, startDate, endDate } = seasonData;
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Validate dates
            if (new Date(startDate) >= new Date(endDate)) {
                throw new Error('Season start date must be before end date');
            }

            // Check for overlapping seasons
            const overlapCheck = await client.query(`
                SELECT id FROM seasons 
                WHERE (start_date <= $1 AND end_date >= $1) 
                   OR (start_date <= $2 AND end_date >= $2)
                   OR (start_date >= $1 AND end_date <= $2)
            `, [startDate, endDate]);

            if (overlapCheck.rows.length > 0) {
                throw new Error('Season dates overlap with existing season');
            }

            // Create the season
            const seasonResult = await client.query(`
                INSERT INTO seasons (name, start_date, end_date, is_active)
                VALUES ($1, $2, $3, false)
                RETURNING *
            `, [name, startDate, endDate]);

            const season = seasonResult.rows[0];

            await client.query('COMMIT');

            // Clear season cache
            await this._invalidateSeasonCache();

            logger.info(`Created new season: ${name} (${season.id})`);
            return season;

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error creating season:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Start a season (make it active)
     */
    async startSeason(seasonId) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Deactivate any currently active seasons
            await client.query('UPDATE seasons SET is_active = false WHERE is_active = true');

            // Activate the new season
            const result = await client.query(`
                UPDATE seasons 
                SET is_active = true, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND start_date <= CURRENT_TIMESTAMP
                RETURNING *
            `, [seasonId]);

            if (result.rows.length === 0) {
                throw new Error('Season not found or not ready to start');
            }

            const season = result.rows[0];

            // Initialize leaderboard entries for seasonal categories
            await this._initializeSeasonalLeaderboards(client, seasonId);

            await client.query('COMMIT');

            // Clear relevant caches
            await this._invalidateSeasonCache();
            await this._invalidateLeaderboardCaches();

            logger.info(`Started season: ${season.name} (${seasonId})`);
            return season;

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error starting season:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * End the current season and process results
     */
    async endSeason(seasonId, options = {}) {
        const { createSnapshot = true, resetWeeklyMonthly = true } = options;
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Get season details
            const seasonResult = await client.query(
                'SELECT * FROM seasons WHERE id = $1',
                [seasonId]
            );

            if (seasonResult.rows.length === 0) {
                throw new Error('Season not found');
            }

            const season = seasonResult.rows[0];

            // Create final leaderboard snapshots
            if (createSnapshot) {
                await this._createSeasonEndSnapshots(client, seasonId);
            }

            // Mark season as inactive
            await client.query(`
                UPDATE seasons 
                SET is_active = false, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [seasonId]);

            // Reset weekly/monthly leaderboards if requested
            if (resetWeeklyMonthly) {
                await this._resetPeriodicLeaderboards(client);
            }

            await client.query('COMMIT');

            // Clear all caches
            await this._invalidateSeasonCache();
            await this._invalidateLeaderboardCaches();

            logger.info(`Ended season: ${season.name} (${seasonId})`);
            return season;

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error ending season:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get current active season
     */
    async getCurrentSeason() {
        const cacheKey = 'current_season';

        try {
            // Check cache first
            const cached = await redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }

            const result = await pool.query(`
                SELECT * FROM seasons 
                WHERE is_active = true 
                ORDER BY start_date DESC 
                LIMIT 1
            `);

            const season = result.rows.length > 0 ? result.rows[0] : null;

            // Cache the result
            if (season) {
                await redis.setEx(cacheKey, this.cacheExpiry, JSON.stringify(season));
            }

            return season;

        } catch (error) {
            logger.error('Error getting current season:', error);
            throw error;
        }
    }

    /**
     * Get all seasons with pagination
     */
    async getSeasons(options = {}) {
        const { page = 1, limit = 20, includeInactive = true } = options;
        const offset = (page - 1) * limit;

        try {
            const whereClause = includeInactive ? '' : 'WHERE is_active = true';
            
            const query = `
                SELECT * FROM seasons 
                ${whereClause}
                ORDER BY start_date DESC 
                LIMIT $1 OFFSET $2
            `;

            const countQuery = `
                SELECT COUNT(*) as total FROM seasons 
                ${whereClause}
            `;

            const [dataResult, countResult] = await Promise.all([
                pool.query(query, [limit, offset]),
                pool.query(countQuery)
            ]);

            return {
                seasons: dataResult.rows,
                pagination: {
                    page,
                    limit,
                    total: parseInt(countResult.rows[0].total),
                    totalPages: Math.ceil(countResult.rows[0].total / limit)
                }
            };

        } catch (error) {
            logger.error('Error getting seasons:', error);
            throw error;
        }
    }

    /**
     * Get season leaderboard winners
     */
    async getSeasonWinners(seasonId, categoryName = 'seasonal_rating', topCount = 10) {
        try {
            const categoryResult = await pool.query(
                'SELECT id FROM leaderboard_categories WHERE name = $1',
                [categoryName]
            );

            if (categoryResult.rows.length === 0) {
                throw new Error(`Category '${categoryName}' not found`);
            }

            const categoryId = categoryResult.rows[0].id;

            const query = `
                SELECT 
                    le.current_rank,
                    le.rating,
                    le.wins,
                    le.losses,
                    le.total_games,
                    le.win_percentage,
                    p.id as player_id,
                    p.username,
                    p.display_name,
                    p.avatar_url
                FROM leaderboard_entries le
                JOIN players p ON le.player_id = p.id
                WHERE le.category_id = $1 AND le.season_id = $2
                ORDER BY le.current_rank ASC
                LIMIT $3
            `;

            const result = await pool.query(query, [categoryId, seasonId, topCount]);

            return {
                seasonId,
                categoryName,
                winners: result.rows,
                totalWinners: result.rows.length
            };

        } catch (error) {
            logger.error('Error getting season winners:', error);
            throw error;
        }
    }

    /**
     * Schedule automatic season transitions
     */
    async scheduleSeasonTransitions() {
        try {
            // End expired seasons
            const expiredSeasonsResult = await pool.query(`
                SELECT id, name FROM seasons 
                WHERE is_active = true AND end_date < CURRENT_TIMESTAMP
            `);

            for (const season of expiredSeasonsResult.rows) {
                await this.endSeason(season.id);
                logger.info(`Auto-ended expired season: ${season.name}`);
            }

            // Start pending seasons
            const pendingSeasonsResult = await pool.query(`
                SELECT id, name FROM seasons 
                WHERE is_active = false 
                AND start_date <= CURRENT_TIMESTAMP 
                AND end_date > CURRENT_TIMESTAMP
                ORDER BY start_date ASC
                LIMIT 1
            `);

            if (pendingSeasonsResult.rows.length > 0) {
                const season = pendingSeasonsResult.rows[0];
                await this.startSeason(season.id);
                logger.info(`Auto-started pending season: ${season.name}`);
            }

        } catch (error) {
            logger.error('Error in scheduled season transitions:', error);
        }
    }

    /**
     * Private helper methods
     */
    async _initializeSeasonalLeaderboards(client, seasonId) {
        // Get all seasonal categories
        const categoriesResult = await client.query(`
            SELECT id FROM leaderboard_categories 
            WHERE reset_frequency = 'seasonal' AND is_active = true
        `);

        // Get all active players
        const playersResult = await client.query(
            'SELECT id FROM players WHERE is_active = true'
        );

        // Create initial entries for all players in seasonal categories
        for (const category of categoriesResult.rows) {
            for (const player of playersResult.rows) {
                await client.query(`
                    INSERT INTO leaderboard_entries (player_id, category_id, season_id, rating)
                    VALUES ($1, $2, $3, 1000)
                    ON CONFLICT (player_id, category_id, season_id) DO NOTHING
                `, [player.id, category.id, seasonId]);
            }
        }
    }

    async _createSeasonEndSnapshots(client, seasonId) {
        const categoriesResult = await client.query(`
            SELECT id, name FROM leaderboard_categories 
            WHERE reset_frequency = 'seasonal' AND is_active = true
        `);

        for (const category of categoriesResult.rows) {
            const leaderboardData = await LeaderboardService.getLeaderboard(
                category.name, 
                seasonId,
                { limit: 1000 }
            );

            await client.query(`
                INSERT INTO leaderboard_snapshots (category_id, season_id, snapshot_date, snapshot_data, total_players)
                VALUES ($1, $2, CURRENT_DATE, $3, $4)
            `, [
                category.id,
                seasonId,
                JSON.stringify(leaderboardData),
                leaderboardData.players.length
            ]);
        }
    }

    async _resetPeriodicLeaderboards(client) {
        // Reset weekly and monthly leaderboards
        await client.query(`
            DELETE FROM leaderboard_entries 
            WHERE category_id IN (
                SELECT id FROM leaderboard_categories 
                WHERE reset_frequency IN ('weekly', 'monthly')
            )
        `);

        await client.query(`
            DELETE FROM position_changes 
            WHERE category_id IN (
                SELECT id FROM leaderboard_categories 
                WHERE reset_frequency IN ('weekly', 'monthly')
            )
        `);
    }

    async _invalidateSeasonCache() {
        try {
            const keys = await redis.keys('current_season*');
            if (keys.length > 0) {
                await redis.del(keys);
            }
        } catch (error) {
            logger.warn('Error invalidating season cache:', error);
        }
    }

    async _invalidateLeaderboardCaches() {
        try {
            const keys = await redis.keys('leaderboard:*');
            if (keys.length > 0) {
                await redis.del(keys);
            }
        } catch (error) {
            logger.warn('Error invalidating leaderboard caches:', error);
        }
    }
}

module.exports = new SeasonService();