const pool = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');

class LeaderboardService {
    constructor() {
        this.cacheExpiry = 300; // 5 minutes cache
        this.topPlayersLimit = 1000; // Cache top 1000 players
    }

    /**
     * Get leaderboard data with pagination and caching
     */
    async getLeaderboard(categoryName, seasonId = null, options = {}) {
        const {
            page = 1,
            limit = 50,
            sortBy = 'rating',
            sortOrder = 'DESC'
        } = options;

        const offset = (page - 1) * limit;
        const cacheKey = this._getCacheKey(categoryName, seasonId, sortBy, page, limit);

        try {
            // Try cache first
            const cachedData = await redis.get(cacheKey);
            if (cachedData) {
                logger.info(`Leaderboard cache hit for key: ${cacheKey}`);
                return JSON.parse(cachedData);
            }

            // Get category ID
            const categoryResult = await pool.query(
                'SELECT id FROM leaderboard_categories WHERE name = $1 AND is_active = true',
                [categoryName]
            );

            if (categoryResult.rows.length === 0) {
                throw new Error(`Leaderboard category '${categoryName}' not found`);
            }

            const categoryId = categoryResult.rows[0].id;

            // Build query based on sort criteria
            const orderByClause = this._buildOrderByClause(sortBy, sortOrder);
            
            const query = `
                SELECT 
                    le.current_rank,
                    le.previous_rank,
                    le.rank_change,
                    le.rating,
                    le.wins,
                    le.losses,
                    le.draws,
                    le.total_games,
                    le.win_percentage,
                    le.last_game_at,
                    p.id as player_id,
                    p.username,
                    p.display_name,
                    p.avatar_url
                FROM leaderboard_entries le
                JOIN players p ON le.player_id = p.id
                WHERE le.category_id = $1 
                    AND ($2::INTEGER IS NULL OR le.season_id = $2)
                    AND p.is_active = true
                ${orderByClause}
                LIMIT $3 OFFSET $4
            `;

            const countQuery = `
                SELECT COUNT(*) as total
                FROM leaderboard_entries le
                JOIN players p ON le.player_id = p.id
                WHERE le.category_id = $1 
                    AND ($2::INTEGER IS NULL OR le.season_id = $2)
                    AND p.is_active = true
            `;

            const [dataResult, countResult] = await Promise.all([
                pool.query(query, [categoryId, seasonId, limit, offset]),
                pool.query(countQuery, [categoryId, seasonId])
            ]);

            const leaderboardData = {
                players: dataResult.rows,
                pagination: {
                    page,
                    limit,
                    total: parseInt(countResult.rows[0].total),
                    totalPages: Math.ceil(countResult.rows[0].total / limit)
                },
                categoryName,
                seasonId,
                sortBy,
                lastUpdated: new Date()
            };

            // Cache the result
            await redis.setEx(cacheKey, this.cacheExpiry, JSON.stringify(leaderboardData));
            logger.info(`Leaderboard cached with key: ${cacheKey}`);

            return leaderboardData;

        } catch (error) {
            logger.error('Error getting leaderboard:', error);
            throw error;
        }
    }

    /**
     * Get player's position in a specific leaderboard
     */
    async getPlayerRank(playerId, categoryName, seasonId = null) {
        const cacheKey = `player_rank:${playerId}:${categoryName}:${seasonId || 'global'}`;

        try {
            // Try cache first
            const cachedRank = await redis.get(cacheKey);
            if (cachedRank) {
                return JSON.parse(cachedRank);
            }

            const categoryResult = await pool.query(
                'SELECT id FROM leaderboard_categories WHERE name = $1 AND is_active = true',
                [categoryName]
            );

            if (categoryResult.rows.length === 0) {
                throw new Error(`Leaderboard category '${categoryName}' not found`);
            }

            const categoryId = categoryResult.rows[0].id;

            const query = `
                SELECT 
                    le.current_rank,
                    le.previous_rank,
                    le.rank_change,
                    le.rating,
                    le.wins,
                    le.losses,
                    le.total_games,
                    le.win_percentage,
                    le.highest_rank,
                    p.username,
                    p.display_name
                FROM leaderboard_entries le
                JOIN players p ON le.player_id = p.id
                WHERE le.player_id = $1 
                    AND le.category_id = $2 
                    AND ($3::INTEGER IS NULL OR le.season_id = $3)
            `;

            const result = await pool.query(query, [playerId, categoryId, seasonId]);

            if (result.rows.length === 0) {
                return null;
            }

            const playerRank = result.rows[0];

            // Cache for shorter time since individual ranks change more frequently
            await redis.setEx(cacheKey, 60, JSON.stringify(playerRank));

            return playerRank;

        } catch (error) {
            logger.error('Error getting player rank:', error);
            throw error;
        }
    }

