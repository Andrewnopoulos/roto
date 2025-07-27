const { body, param, query } = require('express-validator');

class LeaderboardValidation {
    static validateLeaderboardCategory() {
        return [
            param('category')
                .isAlpha()
                .withMessage('Category must contain only letters')
                .isLength({ min: 3, max: 50 })
                .withMessage('Category must be between 3 and 50 characters')
        ];
    }

    static validatePlayerId() {
        return [
            param('playerId')
                .isInt({ min: 1 })
                .withMessage('Player ID must be a positive integer')
        ];
    }

    static validateSeasonId() {
        return [
            param('seasonId')
                .isInt({ min: 1 })
                .withMessage('Season ID must be a positive integer')
        ];
    }

    static validateLeaderboardQuery() {
        return [
            query('page')
                .optional()
                .isInt({ min: 1 })
                .withMessage('Page must be a positive integer'),
            query('limit')
                .optional()
                .isInt({ min: 1, max: 100 })
                .withMessage('Limit must be between 1 and 100'),
            query('sortBy')
                .optional()
                .isIn(['rating', 'wins', 'win_percentage', 'total_games', 'current_rank'])
                .withMessage('Invalid sort field'),
            query('sortOrder')
                .optional()
                .isIn(['ASC', 'DESC'])
                .withMessage('Sort order must be ASC or DESC'),
            query('seasonId')
                .optional()
                .isInt({ min: 1 })
                .withMessage('Season ID must be a positive integer')
        ];
    }

    static validateUpdatePlayerStats() {
        return [
            body('gameResult')
                .isObject()
                .withMessage('Game result must be an object'),
            body('gameResult.result')
                .isIn(['win', 'loss', 'draw'])
                .withMessage('Result must be win, loss, or draw'),
            body('gameResult.ratingChange')
                .optional()
                .isInt({ min: -200, max: 200 })
                .withMessage('Rating change must be between -200 and 200'),
            body('categories')
                .optional()
                .isArray()
                .withMessage('Categories must be an array'),
            body('categories.*')
                .optional()
                .isString()
                .withMessage('Each category must be a string')
        ];
    }

    static validatePositionHistoryQuery() {
        return [
            query('categoryName')
                .optional()
                .isAlpha()
                .withMessage('Category name must contain only letters'),
            query('seasonId')
                .optional()
                .isInt({ min: 1 })
                .withMessage('Season ID must be a positive integer'),
            query('limit')
                .optional()
                .isInt({ min: 1, max: 500 })
                .withMessage('Limit must be between 1 and 500'),
            query('days')
                .optional()
                .isInt({ min: 1, max: 365 })
                .withMessage('Days must be between 1 and 365')
        ];
    }

    static validatePositionChangesQuery() {
        return [
            query('limit')
                .optional()
                .isInt({ min: 1, max: 200 })
                .withMessage('Limit must be between 1 and 200'),
            query('minRankChange')
                .optional()
                .isInt({ min: 1 })
                .withMessage('Minimum rank change must be a positive integer'),
            query('hours')
                .optional()
                .isInt({ min: 1, max: 168 })
                .withMessage('Hours must be between 1 and 168')
        ];
    }

    static validateAnalyticsQuery() {
        return [
            query('seasonId')
                .optional()
                .isInt({ min: 1 })
                .withMessage('Season ID must be a positive integer'),
            query('days')
                .optional()
                .isInt({ min: 1, max: 90 })
                .withMessage('Days must be between 1 and 90')
        ];
    }
}

class SeasonValidation {
    static validateCreateSeason() {
        return [
            body('name')
                .trim()
                .isLength({ min: 3, max: 255 })
                .withMessage('Season name must be between 3 and 255 characters')
                .matches(/^[a-zA-Z0-9\s\-_]+$/)
                .withMessage('Season name can only contain letters, numbers, spaces, hyphens, and underscores'),
            body('startDate')
                .isISO8601()
                .withMessage('Start date must be a valid ISO 8601 date')
                .custom((value) => {
                    if (new Date(value) <= new Date()) {
                        throw new Error('Start date must be in the future');
                    }
                    return true;
                }),
            body('endDate')
                .isISO8601()
                .withMessage('End date must be a valid ISO 8601 date')
                .custom((value, { req }) => {
                    if (new Date(value) <= new Date(req.body.startDate)) {
                        throw new Error('End date must be after start date');
                    }
                    return true;
                })
        ];
    }

    static validateUpdateSeason() {
        return [
            body('name')
                .optional()
                .trim()
                .isLength({ min: 3, max: 255 })
                .withMessage('Season name must be between 3 and 255 characters')
                .matches(/^[a-zA-Z0-9\s\-_]+$/)
                .withMessage('Season name can only contain letters, numbers, spaces, hyphens, and underscores'),
            body('startDate')
                .optional()
                .isISO8601()
                .withMessage('Start date must be a valid ISO 8601 date'),
            body('endDate')
                .optional()
                .isISO8601()
                .withMessage('End date must be a valid ISO 8601 date')
        ];
    }

