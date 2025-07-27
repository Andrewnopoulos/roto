/**
 * Game Service
 * 
 * This service manages Rota game instances, handles game lifecycle,
 * and provides high-level game operations. It acts as the main
 * interface between the API controllers and the game logic.
 */

const { v4: uuidv4 } = require('uuid');
const RotaGame = require('../models/RotaGame');
const {
    validateGameCreation,
    validatePlacementRequest,
    validateMovementRequest,
    validateJoinGame,
    validateGameSecurity,
    validateGameState,
    validateMoveRateLimit,
    sanitizeGameStateForClient
} = require('../utils/gameValidation');

class GameService {
    constructor(database) {
        this.database = database;
        this.activeGames = new Map(); // In-memory game cache
        this.playerMoveTimestamps = new Map(); // Rate limiting
        this.cleanupInterval = setInterval(() => this.cleanupExpiredGames(), 300000); // 5 minutes
    }

    /**
     * Create a new game
     */
    async createGame(player1Id, player2Id = null) {
        // Validate input
        const validation = validateGameCreation(player1Id, player2Id);
        if (!validation.valid) {
            throw new Error(`Invalid game creation: ${validation.errors.join(', ')}`);
        }

        const { player1Id: validPlayer1, player2Id: validPlayer2 } = validation.sanitizedData;

        // Generate unique game ID
        const gameId = uuidv4();

        // Create game instance
        const game = new RotaGame(gameId, validPlayer1, validPlayer2);

        // Store in database
        await this.saveGameToDatabase(game);

        // Cache in memory
        this.activeGames.set(gameId, game);

        return {
            gameId,
            gameState: sanitizeGameStateForClient(game.getGameState(), validPlayer1),
            message: validPlayer2 ? 'Game created with both players' : 'Game created, waiting for second player'
        };
    }

    /**
     * Join an existing game
     */
    async joinGame(gameId, playerId) {
        // Validate input
        const validation = validateJoinGame(gameId, playerId);
        if (!validation.valid) {
            throw new Error(`Invalid join request: ${validation.errors.join(', ')}`);
        }

        const { gameId: validGameId, playerId: validPlayerId } = validation.sanitizedData;

        // Load game
        const game = await this.loadGame(validGameId);
        if (!game) {
            throw new Error('Game not found');
        }

        // Check if player can join
        if (game.player1Id === validPlayerId) {
            // Player 1 reconnecting
            return {
                gameId: validGameId,
                gameState: sanitizeGameStateForClient(game.getGameState(), validPlayerId),
                message: 'Reconnected to game'
            };
        } else if (game.player2Id === validPlayerId) {
            // Player 2 reconnecting
            return {
                gameId: validGameId,
                gameState: sanitizeGameStateForClient(game.getGameState(), validPlayerId),
                message: 'Reconnected to game'
            };
        } else if (!game.player2Id) {
            // Join as player 2
            game.player2Id = validPlayerId;
            await this.saveGameToDatabase(game);
            
            return {
                gameId: validGameId,
                gameState: sanitizeGameStateForClient(game.getGameState(), validPlayerId),
                message: 'Joined game as player 2'
            };
        } else {
            // Game is full, join as spectator
            game.addSpectator(validPlayerId);
            return {
                gameId: validGameId,
                gameState: sanitizeGameStateForClient(game.getGameState()),
                message: 'Joined as spectator'
            };
        }
    }

    /**
     * Make a placement move
     */
    async makeMove(gameId, playerId, moveData) {
        // Load game
        const game = await this.loadGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        // Security validation
        const securityCheck = validateGameSecurity(game, playerId, 'move');
        if (!securityCheck.valid) {
            throw new Error(`Security check failed: ${securityCheck.errors.join(', ')}`);
        }

        // Rate limiting
        const rateLimitCheck = this.checkRateLimit(playerId);
        if (!rateLimitCheck.valid) {
            throw new Error(rateLimitCheck.error);
        }

        let result;

        if (moveData.type === 'placement') {
            // Validate placement move
            const validation = validatePlacementRequest(playerId, moveData.position);
            if (!validation.valid) {
                throw new Error(`Invalid placement: ${validation.errors.join(', ')}`);
            }

            // Execute move
            result = game.placePiece(playerId, validation.sanitizedData.position);
        } else if (moveData.type === 'movement') {
            // Validate movement move
            const validation = validateMovementRequest(playerId, moveData.fromPosition, moveData.toPosition);
            if (!validation.valid) {
                throw new Error(`Invalid movement: ${validation.errors.join(', ')}`);
            }

            // Execute move
            result = game.movePiece(
                playerId, 
                validation.sanitizedData.fromPosition, 
                validation.sanitizedData.toPosition
            );
        } else {
            throw new Error('Invalid move type');
        }

        // Update rate limiting
        this.updateMoveTimestamp(playerId);

        // Save game state
        await this.saveGameToDatabase(game);

        // Update statistics if game is finished
        if (game.winner) {
            await this.updatePlayerStatistics(game);
        }

        return {
            gameId,
            gameState: sanitizeGameStateForClient(result.gameState, playerId),
            winner: result.winner,
            validMoves: game.getValidMoves()
        };
    }

