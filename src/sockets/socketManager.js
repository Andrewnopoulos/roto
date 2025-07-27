/**
 * Socket.io Management
 * 
 * Handles WebSocket connections for real-time game communication.
 * Implements proper connection management, authentication, and
 * event handling for the multiplayer Rota game platform.
 * 
 * Features:
 * - Connection authentication
 * - Room management for games
 * - Real-time game state synchronization
 * - Player presence management
 * - Comprehensive error handling and logging
 */

const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const logger = require('../utils/logger');

// Socket.io instance
let io = null;

// Active connections store
const activeConnections = new Map(); // userId -> { socketId, gameId?, lastActivity }
const gameRooms = new Map(); // gameId -> { players: Set, watchers: Set, gameState }

/**
 * Initialize Socket.io with event handlers
 * @param {Object} socketIo - Socket.io server instance
 */
function initialize(socketIo) {
  io = socketIo;
  
  // Simplified authentication for compatibility with existing system
  io.use(async (socket, next) => {
    try {
      // For now, we'll create a temporary user session
      // This should be replaced with proper authentication in production
      const username = socket.handshake.query.username || 'Guest';
      
      // Create or get user session
      socket.user = {
        id: socket.id, // Use socket ID as temporary user ID
        username: username,
        role: 'player',
        status: 'active'
      };
      
      logger.info('Socket connected (simplified auth)', {
        userId: socket.user.id,
        username: socket.user.username,
        socketId: socket.id
      });
      
      next();
      
    } catch (error) {
      logger.warn('Socket connection failed', {
        error: error.message,
        socketId: socket.id,
        ip: socket.handshake.address
      });
      
      next(new Error('Connection failed'));
    }
  });
  
  // Handle new connections
  io.on('connection', (socket) => {
    handleConnection(socket);
  });
  
  logger.info('Socket.io manager initialized successfully');
}

/**
 * Handle new socket connection
 * @param {Object} socket - Socket instance
 */
function handleConnection(socket) {
  const user = socket.user;
  
  logger.info('User connected via socket', {
    userId: user.id,
    username: user.username,
    socketId: socket.id
  });
  
  // Store active connection
  activeConnections.set(user.id, {
    socketId: socket.id,
    gameId: null,
    lastActivity: Date.now()
  });
  
  // Update user online status
  updateUserOnlineStatus(user.id, true);
  
  // Send initial connection data
  socket.emit('connected', {
    userId: user.id,
    username: user.username,
    timestamp: new Date().toISOString()
  });
  
  // Register event handlers
  registerSocketEvents(socket);
  
  // Handle disconnection
  socket.on('disconnect', (reason) => {
    handleDisconnection(socket, reason);
  });
}

/**
 * Register all socket event handlers
 * @param {Object} socket - Socket instance
 */
function registerSocketEvents(socket) {
  const user = socket.user;
  
  // Game-related events
  socket.on('join_game', async (data) => {
    try {
      await handleJoinGame(socket, data);
    } catch (error) {
      logger.error('Error joining game via socket', {
        userId: user.id,
        error: error.message,
        data
      });
      socket.emit('error', { message: 'Failed to join game', error: error.message });
    }
  });
  
  socket.on('leave_game', async (data) => {
    try {
      await handleLeaveGame(socket, data);
    } catch (error) {
      logger.error('Error leaving game via socket', {
        userId: user.id,
        error: error.message,
        data
      });
      socket.emit('error', { message: 'Failed to leave game', error: error.message });
    }
  });
  
  socket.on('game_move', async (data) => {
    try {
      await handleGameMove(socket, data);
    } catch (error) {
      logger.error('Error processing game move', {
        userId: user.id,
        error: error.message,
        data
      });
      socket.emit('error', { message: 'Invalid move', error: error.message });
    }
  });
  
  socket.on('chat_message', async (data) => {
    try {
      await handleChatMessage(socket, data);
    } catch (error) {
      logger.error('Error processing chat message', {
        userId: user.id,
        error: error.message,
        data
      });
      socket.emit('error', { message: 'Failed to send message', error: error.message });
    }
  });
  
  // Presence events
  socket.on('heartbeat', () => {
    const connection = activeConnections.get(user.id);
    if (connection) {
      connection.lastActivity = Date.now();
      activeConnections.set(user.id, connection);
    }
  });
  
  // Enhanced matchmaking events
  socket.on('playerLogin', async (data) => {
    try {
      await handlePlayerLogin(socket, data);
    } catch (error) {
      logger.error('Error processing player login', {
        userId: user.id,
        error: error.message,
        data
      });
      socket.emit('loginError', { message: 'Login failed', error: error.message });
    }
  });
  
  socket.on('joinMatchmakingQueue', async (data) => {
    try {
      await handleJoinMatchmakingQueue(socket, data);
    } catch (error) {
      logger.error('Error joining matchmaking queue', {
        userId: user.id,
        error: error.message,
        data
      });
      socket.emit('error', { message: 'Failed to join queue', error: error.message });
    }
  });
  
  socket.on('leaveMatchmakingQueue', async (data) => {
    try {
      await handleLeaveMatchmakingQueue(socket, data);
    } catch (error) {
      logger.error('Error leaving matchmaking queue', {
        userId: user.id,
        error: error.message
      });
      socket.emit('error', { message: 'Failed to leave queue', error: error.message });
    }
  });
  
  socket.on('getPlayerProfile', async (data) => {
    try {
      await handleGetPlayerProfile(socket, data);
    } catch (error) {
      logger.error('Error getting player profile', {
        userId: user.id,
        error: error.message,
        data
      });
      socket.emit('error', { message: 'Failed to get profile', error: error.message });
    }
  });
  
  // General events
  socket.on('ping', (callback) => {
    if (typeof callback === 'function') {
      callback('pong');
    }
  });
}

