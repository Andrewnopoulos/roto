/**
 * Game Management Routes
 * 
 * Handles game room creation, joining, and management operations.
 * Implements proper authorization to ensure users can only perform
 * actions they're permitted to do based on their role in the game.
 */

const express = require('express');
const router = express.Router();

// Import middleware and utilities
const { validateRequest, validationRules } = require('../middleware/security');
const { asyncHandler } = require('../middleware/errorHandler');
const authMiddleware = require('../middleware/auth');

// Import controllers (to be implemented)
const gameController = require('../controllers/gameController');

/**
 * GET /api/games/active
 * Get list of active/public game rooms
 * 
 * Query: { page?, limit?, difficulty?, status? }
 * Response: { success, games, pagination }
 */
router.get('/active',
  asyncHandler(gameController.getActiveGames)
);

/**
 * GET /api/games/:gameId
 * Get specific game room details
 * 
 * Params: { gameId }
 * Response: { success, game }
 */
router.get('/:gameId',
  asyncHandler(gameController.getGame)
);

// Authentication required for routes below
router.use(authMiddleware.authenticate);

/**
 * POST /api/games/create
 * Create a new game room
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Body: { name, isPrivate?, maxPlayers?, difficulty?, settings? }
 * Response: { success, game }
 */
router.post('/create',
  [
    // Add validation rules for game creation
    validateRequest
  ],
  asyncHandler(gameController.createGame)
);

/**
 * POST /api/games/:gameId/join
 * Join an existing game room
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { gameId }
 * Body: { password? }
 * Response: { success, game, playerRole }
 */
router.post('/:gameId/join',
  asyncHandler(gameController.joinGame)
);

/**
 * POST /api/games/:gameId/leave
 * Leave a game room
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { gameId }
 * Response: { success, message }
 */
router.post('/:gameId/leave',
  asyncHandler(gameController.leaveGame)
);

/**
 * PUT /api/games/:gameId/settings
 * Update game room settings (host only)
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { gameId }
 * Body: { name?, maxPlayers?, isPrivate?, settings? }
 * Response: { success, game }
 */
router.put('/:gameId/settings',
  asyncHandler(gameController.updateGameSettings)
);

/**
 * POST /api/games/:gameId/start
 * Start the game (host only)
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { gameId }
 * Response: { success, game }
 */
router.post('/:gameId/start',
  asyncHandler(gameController.startGame)
);

/**
 * POST /api/games/:gameId/pause
 * Pause the game (host only)
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { gameId }
 * Response: { success, game }
 */
router.post('/:gameId/pause',
  asyncHandler(gameController.pauseGame)
);

/**
 * POST /api/games/:gameId/resume
 * Resume a paused game (host only)
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { gameId }
 * Response: { success, game }
 */
router.post('/:gameId/resume',
  asyncHandler(gameController.resumeGame)
);

/**
 * DELETE /api/games/:gameId
 * Delete/end a game room (host only)
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { gameId }
 * Response: { success, message }
 */
router.delete('/:gameId',
  asyncHandler(gameController.deleteGame)
);

/**
 * GET /api/games/:gameId/players
 * Get list of players in a game room
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { gameId }
 * Response: { success, players }
 */
router.get('/:gameId/players',
  asyncHandler(gameController.getGamePlayers)
);

/**
 * POST /api/games/:gameId/kick/:playerId
 * Kick a player from the game (host only)
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { gameId, playerId }
 * Response: { success, message }
 */
router.post('/:gameId/kick/:playerId',
  asyncHandler(gameController.kickPlayer)
);

/**
 * GET /api/games/:gameId/state
 * Get current game state (for players in the game)
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { gameId }
 * Response: { success, gameState }
 */
router.get('/:gameId/state',
  asyncHandler(gameController.getGameState)
);

/**
 * POST /api/games/:gameId/move
 * Make a move in the game
 * 
 * Headers: { Authorization: "Bearer <token>" }
 * Params: { gameId }
 * Body: { move }
 * Response: { success, gameState, isValid }
 */
router.post('/:gameId/move',
  asyncHandler(gameController.makeMove)
);

module.exports = router;