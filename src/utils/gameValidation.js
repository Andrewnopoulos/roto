/**
 * Game Validation Utilities
 * 
 * This module provides validation functions for Rota game moves
 * and game state transitions. All validation is performed server-side
 * to ensure game integrity and prevent cheating.
 */

const RotaGame = require('../models/RotaGame');

/**
 * Sanitize and validate board position input
 */
function validatePosition(position) {
    // Convert to number and validate range
    const pos = parseInt(position, 10);
    
    if (isNaN(pos) || pos < 0 || pos > 15) {
        throw new Error('Invalid board position');
    }
    
    return pos;
}

/**
 * Validate player ID format and sanitize
 */
function validatePlayerId(playerId) {
    if (!playerId || typeof playerId !== 'string') {
        throw new Error('Invalid player ID');
    }
    
    // Basic sanitization - remove any non-alphanumeric characters except dashes and underscores
    const sanitized = playerId.replace(/[^a-zA-Z0-9\-_]/g, '');
    
    if (sanitized.length === 0 || sanitized.length > 50) {
        throw new Error('Player ID must be 1-50 alphanumeric characters');
    }
    
    return sanitized;
}

/**
 * Validate game ID format
 */
function validateGameId(gameId) {
    if (!gameId || typeof gameId !== 'string') {
        throw new Error('Invalid game ID');
    }
    
    // Game IDs should be UUIDs or similar
    const sanitized = gameId.replace(/[^a-zA-Z0-9\-]/g, '');
    
    if (sanitized.length === 0 || sanitized.length > 50) {
        throw new Error('Invalid game ID format');
    }
    
    return sanitized;
}

/**
 * Validate placement move request
 */
function validatePlacementRequest(playerId, position) {
    const errors = [];
    
    try {
        validatePlayerId(playerId);
    } catch (error) {
        errors.push(error.message);
    }
    
    try {
        validatePosition(position);
    } catch (error) {
        errors.push(error.message);
    }
    
    return {
        valid: errors.length === 0,
        errors,
        sanitizedData: errors.length === 0 ? {
            playerId: validatePlayerId(playerId),
            position: validatePosition(position)
        } : null
    };
}

/**
 * Validate movement move request
 */
function validateMovementRequest(playerId, fromPosition, toPosition) {
    const errors = [];
    
    try {
        validatePlayerId(playerId);
    } catch (error) {
        errors.push(error.message);
    }
    
    try {
        validatePosition(fromPosition);
    } catch (error) {
        errors.push(`From position: ${error.message}`);
    }
    
    try {
        validatePosition(toPosition);
    } catch (error) {
        errors.push(`To position: ${error.message}`);
    }
    
    // Check that from and to positions are different
    if (fromPosition === toPosition) {
        errors.push('From and to positions must be different');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        sanitizedData: errors.length === 0 ? {
            playerId: validatePlayerId(playerId),
            fromPosition: validatePosition(fromPosition),
            toPosition: validatePosition(toPosition)
        } : null
    };
}

/**
 * Validate game creation request
 */
function validateGameCreation(player1Id, player2Id = null) {
    const errors = [];
    
    try {
        validatePlayerId(player1Id);
    } catch (error) {
        errors.push(`Player 1: ${error.message}`);
    }
    
    if (player2Id) {
        try {
            validatePlayerId(player2Id);
        } catch (error) {
            errors.push(`Player 2: ${error.message}`);
        }
        
        // Players must be different
        if (player1Id === player2Id) {
            errors.push('Players must be different');
        }
    }
    
    return {
        valid: errors.length === 0,
        errors,
        sanitizedData: errors.length === 0 ? {
            player1Id: validatePlayerId(player1Id),
            player2Id: player2Id ? validatePlayerId(player2Id) : null
        } : null
    };
}

/**
 * Rate limiting validation
 * Prevents spam moves and ensures fair play
 */