/**
 * Handle user joining a game room
 * @param {Object} socket - Socket instance
 * @param {Object} data - Game join data
 */
async function handleJoinGame(socket, data) {
  const { gameId } = data;
  const user = socket.user;
  
  if (!gameId) {
    throw new Error('Game ID is required');
  }
  
  // Verify user is allowed to join this game
  const gameResult = await query(`
    SELECT g.*, 
           gp1.user_id as player1_id, gp2.user_id as player2_id
    FROM games g
    LEFT JOIN game_participants gp1 ON g.id = gp1.game_id AND gp1.player_number = 1
    LEFT JOIN game_participants gp2 ON g.id = gp2.game_id AND gp2.player_number = 2
    WHERE g.id = $1
  `, [gameId]);
  
  if (gameResult.rows.length === 0) {
    throw new Error('Game not found');
  }
  
  const game = gameResult.rows[0];
  const isPlayer = game.player1_id === user.id || game.player2_id === user.id;
  
  if (!isPlayer && game.status !== 'waiting' && !game.allow_spectators) {
    throw new Error('Cannot join this game');
  }
  
  // Join socket room
  socket.join(`game_${gameId}`);
  
  // Update connection info
  const connection = activeConnections.get(user.id);
  if (connection) {
    connection.gameId = gameId;
    activeConnections.set(user.id, connection);
  }
  
  // Add to game room tracking
  if (!gameRooms.has(gameId)) {
    gameRooms.set(gameId, {
      players: new Set(),
      watchers: new Set(),
      gameState: null
    });
  }
  
  const gameRoom = gameRooms.get(gameId);
  
  if (isPlayer) {
    gameRoom.players.add(user.id);
  } else {
    gameRoom.watchers.add(user.id);
  }
  
  // Notify other users in the game
  socket.to(`game_${gameId}`).emit('user_joined_game', {
    userId: user.id,
    username: user.username,
    isPlayer,
    timestamp: new Date().toISOString()
  });
  
  // Send current game state to the joining user
  if (gameRoom.gameState) {
    socket.emit('game_state_update', gameRoom.gameState);
  }
  
  logger.info('User joined game room', {
    userId: user.id,
    gameId,
    isPlayer,
    playersCount: gameRoom.players.size,
    watchersCount: gameRoom.watchers.size
  });
}

/**
 * Handle user leaving a game room
 * @param {Object} socket - Socket instance
 * @param {Object} data - Game leave data
 */
