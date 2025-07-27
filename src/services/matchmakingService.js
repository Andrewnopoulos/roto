const db = require('../config/database');
const logger = require('../utils/logger');
const RatingService = require('./ratingService');

/**
 * Advanced matchmaking service with skill-based matching
 * Implements queue system with rating ranges and wait time optimization
 */
class MatchmakingService {
    static matchmakingQueue = new Map(); // userId -> queue entry
    static activeMatches = new Map(); // matchId -> match data
    static queueTimers = new Map(); // userId -> timeout reference

    // Matchmaking configuration
    static CONFIG = {
        INITIAL_RATING_RANGE: 100,      // Initial rating difference allowed
        MAX_RATING_RANGE: 400,          // Maximum rating difference
        RANGE_EXPANSION_INTERVAL: 30000, // Expand range every 30 seconds
        RANGE_EXPANSION_AMOUNT: 50,     // How much to expand range by
        MAX_QUEUE_TIME: 300000,         // Maximum time in queue (5 minutes)
        PREFERRED_QUEUE_TIME: 60000,    // Preferred max queue time (1 minute)
        MIN_GAMES_FOR_RANKED: 10        // Minimum games to enter ranked queue
    };

    /**
     * Add player to matchmaking queue
     * @param {string} userId 
     * @param {Object} preferences - Matchmaking preferences
     */
    static async joinQueue(userId, preferences = {}) {
        try {
            // Check if user is already in queue
            if (this.matchmakingQueue.has(userId)) {
                throw new Error('User already in matchmaking queue');
            }

            // Get player statistics for matchmaking
            const playerQuery = `
                SELECT u.id, u.username, us.rating, us.games_played, us.wins, us.losses
                FROM users u
                JOIN user_statistics us ON u.id = us.user_id
                WHERE u.id = $1 AND u.status = 'active'
            `;
            const playerResult = await db.query(playerQuery, [userId]);
            
            if (playerResult.rows.length === 0) {
                throw new Error('Player not found or account inactive');
            }

            const player = playerResult.rows[0];

            // Validate if player can join ranked queue
            if (preferences.ranked && player.games_played < this.CONFIG.MIN_GAMES_FOR_RANKED) {
                throw new Error(`Need at least ${this.CONFIG.MIN_GAMES_FOR_RANKED} games to join ranked queue`);
            }

            // Create queue entry
            const queueEntry = {
                userId: userId,
                username: player.username,
                rating: player.rating,
                gamesPlayed: player.games_played,
                joinedAt: new Date(),
                preferences: {
                    ranked: preferences.ranked || false,
                    gameMode: preferences.gameMode || 'standard',
                    allowSpectators: preferences.allowSpectators !== false
                },
                ratingRange: this.CONFIG.INITIAL_RATING_RANGE,
                searchAttempts: 0
            };

            this.matchmakingQueue.set(userId, queueEntry);

            // Start matchmaking timer
            this.startMatchmakingTimer(userId);

            // Immediately try to find a match
            await this.attemptMatch(userId);

            logger.info('Player joined matchmaking queue', {
                userId,
                rating: player.rating,
                ranked: preferences.ranked
            });

            return queueEntry;

        } catch (error) {
            logger.error('Failed to join matchmaking queue', {
                userId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Remove player from matchmaking queue
     * @param {string} userId 
     */
    static async leaveQueue(userId) {
        const queueEntry = this.matchmakingQueue.get(userId);
        
        if (!queueEntry) {
            return false;
        }

        // Clear timer
        if (this.queueTimers.has(userId)) {
            clearTimeout(this.queueTimers.get(userId));
            this.queueTimers.delete(userId);
        }

        // Remove from queue
        this.matchmakingQueue.delete(userId);

        logger.info('Player left matchmaking queue', {
            userId,
            queueTime: Date.now() - queueEntry.joinedAt.getTime()
        });

        return true;
    }

    /**
     * Start matchmaking timer for a player
     * @param {string} userId 
     */
    static startMatchmakingTimer(userId) {
        const timer = setTimeout(() => {
            this.expandSearchCriteria(userId);
        }, this.CONFIG.RANGE_EXPANSION_INTERVAL);

        this.queueTimers.set(userId, timer);
    }

    /**
     * Expand search criteria for a player
     * @param {string} userId 
     */
    static async expandSearchCriteria(userId) {
        const queueEntry = this.matchmakingQueue.get(userId);
        
        if (!queueEntry) {
            return;
        }

        // Expand rating range
        queueEntry.ratingRange = Math.min(
            queueEntry.ratingRange + this.CONFIG.RANGE_EXPANSION_AMOUNT,
            this.CONFIG.MAX_RATING_RANGE
        );

        queueEntry.searchAttempts++;

        logger.info('Expanding matchmaking criteria', {
            userId,
            newRatingRange: queueEntry.ratingRange,
            searchAttempts: queueEntry.searchAttempts
        });

        // Try to find match again with expanded criteria
        await this.attemptMatch(userId);

        // Check if max queue time reached
        const queueTime = Date.now() - queueEntry.joinedAt.getTime();
        if (queueTime >= this.CONFIG.MAX_QUEUE_TIME) {
            logger.warn('Player reached maximum queue time', { userId, queueTime });
            await this.leaveQueue(userId);
            // Could implement bot match or notification here
            return;
        }

        // Set next expansion timer
        this.startMatchmakingTimer(userId);
    }

    /**
     * Attempt to find a match for a player
     * @param {string} userId 
     */
    static async attemptMatch(userId) {
        const player = this.matchmakingQueue.get(userId);
        
        if (!player) {
            return null;
        }

        // Find suitable opponents
        const opponents = this.findSuitableOpponents(player);

        if (opponents.length === 0) {
            return null;
        }

        // Select best opponent using matchmaking algorithm
        const opponent = this.selectBestOpponent(player, opponents);

        if (opponent) {
            return await this.createMatch(player, opponent);
        }

        return null;
    }

    /**
     * Find suitable opponents for a player
     * @param {Object} player 
     * @returns {Array} Array of suitable opponents
     */
    static findSuitableOpponents(player) {
        const opponents = [];

        for (const [opponentId, opponent] of this.matchmakingQueue.entries()) {
            // Skip self
            if (opponentId === player.userId) {
                continue;
            }

            // Check if preferences match
            if (player.preferences.ranked !== opponent.preferences.ranked) {
                continue;
            }

            if (player.preferences.gameMode !== opponent.preferences.gameMode) {
                continue;
            }

            // Check rating compatibility
            const ratingDiff = Math.abs(player.rating - opponent.rating);
            const maxRange = Math.max(player.ratingRange, opponent.ratingRange);

            if (ratingDiff <= maxRange) {
                opponents.push(opponent);
            }
        }

        return opponents;
    }

    /**
     * Select the best opponent using matchmaking algorithm
     * @param {Object} player 
     * @param {Array} opponents 
     * @returns {Object|null} Best opponent or null
     */
    static selectBestOpponent(player, opponents) {
        if (opponents.length === 0) {
            return null;
        }

        // Score opponents based on multiple factors
        const scoredOpponents = opponents.map(opponent => {
            const ratingDiff = Math.abs(player.rating - opponent.rating);
            const queueTime = Date.now() - opponent.joinedAt.getTime();
            
            // Lower rating difference is better (higher score)
            const ratingScore = 1000 - ratingDiff;
            
            // Longer queue time is better (prioritize waiting players)
            const queueScore = queueTime / 1000;
            
            // Experience similarity (similar games played)
            const experienceDiff = Math.abs(player.gamesPlayed - opponent.gamesPlayed);
            const experienceScore = 1000 - experienceDiff;

            // Combined score
            const totalScore = ratingScore + queueScore * 0.5 + experienceScore * 0.3;

            return {
                ...opponent,
                matchScore: totalScore,
                ratingDiff,
                queueTime
            };
        });

        // Sort by score (highest first) and return best match
        scoredOpponents.sort((a, b) => b.matchScore - a.matchScore);
        
        return scoredOpponents[0];
    }

    /**
     * Create a match between two players
     * @param {Object} player1 
     * @param {Object} player2 
     */
    static async createMatch(player1, player2) {
        const client = await db.getClient();
        
        try {
            await client.query('BEGIN');

            // Create game record
            const gameResult = await client.query(`
                INSERT INTO games (
                    id, status, game_mode, is_ranked, max_spectators,
                    created_at, updated_at
                ) VALUES (
                    gen_random_uuid(), 'waiting_for_players', $1, $2, $3,
                    NOW(), NOW()
                ) RETURNING id
            `, [
                player1.preferences.gameMode,
                player1.preferences.ranked,
                player1.preferences.allowSpectators ? 10 : 0
            ]);

            const gameId = gameResult.rows[0].id;

            // Add players to game
            await client.query(`
                INSERT INTO game_participants (
                    game_id, user_id, position, joined_at
                ) VALUES 
                ($1, $2, 1, NOW()),
                ($1, $3, 2, NOW())
            `, [gameId, player1.userId, player2.userId]);

            await client.query('COMMIT');

            // Remove both players from queue
            this.leaveQueue(player1.userId);
            this.leaveQueue(player2.userId);

            // Create match data
            const matchData = {
                gameId: gameId,
                players: [
                    {
                        userId: player1.userId,
                        username: player1.username,
                        rating: player1.rating,
                        position: 1
                    },
                    {
                        userId: player2.userId,
                        username: player2.username,
                        rating: player2.rating,
                        position: 2
                    }
                ],
                gameMode: player1.preferences.gameMode,
                isRanked: player1.preferences.ranked,
                createdAt: new Date(),
                expectedDuration: this.estimateGameDuration(player1, player2)
            };

            this.activeMatches.set(gameId, matchData);

            logger.info('Match created successfully', {
                gameId,
                player1: { userId: player1.userId, rating: player1.rating },
                player2: { userId: player2.userId, rating: player2.rating },
                ratingDiff: Math.abs(player1.rating - player2.rating),
                isRanked: player1.preferences.ranked
            });

            return matchData;

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to create match', {
                player1: player1.userId,
                player2: player2.userId,
                error: error.message
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Estimate game duration based on player stats
     * @param {Object} player1 
     * @param {Object} player2 
     * @returns {number} Estimated duration in seconds
     */
    static estimateGameDuration(player1, player2) {
        // Base estimate: 5-15 minutes based on skill level
        const avgRating = (player1.rating + player2.rating) / 2;
        const skillFactor = Math.max(0.5, Math.min(2, avgRating / 1200));
        
        // Higher skilled players tend to play faster
        const baseDuration = 600; // 10 minutes
        return Math.round(baseDuration / skillFactor);
    }

    /**
     * Get current queue status
     */
    static getQueueStatus() {
        const queueData = Array.from(this.matchmakingQueue.values()).map(entry => ({
            userId: entry.userId,
            rating: entry.rating,
            queueTime: Date.now() - entry.joinedAt.getTime(),
            preferences: entry.preferences,
            ratingRange: entry.ratingRange
        }));

        return {
            totalInQueue: queueData.length,
            rankedQueue: queueData.filter(p => p.preferences.ranked).length,
            casualQueue: queueData.filter(p => !p.preferences.ranked).length,
            averageQueueTime: queueData.length > 0 
                ? queueData.reduce((sum, p) => sum + p.queueTime, 0) / queueData.length 
                : 0,
            queueData: queueData
        };
    }

    /**
     * Get player's current queue status
     * @param {string} userId 
     */
    static getPlayerQueueStatus(userId) {
        const queueEntry = this.matchmakingQueue.get(userId);
        
        if (!queueEntry) {
            return null;
        }

        return {
            inQueue: true,
            queueTime: Date.now() - queueEntry.joinedAt.getTime(),
            estimatedWaitTime: this.estimateWaitTime(queueEntry),
            preferences: queueEntry.preferences,
            ratingRange: queueEntry.ratingRange,
            searchAttempts: queueEntry.searchAttempts
        };
    }

    /**
     * Estimate wait time for a player
     * @param {Object} queueEntry 
     * @returns {number} Estimated wait time in milliseconds
     */
    static estimateWaitTime(queueEntry) {
        const compatiblePlayers = this.findSuitableOpponents(queueEntry).length;
        
        if (compatiblePlayers > 0) {
            return 0; // Match should be found immediately
        }

        // Estimate based on current queue and historical data
        const baseWaitTime = 60000; // 1 minute base
        const queueSize = this.matchmakingQueue.size;
        
        // More players = shorter wait time
        const queueFactor = Math.max(0.5, 2 - (queueSize / 10));
        
        return baseWaitTime * queueFactor;
    }

    /**
     * Clean up expired matches and inactive queue entries
     */
    static async cleanupExpiredEntries() {
        const now = Date.now();
        
        // Remove players who have been in queue too long
        for (const [userId, entry] of this.matchmakingQueue.entries()) {
            const queueTime = now - entry.joinedAt.getTime();
            if (queueTime > this.CONFIG.MAX_QUEUE_TIME) {
                await this.leaveQueue(userId);
            }
        }

        // Clean up old match data
        for (const [gameId, matchData] of this.activeMatches.entries()) {
            const matchAge = now - matchData.createdAt.getTime();
            if (matchAge > 3600000) { // 1 hour
                this.activeMatches.delete(gameId);
            }
        }

        logger.debug('Matchmaking cleanup completed', {
            queueSize: this.matchmakingQueue.size,
            activeMatches: this.activeMatches.size
        });
    }
}

// Start cleanup interval
setInterval(() => {
    MatchmakingService.cleanupExpiredEntries();
}, 60000); // Run every minute

module.exports = MatchmakingService;