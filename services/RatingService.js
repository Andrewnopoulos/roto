/**
 * ELO Rating Calculation Service
 * Implements a comprehensive ELO rating system for skill-based matchmaking
 */

class RatingService {
    constructor() {
        // ELO system constants
        this.K_FACTOR_NEW_PLAYER = 32;    // Higher K-factor for new players (< 30 games)
        this.K_FACTOR_REGULAR = 24;       // Regular K-factor for established players
        this.K_FACTOR_EXPERT = 16;        // Lower K-factor for expert players (rating > 2000)
        this.INITIAL_RATING = 1200;       // Starting rating for new players
        this.PROVISIONAL_GAMES = 30;      // Games considered provisional for new players
        
        // Rating bounds
        this.MIN_RATING = 100;
        this.MAX_RATING = 3000;
        
        // Special modifiers
        this.RATING_FLOOR = 800;          // Minimum rating for established players
        this.INACTIVITY_DECAY_THRESHOLD = 90; // Days before rating decay starts
        this.INACTIVITY_DECAY_RATE = 0.02;    // Daily decay rate for inactive players
    }

    /**
     * Calculate expected score for player A against player B
     * @param {number} ratingA - Player A's rating
     * @param {number} ratingB - Player B's rating
     * @returns {number} Expected score (0-1)
     */
    calculateExpectedScore(ratingA, ratingB) {
        const ratingDifference = ratingB - ratingA;
        return 1 / (1 + Math.pow(10, ratingDifference / 400));
    }

    /**
     * Determine K-factor based on player rating and games played
     * @param {number} rating - Current player rating
     * @param {number} gamesPlayed - Total games played by the player
     * @returns {number} K-factor for rating calculation
     */
    getKFactor(rating, gamesPlayed) {
        // New players get higher K-factor for faster rating adjustment
        if (gamesPlayed < this.PROVISIONAL_GAMES) {
            return this.K_FACTOR_NEW_PLAYER;
        }
        
        // Expert players get lower K-factor for stability
        if (rating >= 2000) {
            return this.K_FACTOR_EXPERT;
        }
        
        return this.K_FACTOR_REGULAR;
    }

    /**
     * Calculate new ratings after a game
     * @param {Object} player1 - {rating, gamesPlayed, userId}
     * @param {Object} player2 - {rating, gamesPlayed, userId}
     * @param {string} result - 'player1_wins', 'player2_wins', or 'draw'
     * @returns {Object} {player1NewRating, player2NewRating, player1Change, player2Change}
     */
    calculateNewRatings(player1, player2, result) {
        const expectedScore1 = this.calculateExpectedScore(player1.rating, player2.rating);
        const expectedScore2 = 1 - expectedScore1;

        let actualScore1, actualScore2;
        
        switch (result) {
            case 'player1_wins':
                actualScore1 = 1;
                actualScore2 = 0;
                break;
            case 'player2_wins':
                actualScore1 = 0;
                actualScore2 = 1;
                break;
            case 'draw':
                actualScore1 = 0.5;
                actualScore2 = 0.5;
                break;
            default:
                throw new Error('Invalid game result');
        }

        const k1 = this.getKFactor(player1.rating, player1.gamesPlayed);
        const k2 = this.getKFactor(player2.rating, player2.gamesPlayed);

        const player1Change = Math.round(k1 * (actualScore1 - expectedScore1));
        const player2Change = Math.round(k2 * (actualScore2 - expectedScore2));

        let player1NewRating = player1.rating + player1Change;
        let player2NewRating = player2.rating + player2Change;

        // Apply rating bounds
        player1NewRating = this.applyRatingBounds(player1NewRating, player1.gamesPlayed);
        player2NewRating = this.applyRatingBounds(player2NewRating, player2.gamesPlayed);

        return {
            player1NewRating,
            player2NewRating,
            player1Change: player1NewRating - player1.rating,
            player2Change: player2NewRating - player2.rating,
            expectedScore1,
            expectedScore2
        };
    }

    /**
     * Apply rating bounds and special rules
     * @param {number} newRating - Calculated new rating
     * @param {number} gamesPlayed - Total games played
     * @returns {number} Bounded rating
     */
    applyRatingBounds(newRating, gamesPlayed) {
        // Apply absolute bounds
        newRating = Math.max(this.MIN_RATING, Math.min(this.MAX_RATING, newRating));
        
        // Apply rating floor for established players
        if (gamesPlayed >= this.PROVISIONAL_GAMES) {
            newRating = Math.max(this.RATING_FLOOR, newRating);
        }
        
        return newRating;
    }