async function handleLeaveGame(socket, data) {
  const { gameId } = data;
  const user = socket.user;
  
  if (!gameId) {
    throw new Error('Game ID is required');
  }
  
  // Leave socket room
  socket.leave(`game_${gameId}`);
  
  // Update connection info
  const connection = activeConnections.get(user.id);
  if (connection && connection.gameId === gameId) {
    connection.gameId = null;
    activeConnections.set(user.id, connection);
  }
  
  // Remove from game room tracking
  const gameRoom = gameRooms.get(gameId);
  if (gameRoom) {
    gameRoom.players.delete(user.id);
    gameRoom.watchers.delete(user.id);
    
    // Notify other users
    socket.to(`game_${gameId}`).emit('user_left_game', {
      userId: user.id,
      username: user.username,
      timestamp: new Date().toISOString()
    });
    
    // Clean up empty game rooms
    if (gameRoom.players.size === 0 && gameRoom.watchers.size === 0) {
      gameRooms.delete(gameId);
    }
  }
  
  logger.info('User left game room', {
    userId: user.id,
    gameId
  });
}

/**
 * Handle game move from player
 * @param {Object} socket - Socket instance
 * @param {Object} data - Move data
 */
async function handleGameMove(socket, data) {
  const { gameId, move } = data;
  const user = socket.user;
  
  // Validate move data
  if (!gameId || !move) {
    throw new Error('Game ID and move data are required');
  }
  
  // Verify user is a player in this game
  const gameResult = await query(`
    SELECT gp.player_number, g.status, g.current_turn
    FROM game_participants gp
    JOIN games g ON gp.game_id = g.id
    WHERE gp.game_id = $1 AND gp.user_id = $2
  `, [gameId, user.id]);
  
  if (gameResult.rows.length === 0) {
    throw new Error('Not a player in this game');
  }
  
  const gameData = gameResult.rows[0];
  
  if (gameData.status !== 'in_progress') {
    throw new Error('Game is not in progress');
  }
  
  if (gameData.current_turn !== gameData.player_number) {
    throw new Error('Not your turn');
  }
  
  // TODO: Implement actual game logic validation here
  // For now, we'll just broadcast the move
  
  // Update game state in database
  // This would include move validation and game state updates
  
  // Broadcast move to all players and watchers
  socket.to(`game_${gameId}`).emit('game_move', {
    userId: user.id,
    username: user.username,
    move,
    timestamp: new Date().toISOString()
  });
  
  logger.info('Game move processed', {
    userId: user.id,
    gameId,
    move
  });
}

/**
 * Handle chat message in game
 * @param {Object} socket - Socket instance
 * @param {Object} data - Chat message data
 */
async function handleChatMessage(socket, data) {
  const { gameId, message } = data;
  const user = socket.user;
  
  if (!gameId || !message || message.trim().length === 0) {
    throw new Error('Game ID and message are required');
  }
  
  if (message.length > 500) {
    throw new Error('Message too long');
  }
  
  // Verify user is in the game
  const connection = activeConnections.get(user.id);
  if (!connection || connection.gameId !== gameId) {
    throw new Error('Not in this game');
  }
  
  // TODO: Add profanity filter and rate limiting for chat
  
  // Broadcast message to game room
  io.to(`game_${gameId}`).emit('chat_message', {
    userId: user.id,
    username: user.username,
    message: message.trim(),
    timestamp: new Date().toISOString()
  });
  
  logger.debug('Chat message sent', {
    userId: user.id,
    gameId,
    messageLength: message.length
  });
}

/**
 * Handle socket disconnection
 * @param {Object} socket - Socket instance
 * @param {string} reason - Disconnection reason
 */
function handleDisconnection(socket, reason) {
  const user = socket.user;
  
  logger.info('User disconnected via socket', {
    userId: user.id,
    username: user.username,
    socketId: socket.id,
    reason
  });
  
  // Get connection info before removing
  const connection = activeConnections.get(user.id);
  
  // Remove from active connections
  activeConnections.delete(user.id);
  
  // Update user online status
  updateUserOnlineStatus(user.id, false);
  
  // Handle game-specific disconnection
  if (connection && connection.gameId) {
    const gameRoom = gameRooms.get(connection.gameId);
    if (gameRoom) {
      gameRoom.players.delete(user.id);
      gameRoom.watchers.delete(user.id);
      
      // Notify other users in the game
      socket.to(`game_${connection.gameId}`).emit('user_disconnected', {
        userId: user.id,
        username: user.username,
        timestamp: new Date().toISOString()
      });
    }
  }
}

/**
 * Update user online status in database
 * @param {string} userId - User ID
 * @param {boolean} isOnline - Online status
 */
