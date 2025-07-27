const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * ELO Rating System for Rota Game
 * 
 * Standard ELO implementation with K-factor adjustments:
 * - New players (< 30 games): K = 40
 * - Experienced players (30-100 games): K = 20  
 * - Veteran players (> 100 games): K = 10
 */
class RatingService {
    static DEFAULT_RATING = 1200;
    static MIN_RATING = 100;
    static MAX_RATING = 3000;

    /**
     * Calculate new ratings for both players after a game
     * @param {Object} winner - Winner player object with rating and games_played
     * @param {Object} loser - Loser player object with rating and games_played
     * @returns {Object} New ratings for both players
     */
    static calculateNewRatings(winner, loser) {
        const winnerK = this.getKFactor(winner.games_played);
        const loserK = this.getKFactor(loser.games_played);

        // Expected scores using ELO formula
        const winnerExpected = this.getExpectedScore(winner.rating, loser.rating);
        const loserExpected = this.getExpectedScore(loser.rating, winner.rating);

        // Calculate new ratings (winner gets score 1, loser gets score 0)
        const newWinnerRating = Math.round(
            Math.max(this.MIN_RATING, 
                Math.min(this.MAX_RATING, 
                    winner.rating + winnerK * (1 - winnerExpected)
                )
            )
        );

        const newLoserRating = Math.round(
            Math.max(this.MIN_RATING,
                Math.min(this.MAX_RATING,
                    loser.rating + loserK * (0 - loserExpected)
                )
            )
        );

        return {
            winnerRating: newWinnerRating,
            loserRating: newLoserRating,
            winnerChange: newWinnerRating - winner.rating,
            loserChange: newLoserRating - loser.rating
        };
    }

    /**
     * Get K-factor based on number of games played
     * @param {number} gamesPlayed 
     * @returns {number} K-factor
     */
    static getKFactor(gamesPlayed) {
        if (gamesPlayed < 30) return 40;
        if (gamesPlayed < 100) return 20;
        return 10;
    }

    /**
     * Calculate expected score using ELO formula
     * @param {number} playerRating 
     * @param {number} opponentRating 
     * @returns {number} Expected score (0-1)
     */
    static getExpectedScore(playerRating, opponentRating) {
        return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
    }

