/**
 * Player Controller
 * Handles API endpoints for player profiles, statistics, and preferences
 */

const PlayerProfileService = require('../services/PlayerProfileService');
const StatisticsService = require('../services/StatisticsService');
const AchievementService = require('../services/AchievementService');
const { validateRequest, authenticateUser } = require('../middleware/validation');

class PlayerController {
    constructor() {
        this.playerProfileService = new PlayerProfileService();
        this.statisticsService = new StatisticsService();
        this.achievementService = new AchievementService();
    }

    /**
     * Get player profile
     * GET /api/players/:userId/profile
     */
    async getProfile(req, res) {
        try {
            const { userId } = req.params;
            const viewerId = req.user?.id || null;

            // Validate user ID
            if (!userId || isNaN(parseInt(userId))) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }

            const profile = await this.playerProfileService.getPlayerProfile(
                parseInt(userId), 
                viewerId
            );

            res.json({
                success: true,
                data: profile
            });

        } catch (error) {
            console.error('Error fetching player profile:', error);
            
            if (error.message === 'Player not found') {
                return res.status(404).json({
                    success: false,
                    error: 'Player not found'
                });
            }

            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Update player profile
     * PUT /api/players/profile
     */
    async updateProfile(req, res) {
        try {
            const userId = req.user.id;
            const profileData = req.body;

            // Validate required authentication
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }

            // Validate profile data
            const allowedFields = ['username', 'email'];
            const filteredData = {};
            
            for (const field of allowedFields) {
                if (profileData[field] !== undefined) {
                    filteredData[field] = profileData[field];
                }
            }

            if (Object.keys(filteredData).length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No valid fields provided for update'
                });
            }

            const updatedProfile = await this.playerProfileService.updatePlayerProfile(
                userId, 
                filteredData
            );

