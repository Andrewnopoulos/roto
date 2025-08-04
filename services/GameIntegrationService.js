/**
 * Game Integration Service
 * Coordinates between game completion and rating/statistics updates
 */

const RatingService = require('./RatingService');
const StatisticsService = require('./StatisticsService');
const AchievementService = require('./AchievementService');
const DatabaseService = require('./DatabaseService');

class GameIntegrationService {
    constructor() {
        this.ratingService = new RatingService();
        this.statisticsService = new StatisticsService();
        this.achievementService = new AchievementService();
        this.db = new DatabaseService();
    }

    /**
     * Process game completion - update ratings, statistics, and achievements
     * @param {Object} gameResult - Complete game result data
     * @returns {Promise<Object>} Processing results
     */
    async processGameCompletion(gameResult) {
        const {
            gameId,
            player1Id,
            player2Id,
            winnerId,
            gameType = 'standard',
            gameDurationSeconds,
            moveHistory,
            gameStartTime,
            gameEndTime
        } = gameResult;

        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();

            // Get current player data
            const [players] = await connection.execute(`
                SELECT id, elo_rating, games_played 
                FROM users 
                WHERE id IN ($1, $2)
            `, [player1Id, player2Id]);

            if (players.length !== 2) {
                throw new Error('One or both players not found');
            }

            const player1 = players.find(p => p.id === player1Id);
            const player2 = players.find(p => p.id === player2Id);

            // Validate game result
            this.validateGameResult(gameResult, player1, player2);

            // Determine result string for rating calculation
            let result;
            if (winnerId === player1Id) {
                result = 'player1_wins';
            } else if (winnerId === player2Id) {
                result = 'player2_wins';
            } else {
                result = 'draw';
            }

            // Calculate new ratings
            const ratingResult = this.ratingService.calculateNewRatings(
                {
                    rating: player1.elo_rating,
                    gamesPlayed: player1.games_played,
                    userId: player1Id
                },
                {
                    rating: player2.elo_rating,
                    gamesPlayed: player2.games_played,
                    userId: player2Id
                },
                result
            );

            // Analyze move data
            const moveAnalysis = this.analyzeMoveData(moveHistory, player1Id, player2Id);

            // Record rating changes
            await this.recordRatingChanges(connection, {
                player1Id,
                player2Id,
                player1OldRating: player1.elo_rating,
                player1NewRating: ratingResult.player1NewRating,
                player2OldRating: player2.elo_rating,
                player2NewRating: ratingResult.player2NewRating,
                gameId,
                result
            });

            // Prepare comprehensive game data for statistics
            const gameData = {
                gameId,
                player1Id,
                player2Id,
                winnerId,
                gameDurationSeconds,
                totalMoves: moveAnalysis.totalMoves,
                player1Moves: moveAnalysis.player1Moves,
                player2Moves: moveAnalysis.player2Moves,
                player1AvgMoveTime: moveAnalysis.player1AvgMoveTime,
                player2AvgMoveTime: moveAnalysis.player2AvgMoveTime,
                player1RatingBefore: player1.elo_rating,
                player2RatingBefore: player2.elo_rating,
                player1RatingAfter: ratingResult.player1NewRating,
                player2RatingAfter: ratingResult.player2NewRating,
                gameType
            };

            // Update statistics
            await this.statisticsService.updatePlayerStatistics(gameData);

            // Check achievements for both players
            const player1Achievements = await this.achievementService.checkAndAwardAchievements(
                player1Id,
                {
                    ...gameData,
                    isWinner: winnerId === player1Id,
                    isDraw: winnerId === null,
                    isWin: winnerId === player1Id,
                    ratingChange: ratingResult.player1Change
                }
            );

            const player2Achievements = await this.achievementService.checkAndAwardAchievements(
                player2Id,
                {
                    ...gameData,
                    isWinner: winnerId === player2Id,
                    isDraw: winnerId === null,
                    isWin: winnerId === player2Id,
                    ratingChange: ratingResult.player2Change
                }
            );

            await connection.commit();

            // Prepare response
            const processingResult = {
                gameId,
                ratingChanges: {
                    player1: {
                        userId: player1Id,
                        oldRating: player1.elo_rating,
                        newRating: ratingResult.player1NewRating,
                        change: ratingResult.player1Change
                    },
                    player2: {
                        userId: player2Id,
                        oldRating: player2.elo_rating,
                        newRating: ratingResult.player2NewRating,
                        change: ratingResult.player2Change
                    }
                },
                moveAnalysis,
                achievements: {
                    player1: player1Achievements,
                    player2: player2Achievements
                },
                gameStatistics: {
                    duration: gameDurationSeconds,
                    totalMoves: moveAnalysis.totalMoves,
                    gameType,
                    result
                }
            };

            // Emit events for real-time updates (if event system exists)
            await this.emitGameCompletionEvents(processingResult);

            return processingResult;

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Analyze move data to extract statistics
     * @param {Array} moveHistory - Array of move objects
     * @param {number} player1Id - Player 1 ID
     * @param {number} player2Id - Player 2 ID
     * @returns {Object} Move analysis data
     */
    analyzeMoveData(moveHistory, player1Id, player2Id) {
        if (!moveHistory || !Array.isArray(moveHistory)) {
            return {
                totalMoves: 0,
                player1Moves: 0,
                player2Moves: 0,
                player1AvgMoveTime: 0,
                player2AvgMoveTime: 0,
                player1MoveTimes: [],
                player2MoveTimes: []
            };
        }

        let player1Moves = 0;
        let player2Moves = 0;
        let player1TotalTime = 0;
        let player2TotalTime = 0;
        const player1MoveTimes = [];
        const player2MoveTimes = [];

        for (const move of moveHistory) {
            if (move.playerId === player1Id) {
                player1Moves++;
                if (move.moveTime) {
                    player1TotalTime += move.moveTime;
                    player1MoveTimes.push(move.moveTime);
                }
            } else if (move.playerId === player2Id) {
                player2Moves++;
                if (move.moveTime) {
                    player2TotalTime += move.moveTime;
                    player2MoveTimes.push(move.moveTime);
                }
            }
        }

        return {
            totalMoves: moveHistory.length,
            player1Moves,
            player2Moves,
            player1AvgMoveTime: player1Moves > 0 ? player1TotalTime / player1Moves : 0,
            player2AvgMoveTime: player2Moves > 0 ? player2TotalTime / player2Moves : 0,
            player1MoveTimes,
            player2MoveTimes
        };
    }

    /**
     * Record rating changes in rating history
     * @param {Object} connection - Database connection
     * @param {Object} ratingData - Rating change data
     */
    async recordRatingChanges(connection, ratingData) {
        const {
            player1Id,
            player2Id,
            player1OldRating,
            player1NewRating,
            player2OldRating,
            player2NewRating,
            gameId,
            result
        } = ratingData;

        // Record player 1 rating change
        let player1Reason = 'draw';
        if (result === 'player1_wins') player1Reason = 'win';
        else if (result === 'player2_wins') player1Reason = 'loss';

        await connection.execute(`
            INSERT INTO rating_history (
                user_id, old_rating, new_rating, rating_change, 
                game_id, reason
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            player1Id,
            player1OldRating,
            player1NewRating,
            player1NewRating - player1OldRating,
            gameId,
            player1Reason
        ]);

        // Record player 2 rating change
        let player2Reason = 'draw';
        if (result === 'player2_wins') player2Reason = 'win';
        else if (result === 'player1_wins') player2Reason = 'loss';

        await connection.execute(`
            INSERT INTO rating_history (
                user_id, old_rating, new_rating, rating_change, 
                game_id, reason
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            player2Id,
            player2OldRating,
            player2NewRating,
            player2NewRating - player2OldRating,
            gameId,
            player2Reason
        ]);
    }

    /**
     * Validate game result data
     * @param {Object} gameResult - Game result to validate
     * @param {Object} player1 - Player 1 data
     * @param {Object} player2 - Player 2 data
     */
    validateGameResult(gameResult, player1, player2) {
        // Basic validation
        if (!gameResult.gameId) {
            throw new Error('Game ID is required');
        }

        if (!gameResult.player1Id || !gameResult.player2Id) {
            throw new Error('Both player IDs are required');
        }

        if (gameResult.player1Id === gameResult.player2Id) {
            throw new Error('Players cannot be the same');
        }

        if (gameResult.winnerId && 
            gameResult.winnerId !== gameResult.player1Id && 
            gameResult.winnerId !== gameResult.player2Id) {
            throw new Error('Winner ID must be one of the players or null for draw');
        }

        if (!gameResult.gameDurationSeconds || gameResult.gameDurationSeconds < 1) {
            throw new Error('Game duration must be at least 1 second');
        }

        // Validate move history if provided
        if (gameResult.moveHistory && Array.isArray(gameResult.moveHistory)) {
            for (const move of gameResult.moveHistory) {
                if (!move.playerId || 
                    (move.playerId !== gameResult.player1Id && 
                     move.playerId !== gameResult.player2Id)) {
                    throw new Error('All moves must belong to one of the game players');
                }
            }
        }
    }

    /**
     * Get match prediction between two players
     * @param {number} player1Id - Player 1 ID
     * @param {number} player2Id - Player 2 ID
     * @returns {Promise<Object>} Match prediction data
     */
    async getMatchPrediction(player1Id, player2Id) {
        const connection = await this.db.getConnection();
        
        try {
            // Get player ratings and stats
            const [players] = await connection.execute(`
                SELECT id, username, elo_rating, games_played, games_won, games_lost
                FROM users 
                WHERE id IN ($1, $2)
            `, [player1Id, player2Id]);

            if (players.length !== 2) {
                throw new Error('One or both players not found');
            }

            const player1 = players.find(p => p.id === player1Id);
            const player2 = players.find(p => p.id === player2Id);

            // Calculate win probabilities
            const probabilities = this.ratingService.calculateWinProbabilities(
                player1.elo_rating,
                player2.elo_rating
            );

            // Get head-to-head record
            const [headToHead] = await connection.execute(`
                SELECT 
                    COUNT(*) as total_games,
                    SUM(CASE WHEN winner_id = $1 THEN 1 ELSE 0 END) as player1_wins,
                    SUM(CASE WHEN winner_id = $2 THEN 1 ELSE 0 END) as player2_wins,
                    SUM(CASE WHEN winner_id IS NULL THEN 1 ELSE 0 END) as draws
                FROM game_statistics
                WHERE (player1_id = $3 AND player2_id = $4) 
                   OR (player1_id = $5 AND player2_id = $6)
            `, [player1Id, player2Id, player1Id, player2Id, player2Id, player1Id]);

            const h2h = headToHead[0];

            // Calculate expected rating changes
            const mockRatingResult = this.ratingService.calculateNewRatings(
                {
                    rating: player1.elo_rating,
                    gamesPlayed: player1.games_played,
                    userId: player1Id
                },
                {
                    rating: player2.elo_rating,
                    gamesPlayed: player2.games_played,
                    userId: player2Id
                },
                'player1_wins'
            );

            return {
                players: {
                    player1: {
                        id: player1.id,
                        username: player1.username,
                        rating: player1.elo_rating,
                        gamesPlayed: player1.games_played,
                        winRate: player1.games_played > 0 ? 
                            (player1.games_won / player1.games_played * 100).toFixed(1) : 0,
                        category: this.ratingService.getRatingCategory(player1.elo_rating)
                    },
                    player2: {
                        id: player2.id,
                        username: player2.username,
                        rating: player2.elo_rating,
                        gamesPlayed: player2.games_played,
                        winRate: player2.games_played > 0 ? 
                            (player2.games_won / player2.games_played * 100).toFixed(1) : 0,
                        category: this.ratingService.getRatingCategory(player2.elo_rating)
                    }
                },
                prediction: {
                    player1WinProbability: probabilities.player1WinProbability,
                    player2WinProbability: probabilities.player2WinProbability,
                    drawProbability: probabilities.drawProbability,
                    ratingDifference: Math.abs(player1.elo_rating - player2.elo_rating),
                    expectedRatingChanges: {
                        player1Win: mockRatingResult.player1Change,
                        player1Loss: -mockRatingResult.player1Change,
                        player2Win: mockRatingResult.player2Change,
                        player2Loss: -mockRatingResult.player2Change
                    }
                },
                headToHead: {
                    totalGames: h2h.total_games,
                    player1Wins: h2h.player1_wins,
                    player2Wins: h2h.player2_wins,
                    draws: h2h.draws,
                    player1WinRate: h2h.total_games > 0 ? 
                        (h2h.player1_wins / h2h.total_games * 100).toFixed(1) : 0
                }
            };
        } finally {
            connection.release();
        }
    }

    /**
     * Apply rating decay for inactive players
     * @param {number} daysSinceLastGame - Days threshold for decay
     * @returns {Promise<Object>} Decay application results
     */
    async applyRatingDecay(daysSinceLastGame = 90) {
        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();

            // Get inactive players
            const [inactivePlayers] = await connection.execute(`
                SELECT 
                    id, username, elo_rating, last_game_played,
                    (CURRENT_DATE - COALESCE(last_game_played, created_at)::date) as days_inactive
                FROM users
                WHERE (CURRENT_DATE - COALESCE(last_game_played, created_at)::date) > $1
                AND games_played >= 10
                AND elo_rating > $2
            `, [daysSinceLastGame, this.ratingService.RATING_FLOOR]);

            const decayResults = [];

            for (const player of inactivePlayers) {
                const newRating = this.ratingService.calculateRatingDecay(
                    player.elo_rating,
                    player.days_inactive
                );

                if (newRating !== player.elo_rating) {
                    // Update player rating
                    await connection.execute(
                        'UPDATE users SET elo_rating = $1 WHERE id = $2',
                        [newRating, player.id]
                    );

                    // Record rating change
                    await connection.execute(`
                        INSERT INTO rating_history (
                            user_id, old_rating, new_rating, rating_change, reason
                        ) VALUES ($1, $2, $3, $4, 'decay')
                    `, [
                        player.id,
                        player.elo_rating,
                        newRating,
                        newRating - player.elo_rating
                    ]);

                    decayResults.push({
                        userId: player.id,
                        username: player.username,
                        oldRating: player.elo_rating,
                        newRating,
                        change: newRating - player.elo_rating,
                        daysInactive: player.days_inactive
                    });
                }
            }

            await connection.commit();

            return {
                playersProcessed: inactivePlayers.length,
                ratingsDecayed: decayResults.length,
                decayResults
            };

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Emit game completion events for real-time updates
     * @param {Object} processingResult - Game processing result
     */
    async emitGameCompletionEvents(processingResult) {
        // This would integrate with WebSocket/Socket.IO or event system
        // For now, we'll just log the events
        
        const events = [
            {
                type: 'rating_update',
                data: processingResult.ratingChanges
            },
            {
                type: 'game_completed',
                data: {
                    gameId: processingResult.gameId,
                    statistics: processingResult.gameStatistics
                }
            }
        ];

        // Add achievement events if any achievements were earned
        if (processingResult.achievements.player1.length > 0) {
            events.push({
                type: 'achievements_earned',
                data: {
                    userId: processingResult.ratingChanges.player1.userId,
                    achievements: processingResult.achievements.player1
                }
            });
        }

        if (processingResult.achievements.player2.length > 0) {
            events.push({
                type: 'achievements_earned',
                data: {
                    userId: processingResult.ratingChanges.player2.userId,
                    achievements: processingResult.achievements.player2
                }
            });
        }

        // Log events (replace with actual event emission)
        console.log('Game completion events:', events);
        
        // TODO: Implement actual event emission
        // this.eventEmitter.emit('game_completed', processingResult);
    }
}

module.exports = GameIntegrationService;