    static validateEndSeason() {
        return [
            body('createSnapshot')
                .optional()
                .isBoolean()
                .withMessage('Create snapshot must be a boolean'),
            body('resetWeeklyMonthly')
                .optional()
                .isBoolean()
                .withMessage('Reset weekly/monthly must be a boolean')
        ];
    }

    static validateSeasonQuery() {
        return [
            query('page')
                .optional()
                .isInt({ min: 1 })
                .withMessage('Page must be a positive integer'),
            query('limit')
                .optional()
                .isInt({ min: 1, max: 100 })
                .withMessage('Limit must be between 1 and 100'),
            query('includeInactive')
                .optional()
                .isBoolean()
                .withMessage('Include inactive must be a boolean')
        ];
    }

    static validateSeasonWinnersQuery() {
        return [
            query('categoryName')
                .optional()
                .isAlpha()
                .withMessage('Category name must contain only letters'),
            query('topCount')
                .optional()
                .isInt({ min: 1, max: 100 })
                .withMessage('Top count must be between 1 and 100')
        ];
    }
}

class GameValidation {
    static validateGameResult() {
        return [
            body('gameId')
                .isString()
                .trim()
                .isLength({ min: 1, max: 255 })
                .withMessage('Game ID must be a string between 1 and 255 characters'),
            body('player1Id')
                .isInt({ min: 1 })
                .withMessage('Player 1 ID must be a positive integer'),
            body('player2Id')
                .isInt({ min: 1 })
                .withMessage('Player 2 ID must be a positive integer'),
            body('winnerId')
                .optional()
                .isInt({ min: 1 })
                .withMessage('Winner ID must be a positive integer'),
            body('gameType')
                .optional()
                .isString()
                .trim()
                .isLength({ min: 1, max: 50 })
                .withMessage('Game type must be a string between 1 and 50 characters'),
            body('duration')
                .optional()
                .isInt({ min: 1 })
                .withMessage('Duration must be a positive integer (seconds)'),
            body('resultType')
                .optional()
                .isIn(['win', 'draw', 'forfeit'])
                .withMessage('Result type must be win, draw, or forfeit')
        ];
    }

    static validateBatchGameResults() {
        return [
            body('gameResults')
                .isArray({ min: 1, max: 100 })
                .withMessage('gameResults must be an array with 1-100 items'),
            body('gameResults.*.gameId')
                .isString()
                .trim()
                .isLength({ min: 1, max: 255 })
                .withMessage('Each game ID must be a string between 1 and 255 characters'),
            body('gameResults.*.player1Id')
                .isInt({ min: 1 })
                .withMessage('Each Player 1 ID must be a positive integer'),
            body('gameResults.*.player2Id')
                .isInt({ min: 1 })
                .withMessage('Each Player 2 ID must be a positive integer')
        ];
    }

    static validateWinProbability() {
        return [
            query('player1Id')
                .isInt({ min: 1 })
                .withMessage('Player 1 ID must be a positive integer'),
            query('player2Id')
                .isInt({ min: 1 })
                .withMessage('Player 2 ID must be a positive integer'),
            query('category')
                .optional()
                .isAlpha()
                .withMessage('Category must contain only letters')
        ];
    }

    static validateSimulateRatingChanges() {
        return [
            body('player1Id')
                .isInt({ min: 1 })
                .withMessage('Player 1 ID must be a positive integer'),
            body('player2Id')
                .isInt({ min: 1 })
                .withMessage('Player 2 ID must be a positive integer'),
            body('winnerId')
                .optional()
                .isInt({ min: 1 })
                .withMessage('Winner ID must be a positive integer'),
            body('category')
                .optional()
                .isAlpha()
                .withMessage('Category must contain only letters')
        ];
    }

    static validateHeadToHead() {
        return [
            query('player1Id')
                .isInt({ min: 1 })
                .withMessage('Player 1 ID must be a positive integer'),
            query('player2Id')
                .isInt({ min: 1 })
                .withMessage('Player 2 ID must be a positive integer'),
            query('limit')
                .optional()
                .isInt({ min: 1, max: 50 })
                .withMessage('Limit must be between 1 and 50')
        ];
    }

    static validateRecentGamesQuery() {
        return [
            query('limit')
                .optional()
                .isInt({ min: 1, max: 200 })
                .withMessage('Limit must be between 1 and 200'),
            query('playerId')
                .optional()
                .isInt({ min: 1 })
                .withMessage('Player ID must be a positive integer'),
            query('gameType')
                .optional()
                .isString()
                .trim()
                .isLength({ min: 1, max: 50 })
                .withMessage('Game type must be a string between 1 and 50 characters'),
            query('hours')
                .optional()
                .isInt({ min: 1, max: 168 })
                .withMessage('Hours must be between 1 and 168')
        ];
    }

    static validateStatisticsQuery() {
        return [
            query('period')
                .optional()
                .isIn(['daily', 'weekly', 'monthly'])
                .withMessage('Period must be daily, weekly, or monthly'),
            query('days')
                .optional()
                .isInt({ min: 1, max: 365 })
                .withMessage('Days must be between 1 and 365')
        ];
    }
}

module.exports = {
    LeaderboardValidation,
    SeasonValidation,
    GameValidation
};