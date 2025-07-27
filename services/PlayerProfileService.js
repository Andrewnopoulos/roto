/**
 * Player Profile Management Service
 * Handles comprehensive player profiles, preferences, and profile analytics
 */

const DatabaseService = require('./DatabaseService');
const StatisticsService = require('./StatisticsService');
const RatingService = require('./RatingService');

class PlayerProfileService {
    constructor() {
        this.db = new DatabaseService();
        this.statisticsService = new StatisticsService();
        this.ratingService = new RatingService();
    }

    /**
     * Get comprehensive player profile
     * @param {number} userId - Player ID
     * @param {number} viewerId - ID of user viewing the profile (for privacy)
     * @returns {Promise<Object>} Complete player profile
     */
    async getPlayerProfile(userId, viewerId = null) {
        const connection = await this.db.getConnection();
        
        try {
            // Get basic player information
            const [playerData] = await connection.execute(`
                SELECT u.*, pp.privacy_level, pp.show_rating, pp.show_statistics
                FROM users u
                LEFT JOIN player_preferences pp ON u.id = pp.user_id
                WHERE u.id = ?
            `, [userId]);

            if (playerData.length === 0) {
                throw new Error('Player not found');
            }

            const player = playerData[0];
            const canViewPrivateData = this.canViewPrivateData(player, viewerId);

            // Get player preferences
            const preferences = await this.getPlayerPreferences(userId);

            // Get statistics (if allowed by privacy settings)
            let statistics = null;
            if (canViewPrivateData && (player.show_statistics !== false)) {
                statistics = await this.statisticsService.getPlayerStatistics(userId);
            }

            // Get rating information
            let ratingInfo = null;
            if (canViewPrivateData && (player.show_rating !== false)) {
                ratingInfo = {
                    current: player.elo_rating,
                    category: this.ratingService.getRatingCategory(player.elo_rating),
                    confidence: this.ratingService.calculateRatingConfidence(
                        player.elo_rating, 
                        player.games_played
                    ),
                    percentile: player.ranking_percentile
                };
            }

            // Get recent activity summary
            const recentActivity = await this.getRecentActivity(connection, userId, canViewPrivateData);

            // Get achievements (public achievements or all if can view private)
            const achievements = await this.getPlayerAchievements(connection, userId, canViewPrivateData);

            // Get game history (limited based on privacy)
            const gameHistory = canViewPrivateData ? 
                await this.getGameHistory(connection, userId, 1, 10) : null;

            // Calculate profile completion
            const profileCompletion = this.calculateProfileCompletion(player, preferences);

            return {
                basicInfo: {
                    id: player.id,
                    username: player.username,
                    email: canViewPrivateData ? player.email : null,
                    createdAt: player.created_at,
                    lastActive: player.last_game_played,
                    profileCompletion
                },
                ratingInfo,
                statistics: statistics ? {
                    basic: statistics.basicStats,
                    recent: statistics.recentGames?.slice(0, 5), // Limit recent games
                    trends: statistics.performanceTrend
                } : null,
                achievements,
                recentActivity,
                gameHistory,
                preferences: canViewPrivateData ? preferences : null,
                privacy: {
                    level: player.privacy_level || 'public',
                    canViewRating: Boolean(ratingInfo),
                    canViewStatistics: Boolean(statistics),
                    canViewHistory: Boolean(gameHistory)
                }
            };
        } finally {
            connection.release();
        }
    }