    /**
     * Get game state for a player
     */
    async getGameState(gameId, playerId) {
        // Validate input
        const validation = validateJoinGame(gameId, playerId);
        if (!validation.valid) {
            throw new Error(`Invalid request: ${validation.errors.join(', ')}`);
        }

        const game = await this.loadGame(validation.sanitizedData.gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        return {
            gameId,
            gameState: sanitizeGameStateForClient(game.getGameState(), playerId),
            validMoves: game.getCurrentPlayer() === playerId ? game.getValidMoves() : []
        };
    }

    /**
     * Get list of available games for joining
     */
    async getAvailableGames() {
        const games = await this.database.getGamesWaitingForPlayers();
        return games.map(game => ({
            gameId: game.gameId,
            player1Id: game.player1Id,
            createdAt: game.createdAt
        }));
    }

    /**
     * Handle player disconnection
     */
    async handlePlayerDisconnection(gameId, playerId) {
        const game = await this.loadGame(gameId);
        if (!game) {
            return null;
        }

        const result = game.handlePlayerDisconnection(playerId);
        
        // Could implement game abandonment logic here
        // For now, just save the current state
        await this.saveGameToDatabase(game);

        return result;
    }

    /**
     * Load game from cache or database
     */
    async loadGame(gameId) {
        // Check memory cache first
        if (this.activeGames.has(gameId)) {
            return this.activeGames.get(gameId);
        }

        // Load from database
        const gameData = await this.database.getGame(gameId);
        if (!gameData) {
            return null;
        }

        // Deserialize and cache
        const game = RotaGame.deserialize(gameData);
        this.activeGames.set(gameId, game);

        return game;
    }

    /**
     * Save game to database
     */
    async saveGameToDatabase(game) {
        // Validate game state before saving
        const validation = validateGameState(game);
        if (!validation.valid) {
            throw new Error(`Invalid game state: ${validation.errors.join(', ')}`);
        }

        const serializedGame = game.serialize();
        await this.database.saveGame(serializedGame);
    }

    /**
     * Check rate limiting for moves
     */
    checkRateLimit(playerId) {
        const lastMoveTime = this.playerMoveTimestamps.get(playerId);
        return validateMoveRateLimit(playerId, lastMoveTime);
    }

    /**
     * Update move timestamp for rate limiting
     */
    updateMoveTimestamp(playerId) {
        this.playerMoveTimestamps.set(playerId, Date.now());
    }

    /**
     * Update player statistics after game completion
     */
    async updatePlayerStatistics(game) {
        if (!game.winner) return;

        const winnerId = game.winner;
        const loserId = winnerId === game.player1Id ? game.player2Id : game.player1Id;

        // Update winner stats
        await this.database.updatePlayerStats(winnerId, {
            gamesPlayed: 1,
            gamesWon: 1,
            totalMoves: game.moveHistory.filter(move => move.playerId === winnerId).length
        });

        // Update loser stats
        await this.database.updatePlayerStats(loserId, {
            gamesPlayed: 1,
            gamesLost: 1,
            totalMoves: game.moveHistory.filter(move => move.playerId === loserId).length
        });
    }

    /**
     * Clean up expired games from memory
     */
    async cleanupExpiredGames() {
        const expiredGames = [];

        for (const [gameId, game] of this.activeGames) {
            if (game.isExpired()) {
                expiredGames.push(gameId);
            }
        }

        // Remove from memory cache
        expiredGames.forEach(gameId => {
            this.activeGames.delete(gameId);
        });

        // Optionally archive to database or mark as expired
        if (expiredGames.length > 0) {
            await this.database.markGamesAsExpired(expiredGames);
        }

        console.log(`Cleaned up ${expiredGames.length} expired games`);
    }

    /**
     * Get game statistics
     */
    async getGameStatistics(gameId) {
        const game = await this.loadGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        return {
            gameId,
            duration: game.lastMoveAt - game.createdAt,
            totalMoves: game.moveHistory.length,
            phase: game.phase,
            winner: game.winner,
            moveHistory: game.moveHistory.map(move => ({
                type: move.type,
                playerId: move.playerId,
                timestamp: move.timestamp,
                // Hide specific positions for privacy
                hasPosition: !!move.position,
                hasMovement: !!(move.fromPosition && move.toPosition)
            }))
        };
    }

    /**
     * Forfeit a game
     */
    async forfeitGame(gameId, playerId) {
        const game = await this.loadGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        // Security check
        const securityCheck = validateGameSecurity(game, playerId, 'move');
        if (!securityCheck.valid) {
            throw new Error(`Cannot forfeit: ${securityCheck.errors.join(', ')}`);
        }

        if (game.phase === 'finished') {
            throw new Error('Game is already finished');
        }

        // Set winner as the opponent
        game.winner = playerId === game.player1Id ? game.player2Id : game.player1Id;
        game.phase = 'finished';
        game.lastMoveAt = new Date();

        // Add forfeit to move history
        game.moveHistory.push({
            type: 'forfeit',
            playerId,
            timestamp: new Date()
        });

        // Save and update statistics
        await this.saveGameToDatabase(game);
        await this.updatePlayerStatistics(game);

        return {
            gameId,
            gameState: sanitizeGameStateForClient(game.getGameState()),
            message: 'Game forfeited'
        };
    }

    /**
     * Cleanup on service shutdown
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

module.exports = GameService;