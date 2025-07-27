const pool = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');

class PositionTrackingService {
    constructor() {
        this.significantChangeThreshold = 5; // Rank changes >= 5 positions
        this.notificationThresholds = [1, 5, 10, 25, 50, 100]; // Top rank thresholds for notifications
    }

    /**
     * Track position changes for a player across all categories
     */
    async trackPlayerPositionChanges(playerId) {
        try {
            const query = `
                SELECT 
                    le.player_id,
                    le.category_id,
                    le.season_id,
                    le.current_rank,
                    le.previous_rank,
                    le.rank_change,
                    le.highest_rank,
                    lc.name as category_name,
                    p.username
                FROM leaderboard_entries le
                JOIN leaderboard_categories lc ON le.category_id = lc.id
                JOIN players p ON le.player_id = p.id
                WHERE le.player_id = $1 AND le.rank_change != 0
                ORDER BY ABS(le.rank_change) DESC
            `;

            const result = await pool.query(query, [playerId]);
            
            return {
                playerId,
                changes: result.rows,
                totalChanges: result.rows.length
            };

        } catch (error) {
            logger.error('Error tracking player position changes:', error);
            throw error;
        }
    }

    /**
     * Get recent significant position changes across all players
     */
    async getRecentSignificantChanges(options = {}) {
        const { 
            limit = 50, 
            categoryName = null, 
            seasonId = null,
            minRankChange = this.significantChangeThreshold,
            hours = 24 
        } = options;

        try {
            let whereConditions = ['ABS(pc.rank_change) >= $1'];
            let queryParams = [minRankChange];
            let paramIndex = 2;

            if (categoryName) {
                whereConditions.push(`lc.name = $${paramIndex}`);
                queryParams.push(categoryName);
                paramIndex++;
            }

            if (seasonId) {
                whereConditions.push(`pc.season_id = $${paramIndex}`);
                queryParams.push(seasonId);
                paramIndex++;
            }

            whereConditions.push(`pc.created_at >= CURRENT_TIMESTAMP - INTERVAL '${hours} hours'`);

            const query = `
                SELECT 
                    pc.player_id,
                    pc.old_rank,
                    pc.new_rank,
                    pc.rank_change,
                    pc.change_reason,
                    pc.created_at,
                    p.username,
                    p.display_name,
                    p.avatar_url,
                    lc.name as category_name,
                    le.rating,
                    le.wins,
                    le.total_games
                FROM position_changes pc
                JOIN players p ON pc.player_id = p.id
                JOIN leaderboard_categories lc ON pc.category_id = lc.id
                LEFT JOIN leaderboard_entries le ON (
                    pc.player_id = le.player_id 
                    AND pc.category_id = le.category_id 
                    AND pc.season_id = le.season_id
                )
                WHERE ${whereConditions.join(' AND ')}
                ORDER BY pc.created_at DESC, ABS(pc.rank_change) DESC
                LIMIT $${paramIndex}
            `;

            queryParams.push(limit);

            const result = await pool.query(query, queryParams);

            return {
                changes: result.rows,
                totalChanges: result.rows.length,
                filters: { categoryName, seasonId, minRankChange, hours }
            };

        } catch (error) {
            logger.error('Error getting recent significant changes:', error);
            throw error;
        }
    }

    /**
     * Get position change history for a specific player
     */
    async getPlayerPositionHistory(playerId, options = {}) {
        const { 
            categoryName = null, 
            seasonId = null, 
            limit = 100,
            days = 30
        } = options;

        try {
            let whereConditions = ['pc.player_id = $1'];
            let queryParams = [playerId];
            let paramIndex = 2;

            if (categoryName) {
                whereConditions.push(`lc.name = $${paramIndex}`);
                queryParams.push(categoryName);
                paramIndex++;
            }

            if (seasonId) {
                whereConditions.push(`pc.season_id = $${paramIndex}`);
                queryParams.push(seasonId);
                paramIndex++;
            }

            whereConditions.push(`pc.created_at >= CURRENT_TIMESTAMP - INTERVAL '${days} days'`);

            const query = `
                SELECT 
                    pc.old_rank,
                    pc.new_rank,
                    pc.rank_change,
                    pc.change_reason,
                    pc.created_at,
                    lc.name as category_name,
                    lc.description as category_description
                FROM position_changes pc
                JOIN leaderboard_categories lc ON pc.category_id = lc.id
                WHERE ${whereConditions.join(' AND ')}
                ORDER BY pc.created_at DESC
                LIMIT $${paramIndex}
            `;

            queryParams.push(limit);

            const result = await pool.query(query, queryParams);

            // Calculate statistics
            const stats = this._calculatePositionStats(result.rows);

            return {
                playerId,
                history: result.rows,
                statistics: stats,
                filters: { categoryName, seasonId, days }
            };

        } catch (error) {
            logger.error('Error getting player position history:', error);
            throw error;
        }
    }