    /**
     * Update player profile information
     * @param {number} userId - Player ID
     * @param {Object} profileData - Profile data to update
     * @returns {Promise<Object>} Updated profile
     */
    async updatePlayerProfile(userId, profileData) {
        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();

            const allowedFields = ['username', 'email'];
            const updateFields = [];
            const updateValues = [];

            // Validate and prepare update fields
            for (const field of allowedFields) {
                if (profileData[field] !== undefined) {
                    if (field === 'username') {
                        await this.validateUsername(connection, profileData[field], userId);
                    }
                    if (field === 'email') {
                        await this.validateEmail(connection, profileData[field], userId);
                    }
                    updateFields.push(`${field} = ?`);
                    updateValues.push(profileData[field]);
                }
            }

            if (updateFields.length > 0) {
                updateValues.push(userId);
                const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
                await connection.execute(query, updateValues);
            }

            await connection.commit();
            return await this.getPlayerProfile(userId, userId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Get or create player preferences
     * @param {number} userId - Player ID
     * @returns {Promise<Object>} Player preferences
     */
    async getPlayerPreferences(userId) {
        const connection = await this.db.getConnection();
        
        try {
            const [preferences] = await connection.execute(
                'SELECT * FROM player_preferences WHERE user_id = ?',
                [userId]
            );

            if (preferences.length === 0) {
                // Create default preferences
                await connection.execute(`
                    INSERT INTO player_preferences (user_id) VALUES (?)
                `, [userId]);

                // Return default preferences
                return {
                    userId,
                    preferredGameType: 'standard',
                    autoAcceptChallenges: false,
                    showRating: true,
                    showStatistics: true,
                    notificationPreferences: {},
                    themePreference: 'default',
                    boardStyle: 'classic',
                    moveConfirmation: true,
                    showMoveHints: false,
                    privacyLevel: 'public'
                };
            }

            const prefs = preferences[0];
            return {
                userId: prefs.user_id,
                preferredGameType: prefs.preferred_game_type,
                autoAcceptChallenges: prefs.auto_accept_challenges,
                showRating: prefs.show_rating,
                showStatistics: prefs.show_statistics,
                notificationPreferences: prefs.notification_preferences || {},
                themePreference: prefs.theme_preference,
                boardStyle: prefs.board_style,
                moveConfirmation: prefs.move_confirmation,
                showMoveHints: prefs.show_move_hints,
                privacyLevel: prefs.privacy_level,
                updatedAt: prefs.updated_at
            };
        } finally {
            connection.release();
        }
    }

    /**
     * Update player preferences
     * @param {number} userId - Player ID
     * @param {Object} newPreferences - New preferences
     * @returns {Promise<Object>} Updated preferences
     */
    async updatePlayerPreferences(userId, newPreferences) {
        const connection = await this.db.getConnection();
        
        try {
            const allowedFields = [
                'preferred_game_type', 'auto_accept_challenges', 'show_rating',
                'show_statistics', 'notification_preferences', 'theme_preference',
                'board_style', 'move_confirmation', 'show_move_hints', 'privacy_level'
            ];

            const updateFields = [];
            const updateValues = [];

            for (const [key, value] of Object.entries(newPreferences)) {
                const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
                if (allowedFields.includes(dbField)) {
                    updateFields.push(`${dbField} = ?`);
                    updateValues.push(
                        dbField === 'notification_preferences' ? JSON.stringify(value) : value
                    );
                }
            }

            if (updateFields.length > 0) {
                updateFields.push('updated_at = CURRENT_TIMESTAMP');
                updateValues.push(userId);

                const query = `
                    UPDATE player_preferences 
                    SET ${updateFields.join(', ')} 
                    WHERE user_id = ?
                `;

                await connection.execute(query, updateValues);
            }

            return await this.getPlayerPreferences(userId);
        } finally {
            connection.release();
        }
    }

    /**
     * Get recent player activity
     * @param {Object} connection - Database connection
     * @param {number} userId - Player ID
     * @param {boolean} canViewPrivate - Whether private data can be viewed
     * @returns {Promise<Object>} Recent activity data
     */
    async getRecentActivity(connection, userId, canViewPrivate) {
        if (!canViewPrivate) return null;

        const [activity] = await connection.execute(`
            SELECT 
                COUNT(*) as games_last_7_days,
                SUM(CASE WHEN gs.winner_id = ? THEN 1 ELSE 0 END) as wins_last_7_days,
                AVG(gs.game_duration_seconds) as avg_game_duration_last_7_days,
                MAX(gs.created_at) as last_game_time
            FROM game_statistics gs
            WHERE (gs.player1_id = ? OR gs.player2_id = ?)
            AND gs.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        `, [userId, userId, userId]);

        const [ratingTrend] = await connection.execute(`
            SELECT 
                old_rating, new_rating, created_at
            FROM rating_history
            WHERE user_id = ?
            AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            ORDER BY created_at ASC
        `, [userId]);

        return {
            gamesLast7Days: activity[0].games_last_7_days || 0,
            winsLast7Days: activity[0].wins_last_7_days || 0,
            avgGameDurationLast7Days: Math.round(activity[0].avg_game_duration_last_7_days || 0),
            lastGameTime: activity[0].last_game_time,
            ratingTrend: ratingTrend.map(r => ({
                rating: r.new_rating,
                timestamp: r.created_at
            }))
        };
    }

    /**
     * Get player achievements
     * @param {Object} connection - Database connection
     * @param {number} userId - Player ID
     * @param {boolean} canViewPrivate - Whether private data can be viewed
     * @returns {Promise<Array>} Player achievements
     */
    async getPlayerAchievements(connection, userId, canViewPrivate) {
        const [achievements] = await connection.execute(`
            SELECT 
                a.id, a.name, a.description, a.category, a.points,
                a.icon_url, pa.earned_at, pa.progress
            FROM achievements a
            JOIN player_achievements pa ON a.id = pa.achievement_id
            WHERE pa.user_id = ?
            ORDER BY pa.earned_at DESC
        `, [userId]);

        // If viewing someone else's profile, only show major achievements
        if (!canViewPrivate) {
            return achievements.filter(a => a.points >= 100);
        }

        return achievements;
    }

    /**
     * Get game history with pagination
     * @param {Object} connection - Database connection
     * @param {number} userId - Player ID
     * @param {number} page - Page number
     * @param {number} limit - Items per page
     * @returns {Promise<Object>} Game history with pagination
     */
    async getGameHistory(connection, userId, page = 1, limit = 20) {
        const offset = (page - 1) * limit;

        const [games] = await connection.execute(`
            SELECT 
                gs.*, 
                u1.username as player1_username,
                u2.username as player2_username,
                CASE 
                    WHEN gs.player1_id = ? THEN 'player1'
                    ELSE 'player2'
                END as player_role,
                CASE 
                    WHEN gs.winner_id = ? THEN 'win'
                    WHEN gs.winner_id IS NULL THEN 'draw'
                    ELSE 'loss'
                END as result,
                CASE 
                    WHEN gs.player1_id = ? THEN gs.player1_rating_change
                    ELSE gs.player2_rating_change
                END as rating_change
            FROM game_statistics gs
            JOIN users u1 ON gs.player1_id = u1.id
            JOIN users u2 ON gs.player2_id = u2.id
            WHERE gs.player1_id = ? OR gs.player2_id = ?
            ORDER BY gs.created_at DESC
            LIMIT ? OFFSET ?
        `, [userId, userId, userId, userId, userId, limit, offset]);

        const [countResult] = await connection.execute(`
            SELECT COUNT(*) as total
            FROM game_statistics gs
            WHERE gs.player1_id = ? OR gs.player2_id = ?
        `, [userId, userId]);

        const total = countResult[0].total;

        return {
            games,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1
            }
        };
    }

    /**
     * Search players by username
     * @param {string} query - Search query
     * @param {number} limit - Maximum results
     * @returns {Promise<Array>} Search results
     */
    async searchPlayers(query, limit = 10) {
        const connection = await this.db.getConnection();
        
        try {
            const [results] = await connection.execute(`
                SELECT 
                    u.id, u.username, u.elo_rating, u.games_played,
                    u.ranking_percentile, pp.privacy_level,
                    ROUND(u.games_won / GREATEST(u.games_played, 1) * 100, 1) as win_rate
                FROM users u
                LEFT JOIN player_preferences pp ON u.id = pp.user_id
                WHERE u.username LIKE ? 
                AND u.games_played > 0
                AND (pp.privacy_level IS NULL OR pp.privacy_level != 'private')
                ORDER BY u.elo_rating DESC
                LIMIT ?
            `, [`%${query}%`, limit]);

            return results.map(player => ({
                id: player.id,
                username: player.username,
                rating: player.elo_rating,
                gamesPlayed: player.games_played,
                winRate: parseFloat(player.win_rate),
                percentile: player.ranking_percentile,
                ratingCategory: this.ratingService.getRatingCategory(player.elo_rating)
            }));
        } finally {
            connection.release();
        }
    }

    /**
     * Calculate profile completion percentage
     * @param {Object} player - Player data
     * @param {Object} preferences - Player preferences
     * @returns {number} Completion percentage
     */
    calculateProfileCompletion(player, preferences) {
        let completion = 0;
        const totalFields = 8;

        // Basic required fields
        if (player.username) completion++;
        if (player.email) completion++;

        // Game activity
        if (player.games_played > 0) completion++;
        if (player.games_played >= 10) completion++; // Established player

        // Preferences set
        if (preferences.themePreference && preferences.themePreference !== 'default') completion++;
        if (preferences.boardStyle && preferences.boardStyle !== 'classic') completion++;
        if (preferences.preferredGameType) completion++;
        if (Object.keys(preferences.notificationPreferences || {}).length > 0) completion++;

        return Math.round((completion / totalFields) * 100);
    }

    /**
     * Check if viewer can see private data
     * @param {Object} player - Player data
     * @param {number} viewerId - Viewer ID
     * @returns {boolean} Can view private data
     */
    canViewPrivateData(player, viewerId) {
        // Player viewing own profile
        if (player.id === viewerId) return true;

        // Public profile
        if (!player.privacy_level || player.privacy_level === 'public') return true;

        // Private profile - only the player can view
        if (player.privacy_level === 'private') return false;

        // Friends level - would need friends system implementation
        return false;
    }

    /**
     * Validate username availability and format
     * @param {Object} connection - Database connection
     * @param {string} username - Username to validate
     * @param {number} excludeUserId - User ID to exclude from check
     */
    async validateUsername(connection, username, excludeUserId = null) {
        // Check format
        if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
            throw new Error('Username must be 3-20 characters long and contain only letters, numbers, underscores, and hyphens');
        }

        // Check availability
        const [existing] = await connection.execute(
            'SELECT id FROM users WHERE username = ? AND id != ?',
            [username, excludeUserId || 0]
        );

        if (existing.length > 0) {
            throw new Error('Username is already taken');
        }
    }

    /**
     * Validate email format and availability
     * @param {Object} connection - Database connection
     * @param {string} email - Email to validate
     * @param {number} excludeUserId - User ID to exclude from check
     */
    async validateEmail(connection, email, excludeUserId = null) {
        // Basic email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Invalid email format');
        }

        // Check availability
        const [existing] = await connection.execute(
            'SELECT id FROM users WHERE email = ? AND id != ?',
            [email, excludeUserId || 0]
        );

        if (existing.length > 0) {
            throw new Error('Email is already registered');
        }
    }
}

module.exports = PlayerProfileService;