function validateMoveRateLimit(playerId, lastMoveTime, minIntervalMs = 500) {
    const now = Date.now();
    const timeSinceLastMove = now - (lastMoveTime || 0);
    
    if (timeSinceLastMove < minIntervalMs) {
        return {
            valid: false,
            error: 'Move rate limit exceeded',
            retryAfter: minIntervalMs - timeSinceLastMove
        };
    }
    
    return { valid: true };
}

/**
 * Validate game state consistency
 * Ensures the game state is internally consistent
 */
function validateGameState(game) {
    const errors = [];
    
    // Check that piece counts match board state
    let player1Count = 0;
    let player2Count = 0;
    
    Object.values(game.board).forEach(piece => {
        if (piece === 1) player1Count++;
        if (piece === 2) player2Count++;
    });
    
    if (player1Count !== game.piecesPlaced.player1) {
        errors.push('Player 1 piece count mismatch');
    }
    
    if (player2Count !== game.piecesPlaced.player2) {
        errors.push('Player 2 piece count mismatch');
    }
    
    // Check phase consistency
    const totalPlaced = game.piecesPlaced.player1 + game.piecesPlaced.player2;
    
    if (game.phase === 'placement' && totalPlaced === 6) {
        errors.push('Should be in movement phase');
    }
    
    if (game.phase === 'movement' && totalPlaced < 6) {
        errors.push('Should be in placement phase');
    }
    
    // Check current player is valid
    if (game.currentPlayerIndex !== 0 && game.currentPlayerIndex !== 1) {
        errors.push('Invalid current player index');
    }
    
    // Check winner consistency
    if (game.winner && game.phase !== 'finished') {
        errors.push('Game has winner but is not finished');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Sanitize game state for client transmission
 * Removes sensitive server-side data
 */
function sanitizeGameStateForClient(gameState, requestingPlayerId = null) {
    const sanitized = {
        gameId: gameState.gameId,
        player1Id: gameState.player1Id,
        player2Id: gameState.player2Id,
        currentPlayer: gameState.currentPlayer,
        phase: gameState.phase,
        board: gameState.board,
        piecesPlaced: gameState.piecesPlaced,
        winner: gameState.winner,
        lastMoveAt: gameState.lastMoveAt,
        moveCount: gameState.moveCount
    };
    
    // Add player-specific information if requesting player is specified
    if (requestingPlayerId) {
        sanitized.isYourTurn = gameState.currentPlayer === requestingPlayerId;
        sanitized.yourPlayerNumber = gameState.player1Id === requestingPlayerId ? 1 : 
                                   gameState.player2Id === requestingPlayerId ? 2 : null;
    }
    
    return sanitized;
}

/**
 * Validate join game request
 */
function validateJoinGame(gameId, playerId) {
    const errors = [];
    
    try {
        validateGameId(gameId);
    } catch (error) {
        errors.push(error.message);
    }
    
    try {
        validatePlayerId(playerId);
    } catch (error) {
        errors.push(error.message);
    }
    
    return {
        valid: errors.length === 0,
        errors,
        sanitizedData: errors.length === 0 ? {
            gameId: validateGameId(gameId),
            playerId: validatePlayerId(playerId)
        } : null
    };
}

/**
 * Security checks for game actions
 */
function validateGameSecurity(game, playerId, action) {
    const errors = [];
    
    // Check if player is part of the game
    if (playerId !== game.player1Id && playerId !== game.player2Id) {
        errors.push('Player not authorized for this game');
    }
    
    // Check game state for specific actions
    switch (action) {
        case 'move':
            if (game.phase === 'finished') {
                errors.push('Game is already finished');
            }
            if (!game.player2Id) {
                errors.push('Game needs second player');
            }
            break;
            
        case 'spectate':
            // Spectating is generally allowed
            break;
            
        default:
            errors.push('Unknown action');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

module.exports = {
    validatePosition,
    validatePlayerId,
    validateGameId,
    validatePlacementRequest,
    validateMovementRequest,
    validateGameCreation,
    validateMoveRateLimit,
    validateGameState,
    sanitizeGameStateForClient,
    validateJoinGame,
    validateGameSecurity
};