async function updateUserOnlineStatus(userId, isOnline) {
  try {
    await query(`
      UPDATE users 
      SET is_online = $1, last_activity_at = NOW()
      WHERE id = $2
    `, [isOnline, userId]);
  } catch (error) {
    logger.error('Failed to update user online status', {
      userId,
      isOnline,
      error: error.message
    });
  }
}

/**
 * Get active connections count
 * @returns {number} Number of active connections
 */
function getActiveConnectionsCount() {
  return activeConnections.size;
}

/**
 * Get active game rooms count
 * @returns {number} Number of active game rooms
 */
function getActiveGameRoomsCount() {
  return gameRooms.size;
}

/**
 * Broadcast message to all connected users
 * @param {string} event - Event name
 * @param {Object} data - Data to broadcast
 */
function broadcastToAll(event, data) {
  if (io) {
    io.emit(event, data);
    logger.info('Broadcast sent to all users', { event, dataKeys: Object.keys(data) });
  }
}

/**
 * Send message to specific user if online
 * @param {string} userId - User ID
 * @param {string} event - Event name
 * @param {Object} data - Data to send
 */
function sendToUser(userId, event, data) {
  const connection = activeConnections.get(userId);
  if (connection && io) {
    io.to(connection.socketId).emit(event, data);
    logger.debug('Message sent to user', { userId, event });
    return true;
  }
  return false;
}

/**
 * Enhanced Matchmaking Event Handlers
 */

/**
 * Handle player login and profile loading
 * @param {Object} socket - Socket instance
 * @param {Object} data - Login data
 */
