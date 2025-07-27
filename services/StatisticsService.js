/**
 * Comprehensive Statistics Service
 * Handles all player statistics tracking, aggregation, and analytics
 */

const DatabaseService = require('./DatabaseService');

class StatisticsService {
    constructor() {
        this.db = new DatabaseService();
    }

    /**
     * Update player statistics after a game completion
     * @param {Object} gameData - Complete game data
     * @returns {Promise<void>}
     */
    async updatePlayerStatistics(gameData) {
        const {
            gameId,
            player1Id,
            player2Id,
            winnerId,
            gameDurationSeconds,
            totalMoves,
            player1Moves,
            player2Moves,
            player1AvgMoveTime,
            player2AvgMoveTime,
            player1RatingBefore,
            player2RatingBefore,
            player1RatingAfter,
            player2RatingAfter,
            gameType = 'standard'
        } = gameData;

        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();

            // Insert game statistics record
            await this.insertGameStatistics(connection, gameData);

            // Update player 1 statistics
            await this.updateIndividualPlayerStats(connection, {
                playerId: player1Id,
                opponentId: player2Id,
                isWinner: winnerId === player1Id,
                isDraw: winnerId === null,
                gameDurationSeconds,
                moveCount: player1Moves,
                avgMoveTime: player1AvgMoveTime,
                ratingChange: player1RatingAfter - player1RatingBefore
            });

            // Update player 2 statistics
            await this.updateIndividualPlayerStats(connection, {
                playerId: player2Id,
                opponentId: player1Id,
                isWinner: winnerId === player2Id,
                isDraw: winnerId === null,
                gameDurationSeconds,
                moveCount: player2Moves,
                avgMoveTime: player2AvgMoveTime,
                ratingChange: player2RatingAfter - player2RatingBefore
            });

            // Update ranking percentiles
            await this.updateRankingPercentiles(connection);

            // Check and award achievements
            await this.checkAchievements(connection, player1Id);
            await this.checkAchievements(connection, player2Id);

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Insert game statistics record
     * @param {Object} connection - Database connection
     * @param {Object} gameData - Game data
     */
    async insertGameStatistics(connection, gameData) {
        const query = `
            INSERT INTO game_statistics (
                game_id, player1_id, player2_id, winner_id,
                game_duration_seconds, total_moves, player1_moves, player2_moves,
                player1_avg_move_time, player2_avg_move_time,
                player1_rating_before, player2_rating_before,
                player1_rating_after, player2_rating_after, game_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.execute(query, [
            gameData.gameId,
            gameData.player1Id,
            gameData.player2Id,
            gameData.winnerId,
            gameData.gameDurationSeconds,
            gameData.totalMoves,
            gameData.player1Moves,
            gameData.player2Moves,
            gameData.player1AvgMoveTime,
            gameData.player2AvgMoveTime,
            gameData.player1RatingBefore,
            gameData.player2RatingBefore,
            gameData.player1RatingAfter,
            gameData.player2RatingAfter,
            gameData.gameType
        ]);
    }

    /**
     * Update individual player statistics
     * @param {Object} connection - Database connection
     * @param {Object} playerData - Player game data
     */
    async updateIndividualPlayerStats(connection, playerData) {
        const {
            playerId,
            isWinner,
            isDraw,
            gameDurationSeconds,
            moveCount,
            avgMoveTime,
            ratingChange
        } = playerData;

        // Get current player stats
        const [currentStats] = await connection.execute(
            'SELECT * FROM users WHERE id = ?',
            [playerId]
        );

        if (currentStats.length === 0) {
            throw new Error(`Player ${playerId} not found`);
        }

        const stats = currentStats[0];
        const newGamesPlayed = stats.games_played + 1;
        const newGamesWon = stats.games_won + (isWinner ? 1 : 0);
        const newGamesLost = stats.games_lost + (!isWinner && !isDraw ? 1 : 0);
        const newGamesDrawn = stats.games_drawn + (isDraw ? 1 : 0);

        // Calculate streak
        let newCurrentStreak = stats.current_streak;
        let newLongestWinStreak = stats.longest_win_streak;

        if (isWinner) {
            newCurrentStreak = newCurrentStreak >= 0 ? newCurrentStreak + 1 : 1;
            newLongestWinStreak = Math.max(newLongestWinStreak, newCurrentStreak);
        } else if (!isDraw) {
            newCurrentStreak = newCurrentStreak <= 0 ? newCurrentStreak - 1 : -1;
        }
        // Draw doesn't change streak

        // Update total playtime
        const newTotalPlaytime = stats.total_playtime_seconds + gameDurationSeconds;

        // Calculate new average moves per game
        const totalMoves = (stats.average_moves_per_game * stats.games_played) + moveCount;
        const newAverageMovesPerGame = totalMoves / newGamesPlayed;

        // Update player statistics
        const updateQuery = `
            UPDATE users SET
                elo_rating = ?,
                games_played = ?,
                games_won = ?,
                games_lost = ?,
                games_drawn = ?,
                current_streak = ?,
                longest_win_streak = ?,
                total_playtime_seconds = ?,
                average_moves_per_game = ?,
                last_game_played = CURRENT_TIMESTAMP
            WHERE id = ?
        `;

        await connection.execute(updateQuery, [
            stats.elo_rating + ratingChange,
            newGamesPlayed,
            newGamesWon,
            newGamesLost,
            newGamesDrawn,
            newCurrentStreak,
            newLongestWinStreak,
            newTotalPlaytime,
            newAverageMovesPerGame,
            playerId
        ]);
    }

    /**
     * Update ranking percentiles for all active players
     * @param {Object} connection - Database connection
     */
    async updateRankingPercentiles(connection) {
        const query = `
            UPDATE users u1 
            SET ranking_percentile = (
                SELECT 100.0 * (COUNT(*) - 1) / (
                    SELECT COUNT(*) - 1 
                    FROM users 
                    WHERE games_played >= 10
                )
                FROM users u2 
                WHERE u2.elo_rating <= u1.elo_rating 
                AND u2.games_played >= 10
            )
            WHERE u1.games_played >= 10
        `;

        await connection.execute(query);
    }

    /**
     * Get comprehensive player statistics
     * @param {number} userId - Player ID
     * @returns {Promise<Object>} Player statistics
     */
    async getPlayerStatistics(userId) {
        const connection = await this.db.getConnection();
        
        try {
            // Get basic player stats
            const [playerStats] = await connection.execute(
                'SELECT * FROM users WHERE id = ?',
                [userId]
            );

            if (playerStats.length === 0) {
                throw new Error('Player not found');
            }

            const stats = playerStats[0];

            // Get recent games (last 10)
            const [recentGames] = await connection.execute(`
                SELECT gs.*, 
                       u1.username as player1_username,
                       u2.username as player2_username,
                       CASE 
                           WHEN gs.player1_id = ? THEN gs.player1_rating_after
                           ELSE gs.player2_rating_after
                       END as player_rating_after,
                       CASE 
                           WHEN gs.player1_id = ? THEN gs.player1_rating_before
                           ELSE gs.player2_rating_before
                       END as player_rating_before
                FROM game_statistics gs
                JOIN users u1 ON gs.player1_id = u1.id
                JOIN users u2 ON gs.player2_id = u2.id
                WHERE gs.player1_id = ? OR gs.player2_id = ?
                ORDER BY gs.created_at DESC
                LIMIT 10
            `, [userId, userId, userId, userId]);

            // Get rating history (last 30 changes)
            const [ratingHistory] = await connection.execute(`
                SELECT * FROM rating_history 
                WHERE user_id = ? 
                ORDER BY created_at DESC 
                LIMIT 30
            `, [userId]);

            // Get achievements
            const [achievements] = await connection.execute(`
                SELECT a.*, pa.earned_at, pa.progress
                FROM achievements a
                JOIN player_achievements pa ON a.id = pa.achievement_id
                WHERE pa.user_id = ?
                ORDER BY pa.earned_at DESC
            `, [userId]);

            // Calculate win rate and other derived stats
            const winRate = stats.games_played > 0 ? 
                (stats.games_won / stats.games_played * 100).toFixed(2) : 0;
            
            const averageGameDuration = stats.games_played > 0 ?
                Math.round(stats.total_playtime_seconds / stats.games_played) : 0;

            // Get performance trends (last 30 days)
            const [performanceTrend] = await connection.execute(`
                SELECT 
                    DATE(gs.created_at) as game_date,
                    COUNT(*) as games_count,
                    SUM(CASE WHEN gs.winner_id = ? THEN 1 ELSE 0 END) as wins,
                    AVG(CASE 
                        WHEN gs.player1_id = ? THEN gs.player1_rating_after
                        ELSE gs.player2_rating_after
                    END) as avg_rating
                FROM game_statistics gs
                WHERE (gs.player1_id = ? OR gs.player2_id = ?)
                AND gs.created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
                GROUP BY DATE(gs.created_at)
                ORDER BY game_date ASC
            `, [userId, userId, userId, userId]);

            return {
                basicStats: {
                    ...stats,
                    winRate: parseFloat(winRate),
                    averageGameDuration,
                    lossRate: stats.games_played > 0 ? 
                        (stats.games_lost / stats.games_played * 100).toFixed(2) : 0,
                    drawRate: stats.games_played > 0 ? 
                        (stats.games_drawn / stats.games_played * 100).toFixed(2) : 0
                },
                recentGames,
                ratingHistory,
                achievements,
                performanceTrend
            };
        } finally {
            connection.release();
        }
    }

    /**
     * Get leaderboard with pagination
     * @param {Object} options - {page, limit, timeframe, gameType}
     * @returns {Promise<Object>} Leaderboard data
     */
    async getLeaderboard(options = {}) {
        const {
            page = 1,
            limit = 50,
            timeframe = 'all', // 'all', 'month', 'week'
            gameType = 'all'
        } = options;

        const offset = (page - 1) * limit;
        const connection = await this.db.getConnection();

        try {
            let whereClause = 'WHERE u.games_played >= 10';
            let joinClause = '';
            
            if (timeframe !== 'all') {
                const days = timeframe === 'week' ? 7 : 30;
                joinClause = `
                    JOIN (
                        SELECT 
                            CASE WHEN gs.player1_id = u.id THEN gs.player1_id ELSE gs.player2_id END as player_id,
                            COUNT(*) as recent_games
                        FROM game_statistics gs, users u
                        WHERE (gs.player1_id = u.id OR gs.player2_id = u.id)
                        AND gs.created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
                        GROUP BY player_id
                        HAVING recent_games >= 3
                    ) recent ON recent.player_id = u.id
                `;
            }

            const query = `
                SELECT 
                    u.id,
                    u.username,
                    u.elo_rating,
                    u.games_played,
                    u.games_won,
                    u.games_lost,
                    u.games_drawn,
                    u.current_streak,
                    u.longest_win_streak,
                    u.ranking_percentile,
                    ROUND(u.games_won / u.games_played * 100, 2) as win_rate,
                    ROW_NUMBER() OVER (ORDER BY u.elo_rating DESC) as rank_position
                FROM users u
                ${joinClause}
                ${whereClause}
                ORDER BY u.elo_rating DESC
                LIMIT ? OFFSET ?
            `;

            const [leaderboard] = await connection.execute(query, [limit, offset]);

            // Get total count for pagination
            const [countResult] = await connection.execute(`
                SELECT COUNT(*) as total
                FROM users u
                ${joinClause}
                ${whereClause}
            `);

            const total = countResult[0].total;
            const totalPages = Math.ceil(total / limit);

            return {
                leaderboard,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            };
        } finally {
            connection.release();
        }
    }

    /**
     * Check and award achievements for a player
     * @param {Object} connection - Database connection
     * @param {number} userId - Player ID
     */
    async checkAchievements(connection, userId) {
        // Get current player stats
        const [playerStats] = await connection.execute(
            'SELECT * FROM users WHERE id = ?',
            [userId]
        );

        if (playerStats.length === 0) return;

        const stats = playerStats[0];

        // Get all achievements not yet earned by this player
        const [availableAchievements] = await connection.execute(`
            SELECT a.* FROM achievements a
            WHERE a.is_active = TRUE
            AND a.id NOT IN (
                SELECT pa.achievement_id 
                FROM player_achievements pa 
                WHERE pa.user_id = ?
            )
        `, [userId]);

        for (const achievement of availableAchievements) {
            let earned = false;

            switch (achievement.condition_type) {
                case 'total_wins':
                    earned = stats.games_won >= achievement.condition_value;
                    break;
                case 'win_streak':
                    earned = stats.longest_win_streak >= achievement.condition_value;
                    break;
                case 'games_played':
                    earned = stats.games_played >= achievement.condition_value;
                    break;
                case 'rating_reached':
                    earned = stats.elo_rating >= achievement.condition_value;
                    break;
            }

            if (earned) {
                await connection.execute(`
                    INSERT INTO player_achievements (user_id, achievement_id, progress)
                    VALUES (?, ?, ?)
                `, [userId, achievement.id, achievement.condition_value]);
            }
        }
    }

    /**
     * Generate daily statistics snapshots for performance optimization
     * @returns {Promise<void>}
     */
    async generateDailySnapshots() {
        const connection = await this.db.getConnection();
        
        try {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const dateStr = yesterday.toISOString().split('T')[0];

            // Get all active players (played in last 30 days)
            const [activePlayers] = await connection.execute(`
                SELECT DISTINCT u.id, u.elo_rating
                FROM users u
                JOIN game_statistics gs ON (u.id = gs.player1_id OR u.id = gs.player2_id)
                WHERE gs.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            `);

            for (const player of activePlayers) {
                // Get player's stats for the day
                const [dayStats] = await connection.execute(`
                    SELECT 
                        COUNT(*) as games_played,
                        SUM(CASE WHEN gs.winner_id = ? THEN 1 ELSE 0 END) as games_won,
                        SUM(CASE WHEN gs.winner_id != ? AND gs.winner_id IS NOT NULL THEN 1 ELSE 0 END) as games_lost,
                        SUM(CASE WHEN gs.winner_id IS NULL THEN 1 ELSE 0 END) as games_drawn,
                        SUM(gs.game_duration_seconds) as total_playtime,
                        AVG(gs.game_duration_seconds) as avg_duration,
                        MIN(CASE 
                            WHEN gs.player1_id = ? THEN gs.player1_rating_before
                            ELSE gs.player2_rating_before
                        END) as rating_start,
                        MAX(CASE 
                            WHEN gs.player1_id = ? THEN gs.player1_rating_after
                            ELSE gs.player2_rating_after
                        END) as rating_end
                    FROM game_statistics gs
                    WHERE (gs.player1_id = ? OR gs.player2_id = ?)
                    AND DATE(gs.created_at) = ?
                `, [player.id, player.id, player.id, player.id, player.id, player.id, dateStr]);

                const stats = dayStats[0];
                
                if (stats.games_played > 0) {
                    const winRate = (stats.games_won / stats.games_played * 100).toFixed(2);

                    await connection.execute(`
                        INSERT INTO statistics_snapshots (
                            user_id, snapshot_date, snapshot_type,
                            games_played, games_won, games_lost, games_drawn,
                            rating_start, rating_end, rating_peak,
                            total_playtime_seconds, average_game_duration, win_rate
                        ) VALUES (?, ?, 'daily', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                        games_played = VALUES(games_played),
                        games_won = VALUES(games_won),
                        games_lost = VALUES(games_lost),
                        games_drawn = VALUES(games_drawn),
                        rating_start = VALUES(rating_start),
                        rating_end = VALUES(rating_end),
                        rating_peak = VALUES(rating_peak),
                        total_playtime_seconds = VALUES(total_playtime_seconds),
                        average_game_duration = VALUES(average_game_duration),
                        win_rate = VALUES(win_rate)
                    `, [
                        player.id, dateStr,
                        stats.games_played, stats.games_won, stats.games_lost, stats.games_drawn,
                        stats.rating_start, stats.rating_end, stats.rating_end,
                        stats.total_playtime, stats.avg_duration, winRate
                    ]);
                }
            }
        } finally {
            connection.release();
        }
    }
}

module.exports = StatisticsService;