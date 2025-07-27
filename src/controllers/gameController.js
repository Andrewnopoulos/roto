/**
 * Game Controller
 * 
 * This controller handles HTTP requests for game operations.
 * It provides RESTful endpoints for game creation, joining,
 * move execution, and state retrieval.
 */

const GameService = require('../services/gameService');
const { body, param, validationResult } = require('express-validator');

class GameController {
    constructor(database) {
        this.gameService = new GameService(database);
        
        // Bind methods to maintain context
        this.createGame = this.createGame.bind(this);
        this.joinGame = this.joinGame.bind(this);
        this.makeMove = this.makeMove.bind(this);
        this.getGameState = this.getGameState.bind(this);
        this.getAvailableGames = this.getAvailableGames.bind(this);
        this.forfeitGame = this.forfeitGame.bind(this);
        this.getGameStatistics = this.getGameStatistics.bind(this);
    }

    /**
     * Create a new game
     * POST /api/games
     */
    async createGame(req, res) {
        try {
            // Extract player ID from session/auth
            const player1Id = req.user?.id || req.body.playerId;
            const player2Id = req.body.player2Id || null;

            if (!player1Id) {
                return res.status(400).json({
                    success: false,
                    message: 'Player ID is required'
                });
            }

            const result = await this.gameService.createGame(player1Id, player2Id);

            res.status(201).json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Error creating game:', error);
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * Join an existing game
     * POST /api/games/:gameId/join
     */
    async joinGame(req, res) {
        try {
            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid request',
                    errors: errors.array()
                });
            }

            const gameId = req.params.gameId;
            const playerId = req.user?.id || req.body.playerId;

            if (!playerId) {
                return res.status(400).json({
                    success: false,
                    message: 'Player ID is required'
                });
            }

            const result = await this.gameService.joinGame(gameId, playerId);

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Error joining game:', error);
            const statusCode = error.message.includes('not found') ? 404 : 400;
            res.status(statusCode).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * Make a move in a game
     * POST /api/games/:gameId/moves
     */
    async makeMove(req, res) {
        try {
            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid request',
                    errors: errors.array()
                });
            }

            const gameId = req.params.gameId;
            const playerId = req.user?.id || req.body.playerId;
            const moveData = {
                type: req.body.type,
                position: req.body.position,
                fromPosition: req.body.fromPosition,
                toPosition: req.body.toPosition
            };

            if (!playerId) {
                return res.status(400).json({
                    success: false,
                    message: 'Player ID is required'
                });
            }

            const result = await this.gameService.makeMove(gameId, playerId, moveData);

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Error making move:', error);
            let statusCode = 400;
            
            if (error.message.includes('not found')) {
                statusCode = 404;
            } else if (error.message.includes('not authorized') || error.message.includes('not your turn')) {
                statusCode = 403;
            } else if (error.message.includes('rate limit')) {
                statusCode = 429;
            }

            res.status(statusCode).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * Get current game state
     * GET /api/games/:gameId
     */
    async getGameState(req, res) {
        try {
            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid request',
                    errors: errors.array()
                });
            }

            const gameId = req.params.gameId;
            const playerId = req.user?.id || req.query.playerId;

            if (!playerId) {
                return res.status(400).json({
                    success: false,
                    message: 'Player ID is required'
                });
            }

            const result = await this.gameService.getGameState(gameId, playerId);

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Error getting game state:', error);
            const statusCode = error.message.includes('not found') ? 404 : 400;
            res.status(statusCode).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * Get list of available games
     * GET /api/games/available
     */
    async getAvailableGames(req, res) {
        try {
            const games = await this.gameService.getAvailableGames();

            res.json({
                success: true,
                data: {
                    games,
                    count: games.length
                }
            });

        } catch (error) {
            console.error('Error getting available games:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    /**
     * Forfeit a game
     * POST /api/games/:gameId/forfeit
     */
    async forfeitGame(req, res) {
        try {
            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid request',
                    errors: errors.array()
                });
            }

            const gameId = req.params.gameId;
            const playerId = req.user?.id || req.body.playerId;

            if (!playerId) {
                return res.status(400).json({
                    success: false,
                    message: 'Player ID is required'
                });
            }

            const result = await this.gameService.forfeitGame(gameId, playerId);

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Error forfeiting game:', error);
            let statusCode = 400;
            
            if (error.message.includes('not found')) {
                statusCode = 404;
            } else if (error.message.includes('Cannot forfeit')) {
                statusCode = 403;
            }

            res.status(statusCode).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * Get game statistics
     * GET /api/games/:gameId/stats
     */
    async getGameStatistics(req, res) {
        try {
            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid request',
                    errors: errors.array()
                });
            }

            const gameId = req.params.gameId;
            const stats = await this.gameService.getGameStatistics(gameId);

            res.json({
                success: true,
                data: stats
            });

        } catch (error) {
            console.error('Error getting game statistics:', error);
            const statusCode = error.message.includes('not found') ? 404 : 500;
            res.status(statusCode).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * Get validation middleware for routes
     */
    static getValidationRules() {
        return {
            gameId: [
                param('gameId')
                    .isUUID()
                    .withMessage('Game ID must be a valid UUID')
            ],
            
            createGame: [
                body('playerId')
                    .optional()
                    .isLength({ min: 1, max: 50 })
                    .withMessage('Player ID must be 1-50 characters'),
                body('player2Id')
                    .optional()
                    .isLength({ min: 1, max: 50 })
                    .withMessage('Player 2 ID must be 1-50 characters')
            ],
            
            joinGame: [
                param('gameId')
                    .isUUID()
                    .withMessage('Game ID must be a valid UUID'),
                body('playerId')
                    .optional()
                    .isLength({ min: 1, max: 50 })
                    .withMessage('Player ID must be 1-50 characters')
            ],
            
            makeMove: [
                param('gameId')
                    .isUUID()
                    .withMessage('Game ID must be a valid UUID'),
                body('type')
                    .isIn(['placement', 'movement'])
                    .withMessage('Move type must be placement or movement'),
                body('position')
                    .optional()
                    .isInt({ min: 0, max: 15 })
                    .withMessage('Position must be between 0 and 15'),
                body('fromPosition')
                    .optional()
                    .isInt({ min: 0, max: 15 })
                    .withMessage('From position must be between 0 and 15'),
                body('toPosition')
                    .optional()
                    .isInt({ min: 0, max: 15 })
                    .withMessage('To position must be between 0 and 15'),
                body('playerId')
                    .optional()
                    .isLength({ min: 1, max: 50 })
                    .withMessage('Player ID must be 1-50 characters')
            ]
        };
    }

    /**
     * Cleanup resources
     */
    destroy() {
        if (this.gameService) {
            this.gameService.destroy();
        }
    }
}

module.exports = GameController;