    /**
     * Update player statistics and recalculate rankings
     */
    async updatePlayerStats(playerId, gameResult, categoryNames = ['global_rating', 'global_wins']) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            for (const categoryName of categoryNames) {
                await this._updatePlayerStatsForCategory(client, playerId, gameResult, categoryName);
            }

            await client.query('COMMIT');

            // Invalidate relevant caches
            await this._invalidatePlayerCaches(playerId, categoryNames);
            
            logger.info(`Updated player ${playerId} stats for categories: ${categoryNames.join(', ')}`);

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error updating player stats:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Recalculate all rankings for a category
     */
    async recalculateRankings(categoryName, seasonId = null) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Get category ID
            const categoryResult = await client.query(
                'SELECT id FROM leaderboard_categories WHERE name = $1',
                [categoryName]
            );

            if (categoryResult.rows.length === 0) {
                throw new Error(`Category '${categoryName}' not found`);
            }

            const categoryId = categoryResult.rows[0].id;

            // Store previous ranks
            await client.query(`
                UPDATE leaderboard_entries 
                SET previous_rank = current_rank 
                WHERE category_id = $1 AND ($2::INTEGER IS NULL OR season_id = $2)
            `, [categoryId, seasonId]);

            // Recalculate rankings based on rating
            const rankingQuery = `
                WITH ranked_players AS (
                    SELECT 
                        id,
                        ROW_NUMBER() OVER (ORDER BY rating DESC, wins DESC, win_percentage DESC) as new_rank
                    FROM leaderboard_entries
                    WHERE category_id = $1 AND ($2::INTEGER IS NULL OR season_id = $2)
                )
                UPDATE leaderboard_entries le
                SET 
                    current_rank = rp.new_rank,
                    rank_change = COALESCE(le.previous_rank - rp.new_rank, 0),
                    highest_rank = CASE 
                        WHEN le.highest_rank IS NULL OR rp.new_rank < le.highest_rank 
                        THEN rp.new_rank 
                        ELSE le.highest_rank 
                    END,
                    updated_at = CURRENT_TIMESTAMP
                FROM ranked_players rp
                WHERE le.id = rp.id
            `;

            await client.query(rankingQuery, [categoryId, seasonId]);

            // Record position changes for significant rank movements
            await client.query(`
                INSERT INTO position_changes (player_id, category_id, season_id, old_rank, new_rank, rank_change, change_reason)
                SELECT 
                    player_id, 
                    category_id, 
                    season_id,
                    previous_rank, 
                    current_rank, 
                    rank_change,
                    'ranking_update'
                FROM leaderboard_entries
                WHERE category_id = $1 
                    AND ($2::INTEGER IS NULL OR season_id = $2)
                    AND ABS(rank_change) >= 5 -- Only record significant changes
            `, [categoryId, seasonId]);

            await client.query('COMMIT');

            // Invalidate all caches for this category
            await this._invalidateCategoryCache(categoryName, seasonId);

            logger.info(`Rankings recalculated for category: ${categoryName}, season: ${seasonId}`);

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error recalculating rankings:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get top players around a specific player
     */
    async getPlayersAroundRank(playerId, categoryName, seasonId = null, range = 5) {
        try {
            const playerRank = await this.getPlayerRank(playerId, categoryName, seasonId);
            
            if (!playerRank || !playerRank.current_rank) {
                return null;
            }

            const startRank = Math.max(1, playerRank.current_rank - range);
            const endRank = playerRank.current_rank + range;

            const categoryResult = await pool.query(
                'SELECT id FROM leaderboard_categories WHERE name = $1',
                [categoryName]
            );

            const categoryId = categoryResult.rows[0].id;

            const query = `
                SELECT 
                    le.current_rank,
                    le.rating,
                    le.wins,
                    le.losses,
                    le.win_percentage,
                    p.id as player_id,
                    p.username,
                    p.display_name,
                    p.avatar_url,
                    CASE WHEN p.id = $4 THEN true ELSE false END as is_current_player
                FROM leaderboard_entries le
                JOIN players p ON le.player_id = p.id
                WHERE le.category_id = $1 
                    AND ($2::INTEGER IS NULL OR le.season_id = $2)
                    AND le.current_rank BETWEEN $3 AND $5
                    AND p.is_active = true
                ORDER BY le.current_rank ASC
            `;

            const result = await pool.query(query, [categoryId, seasonId, startRank, playerId, endRank]);

            return {
                players: result.rows,
                playerRank: playerRank.current_rank,
                range: { start: startRank, end: endRank }
            };

        } catch (error) {
            logger.error('Error getting players around rank:', error);
            throw error;
        }
    }