    /**
     * Get players who achieved new personal bests
     */
    async getNewPersonalBests(options = {}) {
        const { 
            categoryName = null, 
            seasonId = null, 
            limit = 50,
            hours = 24 
        } = options;

        try {
            let whereConditions = ['le.highest_rank = le.current_rank'];
            let queryParams = [];
            let paramIndex = 1;

            if (categoryName) {
                whereConditions.push(`lc.name = $${paramIndex}`);
                queryParams.push(categoryName);
                paramIndex++;
            }

            if (seasonId) {
                whereConditions.push(`le.season_id = $${paramIndex}`);
                queryParams.push(seasonId);
                paramIndex++;
            }

            whereConditions.push(`le.updated_at >= CURRENT_TIMESTAMP - INTERVAL '${hours} hours'`);

            const query = `
                SELECT 
                    le.player_id,
                    le.current_rank as new_best_rank,
                    le.previous_rank as previous_rank,
                    le.rating,
                    le.wins,
                    le.total_games,
                    le.updated_at,
                    p.username,
                    p.display_name,
                    p.avatar_url,
                    lc.name as category_name
                FROM leaderboard_entries le
                JOIN players p ON le.player_id = p.id
                JOIN leaderboard_categories lc ON le.category_id = lc.id
                WHERE ${whereConditions.join(' AND ')}
                    AND p.is_active = true
                ORDER BY le.current_rank ASC, le.updated_at DESC
                LIMIT $${paramIndex}
            `;

            queryParams.push(limit);

            const result = await pool.query(query, queryParams);

            return {
                personalBests: result.rows,
                totalCount: result.rows.length,
                filters: { categoryName, seasonId, hours }
            };

        } catch (error) {
            logger.error('Error getting new personal bests:', error);
            throw error;
        }
    }

    /**
     * Record a position change
     */
    async recordPositionChange(playerId, categoryId, seasonId, oldRank, newRank, reason = 'game_result') {
        try {
            const rankChange = oldRank - newRank; // Positive means improvement

            const query = `
                INSERT INTO position_changes (player_id, category_id, season_id, old_rank, new_rank, rank_change, change_reason)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `;

            const result = await pool.query(query, [
                playerId, categoryId, seasonId, oldRank, newRank, rankChange, reason
            ]);

            // Check if this qualifies for notifications
            if (Math.abs(rankChange) >= this.significantChangeThreshold) {
                await this._handleSignificantChange(result.rows[0]);
            }

            return result.rows[0];

        } catch (error) {
            logger.error('Error recording position change:', error);
            throw error;
        }
    }

    /**
     * Get rank change analytics for a category
     */
    async getRankChangeAnalytics(categoryName, seasonId = null, days = 7) {
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
                    DATE_TRUNC('day', created_at) as date,
                    COUNT(*) as total_changes,
                    COUNT(CASE WHEN rank_change > 0 THEN 1 END) as improvements,
                    COUNT(CASE WHEN rank_change < 0 THEN 1 END) as declines,
                    AVG(ABS(rank_change)) as avg_change_magnitude,
                    MAX(ABS(rank_change)) as max_change_magnitude
                FROM position_changes
                WHERE category_id = $1 
                    AND ($2::INTEGER IS NULL OR season_id = $2)
                    AND created_at >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
                GROUP BY DATE_TRUNC('day', created_at)
                ORDER BY date DESC
            `;

            const result = await pool.query(query, [categoryId, seasonId]);

            return {
                categoryName,
                seasonId,
                analytics: result.rows,
                period: `${days} days`
            };

        } catch (error) {
            logger.error('Error getting rank change analytics:', error);
            throw error;
        }
    }

    /**
     * Clean up old position change records
     */
    async cleanupOldRecords(retentionDays = 90) {
        try {
            const result = await pool.query(`
                DELETE FROM position_changes 
                WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '${retentionDays} days'
                RETURNING COUNT(*) as deleted_count
            `);

            const deletedCount = result.rows[0]?.deleted_count || 0;
            logger.info(`Cleaned up ${deletedCount} old position change records`);

            return deletedCount;

        } catch (error) {
            logger.error('Error cleaning up old records:', error);
            throw error;
        }
    }

    /**
     * Private helper methods
     */
    _calculatePositionStats(changes) {
        if (changes.length === 0) {
            return {
                totalChanges: 0,
                improvements: 0,
                declines: 0,
                averageChange: 0,
                largestImprovement: 0,
                largestDecline: 0
            };
        }

        const improvements = changes.filter(c => c.rank_change > 0);
        const declines = changes.filter(c => c.rank_change < 0);

        return {
            totalChanges: changes.length,
            improvements: improvements.length,
            declines: declines.length,
            averageChange: changes.reduce((sum, c) => sum + Math.abs(c.rank_change), 0) / changes.length,
            largestImprovement: Math.max(...improvements.map(c => c.rank_change), 0),
            largestDecline: Math.abs(Math.min(...declines.map(c => c.rank_change), 0))
        };
    }

    async _handleSignificantChange(changeRecord) {
        try {
            // Cache notification data for external notification system
            const notificationData = {
                playerId: changeRecord.player_id,
                rankChange: changeRecord.rank_change,
                newRank: changeRecord.new_rank,
                oldRank: changeRecord.old_rank,
                categoryId: changeRecord.category_id,
                timestamp: changeRecord.created_at
            };

            const cacheKey = `rank_notification:${changeRecord.player_id}:${Date.now()}`;
            await redis.setEx(cacheKey, 3600, JSON.stringify(notificationData)); // 1 hour expiry

            // Check if player reached a notification threshold rank
            if (this.notificationThresholds.includes(changeRecord.new_rank)) {
                const achievementKey = `rank_achievement:${changeRecord.player_id}:${changeRecord.new_rank}`;
                await redis.setEx(achievementKey, 3600, JSON.stringify({
                    ...notificationData,
                    achievement: `Reached rank ${changeRecord.new_rank}`
                }));
            }

            logger.info(`Recorded significant rank change for player ${changeRecord.player_id}: ${changeRecord.old_rank} -> ${changeRecord.new_rank}`);

        } catch (error) {
            logger.warn('Error handling significant change notification:', error);
        }
    }
}

module.exports = new PositionTrackingService();