    /**
     * Update player ratings after a game completes
     * @param {string} winnerId 
     * @param {string} loserId 
     * @param {Object} gameDetails - Additional game context
     */
    static async updateRatingsAfterGame(winnerId, loserId, gameDetails = {}) {
        const client = await db.getClient();
        
        try {
            await client.query('BEGIN');

            // Get current player stats
            const playersQuery = `
                SELECT u.id, u.username, us.rating, us.games_played
                FROM users u
                JOIN user_statistics us ON u.id = us.user_id
                WHERE u.id IN ($1, $2)
            `;
            const playersResult = await client.query(playersQuery, [winnerId, loserId]);
            
            if (playersResult.rows.length !== 2) {
                throw new Error('Could not find both players for rating update');
            }

            const winner = playersResult.rows.find(p => p.id === winnerId);
            const loser = playersResult.rows.find(p => p.id === loserId);

            // Calculate new ratings
            const ratingChanges = this.calculateNewRatings(winner, loser);

            // Update ratings in database
            await client.query(`
                UPDATE user_statistics 
                SET rating = $1,
                    peak_rating = GREATEST(peak_rating, $1),
                    rating_updated_at = NOW()
                WHERE user_id = $2
            `, [ratingChanges.winnerRating, winnerId]);

            await client.query(`
                UPDATE user_statistics 
                SET rating = $1,
                    rating_updated_at = NOW()
                WHERE user_id = $2
            `, [ratingChanges.loserRating, loserId]);

            // Record rating history
            await this.recordRatingHistory(client, winnerId, winner.rating, ratingChanges.winnerRating, ratingChanges.winnerChange, gameDetails);
            await this.recordRatingHistory(client, loserId, loser.rating, ratingChanges.loserRating, ratingChanges.loserChange, gameDetails);

            await client.query('COMMIT');

            logger.info('Rating update completed', {
                winnerId,
                loserId,
                winnerChange: ratingChanges.winnerChange,
                loserChange: ratingChanges.loserChange,
                newWinnerRating: ratingChanges.winnerRating,
                newLoserRating: ratingChanges.loserRating
            });

            return ratingChanges;

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to update ratings', { error: error.message, winnerId, loserId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Record rating change in history table
     */
    static async recordRatingHistory(client, userId, oldRating, newRating, change, gameDetails) {
        await client.query(`
            INSERT INTO rating_history (
                user_id, old_rating, new_rating, rating_change, 
                game_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, NOW())
        `, [userId, oldRating, newRating, change, gameDetails.gameId || null]);
    }

    /**
     * Get rating distribution across all players
     */
    static async getRatingDistribution() {
        const query = `
            SELECT 
                CASE 
                    WHEN rating < 800 THEN 'Bronze'
                    WHEN rating < 1200 THEN 'Silver'
                    WHEN rating < 1600 THEN 'Gold'
                    WHEN rating < 2000 THEN 'Platinum'
                    ELSE 'Diamond'
                END as tier,
                COUNT(*) as player_count,
                MIN(rating) as min_rating,
                MAX(rating) as max_rating,
                AVG(rating)::integer as avg_rating
            FROM user_statistics 
            WHERE games_played >= 10
            GROUP BY tier
            ORDER BY min_rating
        `;

        const result = await db.query(query);
        return result.rows;
    }

    /**
     * Get player's rating history
     */
    static async getPlayerRatingHistory(userId, limit = 50) {
        const query = `
            SELECT 
                rh.*,
                g.created_at as game_date,
                CASE 
                    WHEN gp_winner.user_id = $1 THEN 'win'
                    ELSE 'loss'
                END as game_result
            FROM rating_history rh
            LEFT JOIN games g ON rh.game_id = g.id
            LEFT JOIN game_participants gp_winner ON g.id = gp_winner.game_id AND gp_winner.position = 1
            WHERE rh.user_id = $1
            ORDER BY rh.created_at DESC
            LIMIT $2
        `;

        const result = await db.query(query, [userId, limit]);
        return result.rows;
    }

    /**
     * Get player's current rank among all players
     */
    static async getPlayerRank(userId) {
        const query = `
            WITH ranked_players AS (
                SELECT 
                    user_id,
                    rating,
                    ROW_NUMBER() OVER (ORDER BY rating DESC) as rank,
                    COUNT(*) OVER () as total_players
                FROM user_statistics
                WHERE games_played >= 10
            )
            SELECT rank, total_players, rating
            FROM ranked_players
            WHERE user_id = $1
        `;

        const result = await db.query(query, [userId]);
        return result.rows[0] || null;
    }

    /**
     * Get rating tier for a given rating
     */
    static getRatingTier(rating) {
        if (rating < 800) return { name: 'Bronze', color: '#CD7F32' };
        if (rating < 1200) return { name: 'Silver', color: '#C0C0C0' };
        if (rating < 1600) return { name: 'Gold', color: '#FFD700' };
        if (rating < 2000) return { name: 'Platinum', color: '#E5E4E2' };
        return { name: 'Diamond', color: '#B9F2FF' };
    }

    /**
     * Initialize rating for new player
     */
    static async initializePlayerRating(userId) {
        const client = await db.getClient();
        
        try {
            await client.query(`
                UPDATE user_statistics 
                SET rating = $1, peak_rating = $1
                WHERE user_id = $2
            `, [this.DEFAULT_RATING, userId]);

            // Record initial rating
            await client.query(`
                INSERT INTO rating_history (
                    user_id, old_rating, new_rating, rating_change, created_at
                ) VALUES ($1, 0, $2, $2, NOW())
            `, [userId, this.DEFAULT_RATING]);

        } finally {
            client.release();
        }
    }
}

module.exports = RatingService;