    /**
     * Calculate rating decay for inactive players
     * @param {number} currentRating - Current player rating
     * @param {number} daysSinceLastGame - Days since last game
     * @returns {number} Rating after decay
     */
    calculateRatingDecay(currentRating, daysSinceLastGame) {
        if (daysSinceLastGame <= this.INACTIVITY_DECAY_THRESHOLD) {
            return currentRating;
        }
        
        const decayDays = daysSinceLastGame - this.INACTIVITY_DECAY_THRESHOLD;
        const decayFactor = Math.pow(1 - this.INACTIVITY_DECAY_RATE, decayDays);
        const decayedRating = Math.round(currentRating * decayFactor);
        
        // Don't decay below rating floor
        return Math.max(this.RATING_FLOOR, decayedRating);
    }

    /**
     * Calculate win probability between two players
     * @param {number} rating1 - Player 1 rating
     * @param {number} rating2 - Player 2 rating
     * @returns {Object} {player1WinProbability, player2WinProbability, drawProbability}
     */
    calculateWinProbabilities(rating1, rating2) {
        const expectedScore1 = this.calculateExpectedScore(rating1, rating2);
        const expectedScore2 = 1 - expectedScore1;
        
        // Adjust for draw probability (approximately 15% in balanced games)
        const drawProbability = 0.15 * (1 - Math.abs(expectedScore1 - expectedScore2));
        const adjustedExpected1 = expectedScore1 * (1 - drawProbability);
        const adjustedExpected2 = expectedScore2 * (1 - drawProbability);
        
        return {
            player1WinProbability: Math.round(adjustedExpected1 * 100) / 100,
            player2WinProbability: Math.round(adjustedExpected2 * 100) / 100,
            drawProbability: Math.round(drawProbability * 100) / 100
        };
    }

    /**
     * Get rating category/title based on rating
     * @param {number} rating - Player rating
     * @returns {string} Rating category
     */
    getRatingCategory(rating) {
        if (rating >= 2200) return 'Grandmaster';
        if (rating >= 2000) return 'Master';
        if (rating >= 1800) return 'Expert';
        if (rating >= 1600) return 'Advanced';
        if (rating >= 1400) return 'Intermediate';
        if (rating >= 1200) return 'Beginner';
        return 'Novice';
    }

    /**
     * Calculate rating confidence interval
     * @param {number} rating - Current rating
     * @param {number} gamesPlayed - Total games played
     * @returns {Object} {lower, upper, confidence}
     */
    calculateRatingConfidence(rating, gamesPlayed) {
        // Rating deviation decreases with more games played
        const baseDeviation = 200;
        const deviation = baseDeviation / Math.sqrt(1 + gamesPlayed / 20);
        
        // 95% confidence interval
        const margin = 1.96 * deviation;
        
        return {
            lower: Math.round(rating - margin),
            upper: Math.round(rating + margin),
            confidence: Math.max(0, Math.min(100, 100 - (deviation / baseDeviation * 100)))
        };
    }

    /**
     * Validate rating calculation inputs
     * @param {Object} player1 - Player 1 data
     * @param {Object} player2 - Player 2 data
     * @param {string} result - Game result
     * @throws {Error} If validation fails
     */
    validateInputs(player1, player2, result) {
        if (!player1 || !player2) {
            throw new Error('Both players must be provided');
        }
        
        if (typeof player1.rating !== 'number' || typeof player2.rating !== 'number') {
            throw new Error('Player ratings must be numbers');
        }
        
        if (player1.rating < this.MIN_RATING || player1.rating > this.MAX_RATING ||
            player2.rating < this.MIN_RATING || player2.rating > this.MAX_RATING) {
            throw new Error('Player ratings must be within valid bounds');
        }
        
        if (!['player1_wins', 'player2_wins', 'draw'].includes(result)) {
            throw new Error('Invalid game result');
        }
        
        if (player1.userId === player2.userId) {
            throw new Error('Players cannot play against themselves');
        }
    }
}

module.exports = RatingService;