async function handlePlayerLogin(socket, data) {
  const { username } = data;
  const user = socket.user;
  
  if (!username || username.trim().length === 0) {
    throw new Error('Username is required');
  }
  
  try {
    // Update user with provided username
    user.username = username.trim();
    
    // For demonstration, create mock profile data
    // In production, this would come from database
    const mockProfile = {
      username: username.trim(),
      rating: 1200 + Math.floor(Math.random() * 400), // Random rating between 1200-1600
      gamesPlayed: Math.floor(Math.random() * 50),
      wins: 0,
      losses: 0,
      currentStreak: 0,
      bestStreak: 0,
      globalRank: Math.floor(Math.random() * 1000) + 1,
      ratingHistory: [
        { rating: 1200, date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        { rating: 1180, date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
        { rating: 1220, date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
        { rating: 1240, date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) }
      ],
      recentMatches: [
        {
          gameId: 'demo1',
          result: 'win',
          opponentName: 'TestPlayer1',
          gameType: 'Ranked',
          ratingChange: 15,
          date: new Date(Date.now() - 2 * 60 * 60 * 1000)
        },
        {
          gameId: 'demo2',
          result: 'loss',
          opponentName: 'TestPlayer2',
          gameType: 'Casual',
          ratingChange: -12,
          date: new Date(Date.now() - 4 * 60 * 60 * 1000)
        }
      ],
      achievements: [
        {
          id: 'first_win',
          name: 'First Victory',
          description: 'Win your first game',
          unlockedAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      ]
    };
    
    // Calculate wins/losses from games played
    mockProfile.wins = Math.floor(mockProfile.gamesPlayed * 0.6);
    mockProfile.losses = mockProfile.gamesPlayed - mockProfile.wins;
    
    const playerData = {
      player: {
        id: user.id,
        name: username.trim(),
        playerNumber: null,
        rating: mockProfile.rating
      },
      profile: mockProfile
    };
    
    socket.emit('loginSuccess', playerData);
    
    logger.info('Player login successful (demo mode)', {
      userId: user.id,
      username: username.trim(),
      rating: mockProfile.rating,
      gamesPlayed: mockProfile.gamesPlayed
    });
    
  } catch (error) {
    logger.error('Failed to handle player login', {
      userId: user.id,
      username: username,
      error: error.message
    });
    throw error;
  }
}

/**
 * Handle joining matchmaking queue
 * @param {Object} socket - Socket instance
 * @param {Object} data - Queue join data
 */
async function handleJoinMatchmakingQueue(socket, data) {
  const { ranked, preferences } = data;
  const user = socket.user;
  
  try {
    // For demonstration, simulate queue joining
    const mockQueueEntry = {
      joinedAt: new Date(),
      preferences: {
        ranked: ranked || false,
        gameMode: preferences?.gameMode || 'standard',
        allowSpectators: preferences?.allowSpectators !== false
      },
      playerRating: 1200 + Math.floor(Math.random() * 400),
      ratingRange: 100
    };
    
    socket.emit('queueJoined', {
      success: true,
      queueEntry: mockQueueEntry,
      estimatedWaitTime: 30000 + Math.random() * 60000 // 30-90 seconds
    });
    
    // Simulate queue updates
    setTimeout(() => {
      socket.emit('queueUpdate', {
        estimatedWaitTime: 15000,
        ratingRange: 150,
        playerRating: mockQueueEntry.playerRating
      });
    }, 10000);
    
    // Simulate finding a match after some time
    setTimeout(() => {
      socket.emit('matchFound', {
        gameId: 'demo_game_' + Date.now(),
        opponent: {
          username: 'DemoOpponent',
          rating: mockQueueEntry.playerRating + (Math.random() - 0.5) * 200
        }
      });
    }, 20000 + Math.random() * 30000);
    
    logger.info('Player joined matchmaking queue via socket (demo mode)', {
      userId: user.id,
      ranked: ranked,
      rating: mockQueueEntry.playerRating
    });
    
  } catch (error) {
    logger.error('Failed to join matchmaking queue via socket', {
      userId: user.id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Handle leaving matchmaking queue
 * @param {Object} socket - Socket instance
 * @param {Object} data - Queue leave data
 */
async function handleLeaveMatchmakingQueue(socket, data) {
  const user = socket.user;
  
  try {
    // For demonstration, always succeed
    socket.emit('queueLeft', {
      success: true,
      message: 'Successfully left matchmaking queue'
    });
    
    logger.info('Player left matchmaking queue via socket (demo mode)', {
      userId: user.id
    });
    
  } catch (error) {
    logger.error('Failed to leave matchmaking queue via socket', {
      userId: user.id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Handle getting player profile
 * @param {Object} socket - Socket instance
 * @param {Object} data - Profile request data
 */
async function handleGetPlayerProfile(socket, data) {
  const { userId } = data;
  const requestingUser = socket.user;
  
  try {
    // For demonstration, create mock profile data
    const mockProfile = {
      username: requestingUser.username || 'DemoPlayer',
      rating: 1200 + Math.floor(Math.random() * 400),
      gamesPlayed: Math.floor(Math.random() * 50),
      wins: 0,
      losses: 0,
      currentStreak: Math.floor(Math.random() * 5),
      bestStreak: Math.floor(Math.random() * 10) + 5,
      globalRank: Math.floor(Math.random() * 1000) + 1,
      ratingHistory: [
        { rating: 1200, date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        { rating: 1180, date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
        { rating: 1220, date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
        { rating: 1240, date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) }
      ],
      recentMatches: [
        {
          gameId: 'demo1',
          result: 'win',
          opponentName: 'TestPlayer1',
          gameType: 'Ranked',
          ratingChange: 15,
          date: new Date(Date.now() - 2 * 60 * 60 * 1000)
        },
        {
          gameId: 'demo2',
          result: 'loss',
          opponentName: 'TestPlayer2',
          gameType: 'Casual',
          ratingChange: -12,
          date: new Date(Date.now() - 4 * 60 * 60 * 1000)
        }
      ],
      achievements: [
        {
          id: 'first_win',
          name: 'First Victory',
          description: 'Win your first game',
          unlockedAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      ]
    };
    
    // Calculate wins/losses
    mockProfile.wins = Math.floor(mockProfile.gamesPlayed * 0.6);
    mockProfile.losses = mockProfile.gamesPlayed - mockProfile.wins;
    
    socket.emit('playerProfile', mockProfile);
    
    logger.info('Player profile sent via socket (demo mode)', {
      requestingUserId: requestingUser.id,
      username: mockProfile.username
    });
    
  } catch (error) {
    logger.error('Failed to get player profile via socket', {
      requestingUserId: requestingUser.id,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  initialize,
  getActiveConnectionsCount,
  getActiveGameRoomsCount,
  broadcastToAll,
  sendToUser,
  // Export handler functions for external use
  handlePlayerLogin,
  handleJoinMatchmakingQueue,
  handleLeaveMatchmakingQueue,
  handleGetPlayerProfile
};