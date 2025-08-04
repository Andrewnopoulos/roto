/**
 * Achievement System Service
 * Manages achievement definitions, tracking, and awarding
 */

const DatabaseService = require('./DatabaseService');

class AchievementService {
    constructor() {
        this.db = new DatabaseService();
        
        // Achievement categories and their weights for scoring
        this.achievementCategories = {
            'wins': { weight: 1.0, description: 'Victory achievements' },
            'streaks': { weight: 1.5, description: 'Winning streak achievements' },
            'games': { weight: 0.8, description: 'Game participation achievements' },
            'rating': { weight: 2.0, description: 'Rating milestone achievements' },
            'special': { weight: 3.0, description: 'Special accomplishments' }
        };
    }

    /**
     * Initialize achievement system with default achievements
     * @returns {Promise<void>}
     */
    async initializeAchievements() {
        const connection = await this.db.getConnection();
        
        try {
            const defaultAchievements = [
                // Win-based achievements
                {
                    name: 'First Blood',
                    description: 'Win your very first game',
                    category: 'wins',
                    condition_type: 'total_wins',
                    condition_value: 1,
                    points: 10,
                    icon_url: '/achievements/first_win.png'
                },
                {
                    name: 'Getting Started',
                    description: 'Win 5 games',
                    category: 'wins',
                    condition_type: 'total_wins',
                    condition_value: 5,
                    points: 25,
                    icon_url: '/achievements/wins_5.png'
                },
                {
                    name: 'Veteran',
                    description: 'Win 25 games',
                    category: 'wins',
                    condition_type: 'total_wins',
                    condition_value: 25,
                    points: 75,
                    icon_url: '/achievements/wins_25.png'
                },
                {
                    name: 'Champion',
                    description: 'Win 100 games',
                    category: 'wins',
                    condition_type: 'total_wins',
                    condition_value: 100,
                    points: 250,
                    icon_url: '/achievements/wins_100.png'
                },
                {
                    name: 'Legend',
                    description: 'Win 500 games',
                    category: 'wins',
                    condition_type: 'total_wins',
                    condition_value: 500,
                    points: 1000,
                    icon_url: '/achievements/wins_500.png'
                },

                // Streak achievements
                {
                    name: 'Double Trouble',
                    description: 'Win 2 games in a row',
                    category: 'streaks',
                    condition_type: 'win_streak',
                    condition_value: 2,
                    points: 15,
                    icon_url: '/achievements/streak_2.png'
                },
                {
                    name: 'Hot Streak',
                    description: 'Win 3 games in a row',
                    category: 'streaks',
                    condition_type: 'win_streak',
                    condition_value: 3,
                    points: 30,
                    icon_url: '/achievements/streak_3.png'
                },
                {
                    name: 'On Fire',
                    description: 'Win 5 games in a row',
                    category: 'streaks',
                    condition_type: 'win_streak',
                    condition_value: 5,
                    points: 75,
                    icon_url: '/achievements/streak_5.png'
                },
                {
                    name: 'Unstoppable',
                    description: 'Win 10 games in a row',
                    category: 'streaks',
                    condition_type: 'win_streak',
                    condition_value: 10,
                    points: 200,
                    icon_url: '/achievements/streak_10.png'
                },
                {
                    name: 'Legendary Streak',
                    description: 'Win 20 games in a row',
                    category: 'streaks',
                    condition_type: 'win_streak',
                    condition_value: 20,
                    points: 500,
                    icon_url: '/achievements/streak_20.png'
                },

                // Games played achievements
                {
                    name: 'Getting Active',
                    description: 'Play 10 games',
                    category: 'games',
                    condition_type: 'games_played',
                    condition_value: 10,
                    points: 20,
                    icon_url: '/achievements/games_10.png'
                },
                {
                    name: 'Regular Player',
                    description: 'Play 50 games',
                    category: 'games',
                    condition_type: 'games_played',
                    condition_value: 50,
                    points: 60,
                    icon_url: '/achievements/games_50.png'
                },
                {
                    name: 'Dedicated Gamer',
                    description: 'Play 200 games',
                    category: 'games',
                    condition_type: 'games_played',
                    condition_value: 200,
                    points: 150,
                    icon_url: '/achievements/games_200.png'
                },
                {
                    name: 'Game Enthusiast',
                    description: 'Play 1000 games',
                    category: 'games',
                    condition_type: 'games_played',
                    condition_value: 1000,
                    points: 400,
                    icon_url: '/achievements/games_1000.png'
                },

                // Rating achievements
                {
                    name: 'Rising Star',
                    description: 'Reach 1300 rating',
                    category: 'rating',
                    condition_type: 'rating_reached',
                    condition_value: 1300,
                    points: 50,
                    icon_url: '/achievements/rating_1300.png'
                },
                {
                    name: 'Skilled Player',
                    description: 'Reach 1500 rating',
                    category: 'rating',
                    condition_type: 'rating_reached',
                    condition_value: 1500,
                    points: 100,
                    icon_url: '/achievements/rating_1500.png'
                },
                {
                    name: 'Expert',
                    description: 'Reach 1700 rating',
                    category: 'rating',
                    condition_type: 'rating_reached',
                    condition_value: 1700,
                    points: 200,
                    icon_url: '/achievements/rating_1700.png'
                },
                {
                    name: 'Master',
                    description: 'Reach 1900 rating',
                    category: 'rating',
                    condition_type: 'rating_reached',
                    condition_value: 1900,
                    points: 400,
                    icon_url: '/achievements/rating_1900.png'
                },
                {
                    name: 'Grandmaster',
                    description: 'Reach 2100 rating',
                    category: 'rating',
                    condition_type: 'rating_reached',
                    condition_value: 2100,
                    points: 800,
                    icon_url: '/achievements/rating_2100.png'
                },

                // Special achievements
                {
                    name: 'Speed Demon',
                    description: 'Win a game in under 2 minutes',
                    category: 'special',
                    condition_type: 'fast_win',
                    condition_value: 120,
                    points: 100,
                    icon_url: '/achievements/speed_demon.png'
                },
                {
                    name: 'Marathon Master',
                    description: 'Win a game lasting over 30 minutes',
                    category: 'special',
                    condition_type: 'long_win',
                    condition_value: 1800,
                    points: 75,
                    icon_url: '/achievements/marathon.png'
                },
                {
                    name: 'Daily Player',
                    description: 'Play at least one game every day for 7 days',
                    category: 'special',
                    condition_type: 'daily_streak',
                    condition_value: 7,
                    points: 150,
                    icon_url: '/achievements/daily_7.png'
                },
                {
                    name: 'Perfect Week',
                    description: 'Win every game in a 7-day period (minimum 5 games)',
                    category: 'special',
                    condition_type: 'perfect_week',
                    condition_value: 5,
                    points: 300,
                    icon_url: '/achievements/perfect_week.png'
                },
                {
                    name: 'Comeback King',
                    description: 'Win 10 games after being behind in rating',
                    category: 'special',
                    condition_type: 'comeback_wins',
                    condition_value: 10,
                    points: 200,
                    icon_url: '/achievements/comeback.png'
                }
            ];

            for (const achievement of defaultAchievements) {
                await connection.execute(`
                    INSERT INTO achievements (
                        name, description, category, condition_type, 
                        condition_value, points, icon_url
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (name) DO NOTHING
                `, [
                    achievement.name,
                    achievement.description,
                    achievement.category,
                    achievement.condition_type,
                    achievement.condition_value,
                    achievement.points,
                    achievement.icon_url
                ]);
            }
        } finally {
            connection.release();
        }
    }