            res.json({
                success: true,
                data: updatedProfile,
                message: 'Profile updated successfully'
            });

        } catch (error) {
            console.error('Error updating player profile:', error);
            
            if (error.message.includes('Username') || error.message.includes('Email')) {
                return res.status(400).json({
                    success: false,
                    error: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get player preferences
     * GET /api/players/preferences
     */
    async getPreferences(req, res) {
        try {
            const userId = req.user.id;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }

            const preferences = await this.playerProfileService.getPlayerPreferences(userId);

            res.json({
                success: true,
                data: preferences
            });

        } catch (error) {
            console.error('Error fetching player preferences:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Update player preferences
     * PUT /api/players/preferences
     */
    async updatePreferences(req, res) {
        try {
            const userId = req.user.id;
            const preferences = req.body;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }

            // Validate preferences data
            const allowedPreferences = [
                'preferredGameType', 'autoAcceptChallenges', 'showRating',
                'showStatistics', 'notificationPreferences', 'themePreference',
                'boardStyle', 'moveConfirmation', 'showMoveHints', 'privacyLevel'
            ];

            const filteredPreferences = {};
            for (const pref of allowedPreferences) {
                if (preferences[pref] !== undefined) {
                    filteredPreferences[pref] = preferences[pref];
                }
            }

            if (Object.keys(filteredPreferences).length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No valid preferences provided for update'
                });
            }

            const updatedPreferences = await this.playerProfileService.updatePlayerPreferences(
                userId, 
                filteredPreferences
            );

            res.json({
                success: true,
                data: updatedPreferences,
                message: 'Preferences updated successfully'
            });

        } catch (error) {
            console.error('Error updating player preferences:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get detailed player statistics
     * GET /api/players/:userId/statistics
     */
    async getStatistics(req, res) {
        try {
            const { userId } = req.params;
            const viewerId = req.user?.id || null;

            if (!userId || isNaN(parseInt(userId))) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }

            // Get basic profile first to check privacy settings
            const profile = await this.playerProfileService.getPlayerProfile(
                parseInt(userId), 
                viewerId
            );

            if (!profile.privacy.canViewStatistics) {
                return res.status(403).json({
                    success: false,
                    error: 'Statistics are private'
                });
            }

            const statistics = await this.statisticsService.getPlayerStatistics(parseInt(userId));

            res.json({
                success: true,
                data: statistics
            });

        } catch (error) {
            console.error('Error fetching player statistics:', error);
            
            if (error.message === 'Player not found') {
                return res.status(404).json({
                    success: false,
                    error: 'Player not found'
                });
            }

            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get player achievements
     * GET /api/players/:userId/achievements
     */
    async getAchievements(req, res) {
        try {
            const { userId } = req.params;
            const viewerId = req.user?.id || null;

            if (!userId || isNaN(parseInt(userId))) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }

            // Check if viewer can see achievements
            const profile = await this.playerProfileService.getPlayerProfile(
                parseInt(userId), 
                viewerId
            );

            const achievements = await this.achievementService.getPlayerAchievementProgress(
                parseInt(userId)
            );

            // Filter achievements based on privacy if not viewing own profile
            if (parseInt(userId) !== viewerId && profile.privacy.level !== 'public') {
                // Only show major achievements for private profiles
                achievements.earned.all = achievements.earned.all.filter(a => a.points >= 100);
                achievements.available = null; // Don't show progress to others
            }

            res.json({
                success: true,
                data: achievements
            });

        } catch (error) {
            console.error('Error fetching player achievements:', error);
            
            if (error.message === 'Player not found') {
                return res.status(404).json({
                    success: false,
                    error: 'Player not found'
                });
            }

            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Search players
     * GET /api/players/search?q=username&limit=10
     */
    async searchPlayers(req, res) {
        try {
            const { q: query, limit = 10 } = req.query;

            if (!query || query.trim().length < 2) {
                return res.status(400).json({
                    success: false,
                    error: 'Search query must be at least 2 characters long'
                });
            }

            const searchLimit = Math.min(parseInt(limit) || 10, 50); // Cap at 50 results
            
            const results = await this.playerProfileService.searchPlayers(
                query.trim(), 
                searchLimit
            );

            res.json({
                success: true,
                data: {
                    query: query.trim(),
                    results,
                    count: results.length
                }
            });

        } catch (error) {
            console.error('Error searching players:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get leaderboard
     * GET /api/players/leaderboard?page=1&limit=50&timeframe=all&category=all
     */
    async getLeaderboard(req, res) {
        try {
            const {
                page = 1,
                limit = 50,
                timeframe = 'all',
                category = 'all'
            } = req.query;

            // Validate parameters
            const pageNum = Math.max(1, parseInt(page) || 1);
            const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
            
            const validTimeframes = ['all', 'week', 'month'];
            const validatedTimeframe = validTimeframes.includes(timeframe) ? timeframe : 'all';

            const leaderboard = await this.statisticsService.getLeaderboard({
                page: pageNum,
                limit: limitNum,
                timeframe: validatedTimeframe,
                category: category !== 'all' ? category : null
            });

            res.json({
                success: true,
                data: leaderboard
            });

        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get achievement leaderboard
     * GET /api/players/achievements/leaderboard?limit=50&category=wins
     */
    async getAchievementLeaderboard(req, res) {
        try {
            const {
                limit = 50,
                category = null
            } = req.query;

            const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
            
            const leaderboard = await this.achievementService.getAchievementLeaderboard({
                limit: limitNum,
                category: category || null
            });

            res.json({
                success: true,
                data: {
                    leaderboard,
                    category: category || 'all',
                    count: leaderboard.length
                }
            });

        } catch (error) {
            console.error('Error fetching achievement leaderboard:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get player's game history
     * GET /api/players/:userId/games?page=1&limit=20
     */
    async getGameHistory(req, res) {
        try {
            const { userId } = req.params;
            const { page = 1, limit = 20 } = req.query;
            const viewerId = req.user?.id || null;

            if (!userId || isNaN(parseInt(userId))) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }

            // Check if viewer can see game history
            const profile = await this.playerProfileService.getPlayerProfile(
                parseInt(userId), 
                viewerId
            );

            if (!profile.privacy.canViewHistory) {
                return res.status(403).json({
                    success: false,
                    error: 'Game history is private'
                });
            }

            const pageNum = Math.max(1, parseInt(page) || 1);
            const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));

            // Get game history from statistics service
            const statistics = await this.statisticsService.getPlayerStatistics(parseInt(userId));
            
            res.json({
                success: true,
                data: {
                    games: statistics.recentGames || [],
                    pagination: {
                        page: pageNum,
                        limit: limitNum,
                        // Note: This is simplified - ideally we'd have separate pagination
                        total: statistics.basicStats.games_played,
                        hasNext: false,
                        hasPrev: false
                    }
                }
            });

        } catch (error) {
            console.error('Error fetching game history:', error);
            
            if (error.message === 'Player not found') {
                return res.status(404).json({
                    success: false,
                    error: 'Player not found'
                });
            }

            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
}

module.exports = PlayerController;