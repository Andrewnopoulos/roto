const LeaderboardService = require('./LeaderboardService');
const PositionTrackingService = require('./PositionTrackingService');
const SeasonService = require('./SeasonService');
const pool = require('../config/database');
const logger = require('../utils/logger');

class GameIntegrationService {
    constructor() {
        this.ratingSystem = {
            K_FACTOR: 32, // Standard ELO K-factor
            MIN_RATING: 100,
            MAX_RATING: 3000,
            DEFAULT_RATING: 1000
        };
    }

    /**
     * Process game result and update all relevant leaderboards
     */
    async processGameResult(gameData) {
        const {
            gameId,
            player1Id,
            player2Id,
            winnerId,
            gameType = 'standard',
            duration,
            resultType = 'win' // 'win', 'draw', 'forfeit'
        } = gameData;

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Validate game data
            await this._validateGameData(client, gameData);

            // Record the game result
            await this._recordGameResult(client, gameData);

            // Get current ratings for both players
            const player1Rating = await this._getPlayerRating(client, player1Id);
            const player2Rating = await this._getPlayerRating(client, player2Id);

            // Calculate rating changes
            const ratingChanges = this._calculateRatingChanges(
                player1Rating,
                player2Rating,
                winnerId,
                player1Id,
                player2Id,
                resultType
            );

            // Update player statistics in all relevant categories
            await this._updatePlayerStatistics(client, player1Id, player2Id, winnerId, resultType, ratingChanges);

            // Recalculate rankings for affected leaderboards
            await this._recalculateAffectedRankings(player1Id, player2Id);

            await client.query('COMMIT');

            logger.info(`Game result processed: ${gameId}, Winner: ${winnerId || 'Draw'}`);

            return {
                success: true,
                gameId,
                ratingChanges,
                message: 'Game result processed successfully'
            };

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error processing game result:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Bulk process multiple game results (for batch updates)
     */
    async processBulkGameResults(gameResults) {
        const results = [];
        const errors = [];

        for (const gameData of gameResults) {
            try {
                const result = await this.processGameResult(gameData);
                results.push(result);
            } catch (error) {
                errors.push({
                    gameId: gameData.gameId,
                    error: error.message
                });
                logger.error(`Error processing game ${gameData.gameId}:`, error);
            }
        }

        // Recalculate all rankings after bulk processing
        try {
            await this._recalculateAllRankings();
        } catch (error) {
            logger.error('Error in bulk ranking recalculation:', error);
        }

        return {
            success: true,
            processed: results.length,
            errors: errors.length,
            results,
            errors
        };
    }

    /**
     * Get player's current rating in a specific category
     */
    async getPlayerRating(playerId, categoryName = 'global_rating') {
        try {
            const playerRank = await LeaderboardService.getPlayerRank(playerId, categoryName);
            return playerRank?.rating || this.ratingSystem.DEFAULT_RATING;
        } catch (error) {
            logger.error(`Error getting player rating for ${playerId}:`, error);
            return this.ratingSystem.DEFAULT_RATING;
        }
    }

    /**
     * Calculate expected win probability using ELO formula
     */
    calculateWinProbability(player1Rating, player2Rating) {
        const ratingDifference = player2Rating - player1Rating;
        return 1 / (1 + Math.pow(10, ratingDifference / 400));
    }

    /**
     * Simulate rating changes for a hypothetical match
     */
    simulateRatingChanges(player1Rating, player2Rating, winnerId, player1Id, player2Id) {
        return this._calculateRatingChanges(
            player1Rating,
            player2Rating,
            winnerId,
            player1Id,
            player2Id,
            'win'
        );
    }

    /**
     * Get detailed match history between two players
     */
    async getHeadToHeadStats(player1Id, player2Id, limit = 10) {
        try {
            const query = `
                SELECT 
                    gr.game_id,
                    gr.winner_id,
                    gr.result_type,
                    gr.duration_seconds,
                    gr.created_at,
                    p1.username as player1_username,
                    p2.username as player2_username
                FROM game_results gr
                JOIN players p1 ON gr.player1_id = p1.id
                JOIN players p2 ON gr.player2_id = p2.id
                WHERE (gr.player1_id = $1 AND gr.player2_id = $2) 
                   OR (gr.player1_id = $2 AND gr.player2_id = $1)
                ORDER BY gr.created_at DESC
                LIMIT $3
            `;

            const result = await pool.query(query, [player1Id, player2Id, limit]);

            // Calculate statistics
            const stats = this._calculateHeadToHeadStats(result.rows, player1Id, player2Id);

            return {
                player1Id,
                player2Id,
                statistics: stats,
                recentMatches: result.rows
            };

        } catch (error) {
            logger.error('Error getting head-to-head stats:', error);
            throw error;
        }
    }

    /**
     * Private helper methods
     */
    async _validateGameData(client, gameData) {
        const { gameId, player1Id, player2Id, winnerId } = gameData;

        // Check if game already exists
        const existingGame = await client.query(
            'SELECT id FROM game_results WHERE game_id = $1',
            [gameId]
        );

        if (existingGame.rows.length > 0) {
            throw new Error(`Game ${gameId} has already been processed`);
        }

        // Validate players exist
        const playersResult = await client.query(
            'SELECT id FROM players WHERE id IN ($1, $2) AND is_active = true',
            [player1Id, player2Id]
        );

        if (playersResult.rows.length !== 2) {
            throw new Error('One or both players not found or inactive');
        }

        // Validate winner (if not a draw)
        if (winnerId && ![player1Id, player2Id].includes(winnerId)) {
            throw new Error('Winner must be one of the participating players');
        }

        // Players cannot play against themselves
        if (player1Id === player2Id) {
            throw new Error('Players cannot play against themselves');
        }
    }

    async _recordGameResult(client, gameData) {
        const {
            gameId,
            player1Id,
            player2Id,
            winnerId,
            gameType,
            duration,
            resultType
        } = gameData;

        await client.query(`
            INSERT INTO game_results (
                game_id, player1_id, player2_id, winner_id, 
                game_type, result_type, duration_seconds
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [gameId, player1Id, player2Id, winnerId, gameType, resultType, duration]);
    }

    async _getPlayerRating(client, playerId, categoryName = 'global_rating') {
        const result = await client.query(`
            SELECT le.rating
            FROM leaderboard_entries le
            JOIN leaderboard_categories lc ON le.category_id = lc.id
            WHERE le.player_id = $1 AND lc.name = $2
        `, [playerId, categoryName]);

        return result.rows.length > 0 ? result.rows[0].rating : this.ratingSystem.DEFAULT_RATING;
    }

    _calculateRatingChanges(player1Rating, player2Rating, winnerId, player1Id, player2Id, resultType) {
        const expectedPlayer1 = this.calculateWinProbability(player1Rating, player2Rating);
        const expectedPlayer2 = 1 - expectedPlayer1;

        let actualPlayer1, actualPlayer2;

        switch (resultType) {
            case 'draw':
                actualPlayer1 = actualPlayer2 = 0.5;
                break;
            case 'forfeit':
                // Forfeit is treated as a loss with reduced rating change
                if (winnerId === player1Id) {
                    actualPlayer1 = 1;
                    actualPlayer2 = 0;
                } else {
                    actualPlayer1 = 0;
                    actualPlayer2 = 1;
                }
                break;
            default: // 'win'
                if (winnerId === player1Id) {
                    actualPlayer1 = 1;
                    actualPlayer2 = 0;
                } else if (winnerId === player2Id) {
                    actualPlayer1 = 0;
                    actualPlayer2 = 1;
                } else {
                    actualPlayer1 = actualPlayer2 = 0.5; // Draw
                }
        }

        // Apply K-factor and calculate changes
        let kFactor = this.ratingSystem.K_FACTOR;
        
        // Reduce K-factor for forfeits to minimize rating manipulation
        if (resultType === 'forfeit') {
            kFactor = Math.floor(kFactor * 0.5);
        }

        const player1Change = Math.round(kFactor * (actualPlayer1 - expectedPlayer1));
        const player2Change = Math.round(kFactor * (actualPlayer2 - expectedPlayer2));

        // Ensure ratings stay within bounds
        const newPlayer1Rating = Math.max(
            this.ratingSystem.MIN_RATING,
            Math.min(this.ratingSystem.MAX_RATING, player1Rating + player1Change)
        );
        const newPlayer2Rating = Math.max(
            this.ratingSystem.MIN_RATING,
            Math.min(this.ratingSystem.MAX_RATING, player2Rating + player2Change)
        );

        return {
            [player1Id]: {
                oldRating: player1Rating,
                newRating: newPlayer1Rating,
                change: newPlayer1Rating - player1Rating
            },
            [player2Id]: {
                oldRating: player2Rating,
                newRating: newPlayer2Rating,
                change: newPlayer2Rating - player2Rating
            }
        };
    }

    async _updatePlayerStatistics(client, player1Id, player2Id, winnerId, resultType, ratingChanges) {
        // Determine results for each player
        const player1Result = this._getPlayerResult(player1Id, winnerId, resultType);
        const player2Result = this._getPlayerResult(player2Id, winnerId, resultType);

        // Get current season
        const currentSeason = await SeasonService.getCurrentSeason();

        // Update statistics for all relevant categories
        const categories = [
            'global_rating',
            'global_wins',
            'global_win_percentage'
        ];

        // Add seasonal categories if there's an active season
        if (currentSeason) {
            categories.push('seasonal_rating');
        }

        // Update each player's stats
        for (const category of categories) {
            await LeaderboardService.updatePlayerStats(player1Id, {
                result: player1Result,
                ratingChange: ratingChanges[player1Id].change
            }, [category]);

            await LeaderboardService.updatePlayerStats(player2Id, {
                result: player2Result,
                ratingChange: ratingChanges[player2Id].change
            }, [category]);
        }
    }

    _getPlayerResult(playerId, winnerId, resultType) {
        if (resultType === 'draw') {
            return 'draw';
        }
        
        if (winnerId === playerId) {
            return 'win';
        } else {
            return 'loss';
        }
    }

    async _recalculateAffectedRankings(player1Id, player2Id) {
        try {
            const currentSeason = await SeasonService.getCurrentSeason();
            
            const categories = ['global_rating', 'global_wins', 'global_win_percentage'];
            if (currentSeason) {
                categories.push('seasonal_rating');
            }

            // Recalculate rankings for affected categories
            for (const category of categories) {
                await LeaderboardService.recalculateRankings(category, currentSeason?.id);
            }
        } catch (error) {
            logger.error('Error recalculating affected rankings:', error);
            // Don't throw - this is not critical for game processing
        }
    }

    async _recalculateAllRankings() {
        try {
            const currentSeason = await SeasonService.getCurrentSeason();
            
            const categoriesResult = await pool.query(
                'SELECT name FROM leaderboard_categories WHERE is_active = true'
            );

            for (const category of categoriesResult.rows) {
                await LeaderboardService.recalculateRankings(category.name, currentSeason?.id);
            }
        } catch (error) {
            logger.error('Error recalculating all rankings:', error);
            throw error;
        }
    }

    _calculateHeadToHeadStats(matches, player1Id, player2Id) {
        let player1Wins = 0;
        let player2Wins = 0;
        let draws = 0;
        let totalDuration = 0;
        let gameCount = 0;

        for (const match of matches) {
            gameCount++;
            
            if (match.duration_seconds) {
                totalDuration += match.duration_seconds;
            }

            if (match.winner_id === player1Id) {
                player1Wins++;
            } else if (match.winner_id === player2Id) {
                player2Wins++;
            } else {
                draws++;
            }
        }

        return {
            totalGames: gameCount,
            player1Wins,
            player2Wins,
            draws,
            player1WinRate: gameCount > 0 ? (player1Wins / gameCount * 100).toFixed(2) : 0,
            player2WinRate: gameCount > 0 ? (player2Wins / gameCount * 100).toFixed(2) : 0,
            averageDuration: totalDuration > 0 && gameCount > 0 ? Math.round(totalDuration / gameCount) : null
        };
    }
}

module.exports = new GameIntegrationService();