    /**
     * Check and award achievements for a player after a game
     * @param {number} userId - Player ID
     * @param {Object} gameData - Game completion data
     * @returns {Promise<Array>} Newly earned achievements
     */
    async checkAndAwardAchievements(userId, gameData) {
        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();

            // Get current player stats
            const [playerStats] = await connection.execute(
                'SELECT * FROM users WHERE id = $1',
                [userId]
            );

            if (playerStats.length === 0) {
                throw new Error('Player not found');
            }

            const stats = playerStats[0];
            const newlyEarned = [];

            // Get all achievements not yet earned by this player
            const [availableAchievements] = await connection.execute(`
                SELECT a.* FROM achievements a
                WHERE a.is_active = TRUE
                AND a.id NOT IN (
                    SELECT pa.achievement_id 
                    FROM player_achievements pa 
                    WHERE pa.user_id = $1
                )
            `, [userId]);

            for (const achievement of availableAchievements) {
                const earned = await this.checkAchievementCondition(
                    connection, 
                    achievement, 
                    stats, 
                    gameData,
                    userId
                );

                if (earned) {
                    await this.awardAchievement(connection, userId, achievement.id);
                    newlyEarned.push({
                        id: achievement.id,
                        name: achievement.name,
                        description: achievement.description,
                        category: achievement.category,
                        points: achievement.points,
                        icon_url: achievement.icon_url
                    });
                }
            }

            await connection.commit();
            return newlyEarned;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Check if a specific achievement condition is met
     * @param {Object} connection - Database connection
     * @param {Object} achievement - Achievement definition
     * @param {Object} stats - Current player stats
     * @param {Object} gameData - Recent game data
     * @param {number} userId - Player ID
     * @returns {Promise<boolean>} Whether achievement is earned
     */
    async checkAchievementCondition(connection, achievement, stats, gameData, userId) {
        switch (achievement.condition_type) {
            case 'total_wins':
                return stats.games_won >= achievement.condition_value;

            case 'win_streak':
                return stats.longest_win_streak >= achievement.condition_value;

            case 'games_played':
                return stats.games_played >= achievement.condition_value;

            case 'rating_reached':
                return stats.elo_rating >= achievement.condition_value;

            case 'fast_win':
                return gameData.isWin && 
                       gameData.gameDurationSeconds <= achievement.condition_value;

            case 'long_win':
                return gameData.isWin && 
                       gameData.gameDurationSeconds >= achievement.condition_value;

            case 'daily_streak':
                return await this.checkDailyStreak(connection, userId, achievement.condition_value);

            case 'perfect_week':
                return await this.checkPerfectWeek(connection, userId, achievement.condition_value);

            case 'comeback_wins':
                return await this.checkComebackWins(connection, userId, achievement.condition_value);

            default:
                return false;
        }
    }

    /**
     * Award an achievement to a player
     * @param {Object} connection - Database connection
     * @param {number} userId - Player ID
     * @param {number} achievementId - Achievement ID
     */
    async awardAchievement(connection, userId, achievementId) {
        await connection.execute(`
            INSERT INTO player_achievements (user_id, achievement_id, progress)
            VALUES ($1, $2, $3)
        `, [userId, achievementId, 100]); // 100% progress for completed achievement
    }

    /**
     * Check daily playing streak
     * @param {Object} connection - Database connection
     * @param {number} userId - Player ID
     * @param {number} requiredDays - Required consecutive days
     * @returns {Promise<boolean>} Whether streak is met
     */
    async checkDailyStreak(connection, userId, requiredDays) {
        const [streakData] = await connection.execute(`
            SELECT DATE(created_at) as game_date
            FROM game_statistics
            WHERE (player1_id = $1 OR player2_id = $2)
            AND created_at >= CURRENT_DATE - INTERVAL '$3 days'
            GROUP BY DATE(created_at)
            ORDER BY game_date DESC
        `, [userId, userId, requiredDays]);

        if (streakData.length < requiredDays) return false;

        // Check if dates are consecutive
        for (let i = 0; i < requiredDays - 1; i++) {
            const currentDate = new Date(streakData[i].game_date);
            const nextDate = new Date(streakData[i + 1].game_date);
            const dayDiff = Math.abs((currentDate - nextDate) / (1000 * 60 * 60 * 24));
            
            if (dayDiff !== 1) return false;
        }

        return true;
    }

    /**
     * Check perfect week achievement
     * @param {Object} connection - Database connection
     * @param {number} userId - Player ID
     * @param {number} minGames - Minimum games required
     * @returns {Promise<boolean>} Whether perfect week is achieved
     */
    async checkPerfectWeek(connection, userId, minGames) {
        const [weekData] = await connection.execute(`
            SELECT 
                COUNT(*) as total_games,
                SUM(CASE WHEN winner_id = $1 THEN 1 ELSE 0 END) as wins
            FROM game_statistics
            WHERE (player1_id = $2 OR player2_id = $3)
            AND created_at >= NOW() - INTERVAL '7 days'
        `, [userId, userId, userId]);

        const data = weekData[0];
        return data.total_games >= minGames && data.total_games === data.wins;
    }

    /**
     * Check comeback wins achievement
     * @param {Object} connection - Database connection
     * @param {number} userId - Player ID
     * @param {number} requiredWins - Required comeback wins
     * @returns {Promise<boolean>} Whether comeback achievement is met
     */
    async checkComebackWins(connection, userId, requiredWins) {
        const [comebackData] = await connection.execute(`
            SELECT COUNT(*) as comeback_wins
            FROM game_statistics gs
            WHERE gs.winner_id = $1
            AND (
                (gs.player1_id = $2 AND gs.player1_rating_before < gs.player2_rating_before)
                OR
                (gs.player2_id = $3 AND gs.player2_rating_before < gs.player1_rating_before)
            )
        `, [userId, userId, userId]);

        return comebackData[0].comeback_wins >= requiredWins;
    }

    /**
     * Get player's achievement progress
     * @param {number} userId - Player ID
     * @returns {Promise<Object>} Achievement progress data
     */
    async getPlayerAchievementProgress(userId) {
        const connection = await this.db.getConnection();
        
        try {
            // Get earned achievements
            const [earned] = await connection.execute(`
                SELECT 
                    a.id, a.name, a.description, a.category, a.points,
                    a.icon_url, pa.earned_at, pa.progress
                FROM achievements a
                JOIN player_achievements pa ON a.id = pa.achievement_id
                WHERE pa.user_id = $1
                ORDER BY pa.earned_at DESC
            `, [userId]);

            // Get available achievements with progress
            const [available] = await connection.execute(`
                SELECT 
                    a.id, a.name, a.description, a.category, a.condition_type,
                    a.condition_value, a.points, a.icon_url
                FROM achievements a
                WHERE a.is_active = TRUE
                AND a.id NOT IN (
                    SELECT pa.achievement_id 
                    FROM player_achievements pa 
                    WHERE pa.user_id = $1
                )
                ORDER BY a.category, a.condition_value
            `, [userId]);

            // Calculate progress for available achievements
            const [playerStats] = await connection.execute(
                'SELECT * FROM users WHERE id = $1',
                [userId]
            );

            const stats = playerStats[0];
            const availableWithProgress = await Promise.all(
                available.map(async (achievement) => {
                    const progress = await this.calculateAchievementProgress(
                        connection, 
                        achievement, 
                        stats, 
                        userId
                    );
                    
                    return {
                        ...achievement,
                        progress,
                        progressPercentage: Math.min(100, (progress / achievement.condition_value) * 100)
                    };
                })
            );

            // Calculate total achievement points
            const totalPoints = earned.reduce((sum, ach) => sum + ach.points, 0);
            const totalEarned = earned.length;
            const totalAvailable = earned.length + available.length;

            // Group achievements by category
            const earnedByCategory = this.groupAchievementsByCategory(earned);
            const availableByCategory = this.groupAchievementsByCategory(availableWithProgress);

            return {
                summary: {
                    totalPoints,
                    totalEarned,
                    totalAvailable,
                    completionPercentage: (totalEarned / totalAvailable) * 100
                },
                earned: {
                    all: earned,
                    byCategory: earnedByCategory
                },
                available: {
                    all: availableWithProgress,
                    byCategory: availableByCategory
                },
                categories: this.achievementCategories
            };
        } finally {
            connection.release();
        }
    }

    /**
     * Calculate progress towards an achievement
     * @param {Object} connection - Database connection
     * @param {Object} achievement - Achievement definition
     * @param {Object} stats - Player stats
     * @param {number} userId - Player ID
     * @returns {Promise<number>} Current progress value
     */
    async calculateAchievementProgress(connection, achievement, stats, userId) {
        switch (achievement.condition_type) {
            case 'total_wins':
                return stats.games_won;

            case 'win_streak':
                return stats.longest_win_streak;

            case 'games_played':
                return stats.games_played;

            case 'rating_reached':
                return stats.elo_rating;

            case 'daily_streak':
                // Count current daily streak
                const [dailyStreak] = await connection.execute(`
                    SELECT COUNT(DISTINCT DATE(created_at)) as streak_days
                    FROM game_statistics
                    WHERE (player1_id = $1 OR player2_id = $2)
                    AND created_at >= CURRENT_DATE - INTERVAL '30 days'
                `, [userId, userId]);
                return dailyStreak[0].streak_days;

            case 'comeback_wins':
                const [comebackWins] = await connection.execute(`
                    SELECT COUNT(*) as comeback_wins
                    FROM game_statistics gs
                    WHERE gs.winner_id = $1
                    AND (
                        (gs.player1_id = $2 AND gs.player1_rating_before < gs.player2_rating_before)
                        OR
                        (gs.player2_id = $3 AND gs.player2_rating_before < gs.player1_rating_before)
                    )
                `, [userId, userId, userId]);
                return comebackWins[0].comeback_wins;

            default:
                return 0;
        }
    }

    /**
     * Group achievements by category
     * @param {Array} achievements - Achievements array
     * @returns {Object} Achievements grouped by category
     */
    groupAchievementsByCategory(achievements) {
        return achievements.reduce((groups, achievement) => {
            const category = achievement.category;
            if (!groups[category]) {
                groups[category] = [];
            }
            groups[category].push(achievement);
            return groups;
        }, {});
    }

    /**
     * Get achievement leaderboard
     * @param {Object} options - {limit, category}
     * @returns {Promise<Array>} Achievement leaderboard
     */
    async getAchievementLeaderboard(options = {}) {
        const { limit = 50, category = null } = options;
        const connection = await this.db.getConnection();
        
        try {
            let categoryFilter = '';
            let queryParams = [limit];

            if (category) {
                categoryFilter = 'WHERE a.category = $1';
                queryParams = [category, limit];
            }

            const queryTemplate = category ? 
                `SELECT 
                    u.id, u.username,
                    COUNT(pa.achievement_id) as total_achievements,
                    SUM(a.points) as total_points,
                    MAX(pa.earned_at) as latest_achievement
                FROM users u
                JOIN player_achievements pa ON u.id = pa.user_id
                JOIN achievements a ON pa.achievement_id = a.id
                WHERE a.category = $1
                GROUP BY u.id, u.username
                ORDER BY total_points DESC, total_achievements DESC
                LIMIT $2` :
                `SELECT 
                    u.id, u.username,
                    COUNT(pa.achievement_id) as total_achievements,
                    SUM(a.points) as total_points,
                    MAX(pa.earned_at) as latest_achievement
                FROM users u
                JOIN player_achievements pa ON u.id = pa.user_id
                JOIN achievements a ON pa.achievement_id = a.id
                GROUP BY u.id, u.username
                ORDER BY total_points DESC, total_achievements DESC
                LIMIT $1`;

            const [leaderboard] = await connection.execute(queryTemplate, queryParams);

            return leaderboard.map((entry, index) => ({
                rank: index + 1,
                ...entry
            }));
        } finally {
            connection.release();
        }
    }
}

module.exports = AchievementService;