const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Comprehensive statistics tracking service for player performance
 */
class StatisticsService {

    /**
     * Update player statistics after a game completes
     * @param {string} winnerId 
     * @param {string} loserId 
     * @param {Object} gameData - Game details for analysis
     */
    static async updatePlayerStatistics(winnerId, loserId, gameData) {
        const client = await db.getClient();
        
        try {
            await client.query('BEGIN');

            // Update winner stats
            await this.updatePlayerGameStats(client, winnerId, {
                isWin: true,
                gameDuration: gameData.duration,
                moveCount: gameData.winnerMoves,
                gameId: gameData.gameId
            });

            // Update loser stats  
            await this.updatePlayerGameStats(client, loserId, {
                isWin: false,
                gameDuration: gameData.duration,
                moveCount: gameData.loserMoves,
                gameId: gameData.gameId
            });

            // Update streaks
            await this.updateWinStreaks(client, winnerId, loserId);

            await client.query('COMMIT');

            logger.info('Player statistics updated', {
                winnerId,
                loserId,
                gameDuration: gameData.duration
            });

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to update player statistics', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Update individual player game statistics
     */
    static async updatePlayerGameStats(client, userId, gameStats) {
        const { isWin, gameDuration, moveCount } = gameStats;

        // Get current stats for streak calculation
        const currentStatsQuery = `
            SELECT wins, losses, games_played, current_win_streak, current_loss_streak,
                   total_game_time, total_moves, fastest_win, average_moves_per_game
            FROM user_statistics 
            WHERE user_id = $1
        `;
        const currentStats = await client.query(currentStatsQuery, [userId]);
        const stats = currentStats.rows[0];

        // Calculate new averages
        const newGamesPlayed = stats.games_played + 1;
        const newTotalMoves = stats.total_moves + moveCount;
        const newAverageMoves = Math.round(newTotalMoves / newGamesPlayed);
        const newTotalTime = (stats.total_game_time || 0) + gameDuration;

        let updateQuery, updateParams;

        if (isWin) {
            const newFastestWin = stats.fastest_win 
                ? Math.min(stats.fastest_win, gameDuration)
                : gameDuration;

            updateQuery = `
                UPDATE user_statistics SET
                    wins = wins + 1,
                    games_played = games_played + 1,
                    current_win_streak = current_win_streak + 1,
                    current_loss_streak = 0,
                    best_win_streak = GREATEST(best_win_streak, current_win_streak + 1),
                    total_game_time = total_game_time + $2,
                    total_moves = total_moves + $3,
                    average_moves_per_game = $4,
                    fastest_win = $5,
                    last_game_at = NOW(),
                    updated_at = NOW()
                WHERE user_id = $1
            `;
            updateParams = [userId, gameDuration, moveCount, newAverageMoves, newFastestWin];
        } else {
            updateQuery = `
                UPDATE user_statistics SET
                    losses = losses + 1,
                    games_played = games_played + 1,
                    current_win_streak = 0,
                    current_loss_streak = current_loss_streak + 1,
                    best_loss_streak = GREATEST(best_loss_streak, current_loss_streak + 1),
                    total_game_time = total_game_time + $2,
                    total_moves = total_moves + $3,
                    average_moves_per_game = $4,
                    last_game_at = NOW(),
                    updated_at = NOW()
                WHERE user_id = $1
            `;
            updateParams = [userId, gameDuration, moveCount, newAverageMoves];
        }

        await client.query(updateQuery, updateParams);

        // Record detailed game performance
        await this.recordGamePerformance(client, userId, gameStats);
    }

    /**
     * Record detailed game performance for analytics
     */
    static async recordGamePerformance(client, userId, gameStats) {
        await client.query(`
            INSERT INTO game_performance (
                user_id, game_id, move_count, game_duration, 
                result, efficiency_score, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
            userId,
            gameStats.gameId,
            gameStats.moveCount,
            gameStats.gameDuration,
            gameStats.isWin ? 'win' : 'loss',
            this.calculateEfficiencyScore(gameStats)
        ]);
    }

    /**
     * Calculate efficiency score based on moves and time
     */
    static calculateEfficiencyScore(gameStats) {
        // Simple efficiency metric: fewer moves and shorter time = higher score
        const moveEfficiency = Math.max(0, 100 - gameStats.moveCount * 2);
        const timeEfficiency = Math.max(0, 100 - gameStats.gameDuration / 1000 / 60); // penalize longer games
        return Math.round((moveEfficiency + timeEfficiency) / 2);
    }

    /**
     * Update win/loss streaks
     */
    static async updateWinStreaks(client, winnerId, loserId) {
        // Winner's streak is already updated in updatePlayerGameStats
        // Just need to ensure loser's win streak is reset (also done above)
        // This method can be extended for more complex streak logic
    }

    /**
     * Get comprehensive player statistics
     */
    static async getPlayerStatistics(userId) {
        const query = `
            SELECT 
                us.*,
                u.username,
                u.created_at as account_created,
                (SELECT COUNT(*) FROM user_statistics WHERE rating > us.rating AND games_played >= 10) + 1 as global_rank,
                (SELECT COUNT(*) FROM user_statistics WHERE games_played >= 10) as total_ranked_players,
                CASE 
                    WHEN us.games_played > 0 THEN ROUND((us.wins::float / us.games_played) * 100, 1)
                    ELSE 0 
                END as win_percentage,
                CASE 
                    WHEN us.total_game_time > 0 AND us.games_played > 0 
                    THEN ROUND(us.total_game_time / us.games_played / 1000 / 60, 1)
                    ELSE 0 
                END as average_game_duration_minutes
            FROM user_statistics us
            JOIN users u ON us.user_id = u.id
            WHERE us.user_id = $1
        `;

        const result = await db.query(query, [userId]);
        return result.rows[0];
    }

    /**
     * Get player's recent game performance
     */
    static async getRecentPerformance(userId, limit = 10) {
        const query = `
            SELECT 
                gp.*,
                g.created_at as game_date,
                opponent.username as opponent_name,
                CASE 
                    WHEN gp.result = 'win' THEN '+'
                    ELSE '-'
                END || ABS(rh.rating_change) as rating_change
            FROM game_performance gp
            JOIN games g ON gp.game_id = g.id
            LEFT JOIN game_participants gp_opp ON g.id = gp_opp.game_id AND gp_opp.user_id != $1
            LEFT JOIN users opponent ON gp_opp.user_id = opponent.id
            LEFT JOIN rating_history rh ON rh.user_id = $1 AND rh.game_id = g.id
            WHERE gp.user_id = $1
            ORDER BY g.created_at DESC
            LIMIT $2
        `;

        const result = await db.query(query, [userId, limit]);
        return result.rows;
    }

    /**
     * Get player achievements
     */
    static async getPlayerAchievements(userId) {
        const stats = await this.getPlayerStatistics(userId);
        const achievements = [];

        // Win milestone achievements
        const winMilestones = [1, 5, 10, 25, 50, 100, 250, 500, 1000];
        winMilestones.forEach(milestone => {
            if (stats.wins >= milestone) {
                achievements.push({
                    id: `wins_${milestone}`,
                    name: `${milestone} Win${milestone > 1 ? 's' : ''}`,
                    description: `Won ${milestone} game${milestone > 1 ? 's' : ''}`,
                    type: 'wins',
                    unlocked: true,
                    unlockedAt: stats.last_game_at
                });
            }
        });

        // Win streak achievements
        const streakMilestones = [3, 5, 10, 15, 25];
        streakMilestones.forEach(streak => {
            if (stats.best_win_streak >= streak) {
                achievements.push({
                    id: `streak_${streak}`,
                    name: `${streak} Game Win Streak`,
                    description: `Won ${streak} games in a row`,
                    type: 'streak',
                    unlocked: true
                });
            }
        });

        // Rating achievements
        const ratingMilestones = [1000, 1200, 1400, 1600, 1800, 2000];
        ratingMilestones.forEach(rating => {
            if (stats.peak_rating >= rating) {
                achievements.push({
                    id: `rating_${rating}`,
                    name: `${rating} Rating`,
                    description: `Reached ${rating} rating`,
                    type: 'rating',
                    unlocked: true
                });
            }
        });

        // Special achievements
        if (stats.fastest_win && stats.fastest_win < 60000) { // Under 1 minute
            achievements.push({
                id: 'speed_demon',
                name: 'Speed Demon',
                description: 'Won a game in under 1 minute',
                type: 'special',
                unlocked: true
            });
        }

        if (stats.games_played >= 100) {
            achievements.push({
                id: 'veteran',
                name: 'Veteran Player',
                description: 'Played 100 games',
                type: 'special',
                unlocked: true
            });
        }

        return achievements;
    }

    /**
     * Get global leaderboard statistics
     */
    static async getGlobalStats() {
        const query = `
            SELECT 
                COUNT(*) as total_players,
                SUM(games_played) as total_games,
                AVG(rating)::integer as average_rating,
                MAX(rating) as highest_rating,
                MIN(rating) as lowest_rating,
                MAX(best_win_streak) as longest_win_streak
            FROM user_statistics
            WHERE games_played > 0
        `;

        const result = await db.query(query);
        return result.rows[0];
    }

    /**
     * Get player performance trends over time
     */
    static async getPerformanceTrends(userId, days = 30) {
        const query = `
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as games_played,
                SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
                AVG(efficiency_score)::integer as avg_efficiency,
                AVG(move_count)::integer as avg_moves
            FROM game_performance
            WHERE user_id = $1 
                AND created_at >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `;

        const result = await db.query(query, [userId]);
        return result.rows;
    }
}

module.exports = StatisticsService;