    /**
     * Private helper methods
     */
    async _updatePlayerStatsForCategory(client, playerId, gameResult, categoryName) {
        // Get category and current season
        const categoryResult = await client.query(
            'SELECT id FROM leaderboard_categories WHERE name = $1',
            [categoryName]
        );

        if (categoryResult.rows.length === 0) {
            throw new Error(`Category '${categoryName}' not found`);
        }

        const categoryId = categoryResult.rows[0].id;
        const seasonId = await this._getCurrentSeasonId(client);

        // Get or create leaderboard entry
        const upsertQuery = `
            INSERT INTO leaderboard_entries (player_id, category_id, season_id, wins, losses, draws, total_games, rating, last_game_at)
            VALUES ($1, $2, $3, 0, 0, 0, 0, 1000, CURRENT_TIMESTAMP)
            ON CONFLICT (player_id, category_id, season_id)
            DO UPDATE SET last_game_at = CURRENT_TIMESTAMP
            RETURNING *
        `;

        await client.query(upsertQuery, [playerId, categoryId, seasonId]);

        // Update stats based on game result
        const { result, ratingChange = 0 } = gameResult;
        
        let updateQuery;
        const updateValues = [playerId, categoryId, seasonId];

        switch (result) {
            case 'win':
                updateQuery = `
                    UPDATE leaderboard_entries 
                    SET 
                        wins = wins + 1,
                        total_games = total_games + 1,
                        rating = rating + $4,
                        win_percentage = ROUND((wins + 1) * 100.0 / (total_games + 1), 2),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE player_id = $1 AND category_id = $2 AND season_id = $3
                `;
                updateValues.push(ratingChange);
                break;
            case 'loss':
                updateQuery = `
                    UPDATE leaderboard_entries 
                    SET 
                        losses = losses + 1,
                        total_games = total_games + 1,
                        rating = GREATEST(rating + $4, 0),
                        win_percentage = ROUND(wins * 100.0 / (total_games + 1), 2),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE player_id = $1 AND category_id = $2 AND season_id = $3
                `;
                updateValues.push(ratingChange);
                break;
            case 'draw':
                updateQuery = `
                    UPDATE leaderboard_entries 
                    SET 
                        draws = draws + 1,
                        total_games = total_games + 1,
                        rating = rating + $4,
                        win_percentage = ROUND(wins * 100.0 / (total_games + 1), 2),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE player_id = $1 AND category_id = $2 AND season_id = $3
                `;
                updateValues.push(ratingChange);
                break;
        }

        await client.query(updateQuery, updateValues);
    }

    async _getCurrentSeasonId(client) {
        const result = await client.query(
            'SELECT id FROM seasons WHERE is_active = true ORDER BY start_date DESC LIMIT 1'
        );
        return result.rows.length > 0 ? result.rows[0].id : null;
    }

    _buildOrderByClause(sortBy, sortOrder) {
        const allowedSortFields = {
            'rating': 'le.rating',
            'wins': 'le.wins',
            'win_percentage': 'le.win_percentage',
            'total_games': 'le.total_games',
            'current_rank': 'le.current_rank'
        };

        const field = allowedSortFields[sortBy] || 'le.rating';
        const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        return `ORDER BY ${field} ${order}, le.wins DESC, p.username ASC`;
    }

    _getCacheKey(categoryName, seasonId, sortBy, page, limit) {
        return `leaderboard:${categoryName}:${seasonId || 'global'}:${sortBy}:${page}:${limit}`;
    }

    async _invalidatePlayerCaches(playerId, categoryNames) {
        const keys = [];
        for (const categoryName of categoryNames) {
            keys.push(`player_rank:${playerId}:${categoryName}:global`);
            keys.push(`player_rank:${playerId}:${categoryName}:*`);
        }
        
        try {
            if (keys.length > 0) {
                // Use pattern-based deletion for wildcard keys
                for (const key of keys) {
                    if (key.includes('*')) {
                        const pattern = key.replace('*', '*');
                        const matchingKeys = await redis.keys(pattern);
                        if (matchingKeys.length > 0) {
                            await redis.del(matchingKeys);
                        }
                    } else {
                        await redis.del(key);
                    }
                }
            }
        } catch (error) {
            logger.warn('Error invalidating player caches:', error);
        }
    }

    async _invalidateCategoryCache(categoryName, seasonId) {
        try {
            const pattern = `leaderboard:${categoryName}:${seasonId || 'global'}:*`;
            const keys = await redis.keys(pattern);
            if (keys.length > 0) {
                await redis.del(keys);
            }
        } catch (error) {
            logger.warn('Error invalidating category cache:', error);
        }
    }
}

module.exports = new LeaderboardService();