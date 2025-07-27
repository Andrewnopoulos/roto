/**
 * Game WebSocket Handler
 * 
 * This module handles real-time communication for Rota games.
 * It manages WebSocket connections, game rooms, and real-time
 * updates for game state changes.
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const GameService = require('../services/gameService');
const { validateGameId, validatePlayerId } = require('../utils/gameValidation');

class GameWebSocketHandler {
    constructor(server, database) {
        this.wss = new WebSocket.Server({ 
            server,
            path: '/ws/game',
            clientTracking: true
        });
        
        this.gameService = new GameService(database);
        this.database = database;
        this.connections = new Map(); // connectionId -> connection info
        this.gameRooms = new Map(); // gameId -> Set of connectionIds
        this.playerConnections = new Map(); // playerId -> Set of connectionIds
        
        this.setupWebSocketServer();
        this.setupHeartbeat();
    }

    /**
     * Setup WebSocket server and event handlers
     */
    setupWebSocketServer() {
        this.wss.on('connection', (ws, request) => {
            const connectionId = uuidv4();
            const clientIP = request.socket.remoteAddress;
            
            console.log(`WebSocket connection established: ${connectionId} from ${clientIP}`);
            
            // Initialize connection
            const connectionInfo = {
                id: connectionId,
                ws,
                playerId: null,
                gameId: null,
                isAlive: true,
                connectedAt: new Date(),
                lastHeartbeat: new Date(),
                clientIP
            };
            
            this.connections.set(connectionId, connectionInfo);
            
            // Setup message handler
            ws.on('message', (data) => {
                this.handleMessage(connectionId, data);
            });
            
            // Setup close handler
            ws.on('close', () => {
                this.handleDisconnection(connectionId);
            });
            
            // Setup error handler
            ws.on('error', (error) => {
                console.error(`WebSocket error for ${connectionId}:`, error);
                this.handleDisconnection(connectionId);
            });
            
            // Setup pong handler for heartbeat
            ws.on('pong', () => {
                const conn = this.connections.get(connectionId);
                if (conn) {
                    conn.isAlive = true;
                    conn.lastHeartbeat = new Date();
                }
            });
            
            // Send connection confirmation
            this.sendMessage(connectionId, {
                type: 'connection',
                connectionId,
                message: 'Connected to game server'
            });
        });
    }

    /**
     * Handle incoming WebSocket messages
     */
    async handleMessage(connectionId, data) {
        try {
            const connection = this.connections.get(connectionId);
            if (!connection) return;

            let message;
            try {
                message = JSON.parse(data.toString());
            } catch (error) {
                this.sendError(connectionId, 'Invalid JSON message');
                return;
            }

            // Validate message structure
            if (!message.type) {
                this.sendError(connectionId, 'Message type is required');
                return;
            }

            console.log(`WebSocket message from ${connectionId}:`, message.type);

            switch (message.type) {
                case 'join_game':
                    await this.handleJoinGame(connectionId, message);
                    break;
                    
                case 'leave_game':
                    await this.handleLeaveGame(connectionId, message);
                    break;
                    
                case 'make_move':
                    await this.handleMakeMove(connectionId, message);
                    break;
                    
                case 'get_game_state':
                    await this.handleGetGameState(connectionId, message);
                    break;
                    
                case 'heartbeat':
                    this.handleHeartbeat(connectionId);
                    break;
                    
                default:
                    this.sendError(connectionId, `Unknown message type: ${message.type}`);
            }
            
        } catch (error) {
            console.error(`Error handling message from ${connectionId}:`, error);
            this.sendError(connectionId, 'Internal server error');
        }
    }

    /**
     * Handle player joining a game
     */
    async handleJoinGame(connectionId, message) {
        try {
            const { gameId, playerId } = message;
            
            if (!gameId || !playerId) {
                this.sendError(connectionId, 'gameId and playerId are required');
                return;
            }

            // Validate inputs
            const validGameId = validateGameId(gameId);
            const validPlayerId = validatePlayerId(playerId);

            // Join game through service
            const result = await this.gameService.joinGame(validGameId, validPlayerId);
            
            // Update connection info
            const connection = this.connections.get(connectionId);
            connection.gameId = validGameId;
            connection.playerId = validPlayerId;
            
            // Add to game room
            if (!this.gameRooms.has(validGameId)) {
                this.gameRooms.set(validGameId, new Set());
            }
            this.gameRooms.get(validGameId).add(connectionId);
            
            // Add to player connections
            if (!this.playerConnections.has(validPlayerId)) {
                this.playerConnections.set(validPlayerId, new Set());
            }
            this.playerConnections.get(validPlayerId).add(connectionId);
            
            // Create session in database
            await this.database.createGameSession(connectionId, validGameId, validPlayerId);
            
            // Send success response
            this.sendMessage(connectionId, {
                type: 'game_joined',
                data: result
            });
            
            // Notify other players in the game
            this.broadcastToGame(validGameId, {
                type: 'player_joined',
                playerId: validPlayerId,
                gameState: result.gameState
            }, connectionId);
            
        } catch (error) {
            console.error('Error joining game:', error);
            this.sendError(connectionId, error.message);
        }
    }

    /**
     * Handle player leaving a game
     */
    async handleLeaveGame(connectionId, message) {
        const connection = this.connections.get(connectionId);
        if (!connection || !connection.gameId) {
            this.sendError(connectionId, 'Not in a game');
            return;
        }

        await this.removeFromGame(connectionId);
        
        this.sendMessage(connectionId, {
            type: 'game_left',
            message: 'Left game successfully'
        });
    }

    /**
     * Handle move execution
     */
    async handleMakeMove(connectionId, message) {
        try {
            const connection = this.connections.get(connectionId);
            if (!connection || !connection.gameId || !connection.playerId) {
                this.sendError(connectionId, 'Must be in a game to make moves');
                return;
            }

            const { moveData } = message;
            if (!moveData) {
                this.sendError(connectionId, 'moveData is required');
                return;
            }

            // Execute move through service
            const result = await this.gameService.makeMove(
                connection.gameId,
                connection.playerId,
                moveData
            );

            // Send response to player
            this.sendMessage(connectionId, {
                type: 'move_result',
                data: result
            });

            // Broadcast game state update to all players in the game
            this.broadcastToGame(connection.gameId, {
                type: 'game_updated',
                gameState: result.gameState,
                lastMove: {
                    playerId: connection.playerId,
                    moveData
                }
            });

            // If game finished, send special notification
            if (result.winner) {
                this.broadcastToGame(connection.gameId, {
                    type: 'game_finished',
                    winner: result.winner,
                    gameState: result.gameState
                });
            }

        } catch (error) {
            console.error('Error making move:', error);
            this.sendError(connectionId, error.message);
        }
    }

    /**
     * Handle game state request
     */
    async handleGetGameState(connectionId, message) {
        try {
            const connection = this.connections.get(connectionId);
            if (!connection || !connection.gameId || !connection.playerId) {
                this.sendError(connectionId, 'Must be in a game');
                return;
            }

            const result = await this.gameService.getGameState(
                connection.gameId,
                connection.playerId
            );

            this.sendMessage(connectionId, {
                type: 'game_state',
                data: result
            });

        } catch (error) {
            console.error('Error getting game state:', error);
            this.sendError(connectionId, error.message);
        }
    }

    /**
     * Handle heartbeat message
     */
    handleHeartbeat(connectionId) {
        const connection = this.connections.get(connectionId);
        if (connection) {
            connection.isAlive = true;
            connection.lastHeartbeat = new Date();
            
            // Update database session
            this.database.updateSessionHeartbeat(connectionId).catch(err => {
                console.error('Error updating session heartbeat:', err);
            });
        }
        
        this.sendMessage(connectionId, {
            type: 'heartbeat_ack',
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Handle client disconnection
     */
    async handleDisconnection(connectionId) {
        console.log(`WebSocket disconnection: ${connectionId}`);
        
        const connection = this.connections.get(connectionId);
        if (!connection) return;

        // Remove from game room
        if (connection.gameId) {
            await this.removeFromGame(connectionId);
        }

        // Remove from connections
        this.connections.delete(connectionId);
        
        // Remove from database
        await this.database.removeGameSession(connectionId).catch(err => {
            console.error('Error removing session:', err);
        });
    }

    /**
     * Remove connection from game and notify others
     */
    async removeFromGame(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection || !connection.gameId) return;

        const { gameId, playerId } = connection;

        // Remove from game room
        const gameRoom = this.gameRooms.get(gameId);
        if (gameRoom) {
            gameRoom.delete(connectionId);
            if (gameRoom.size === 0) {
                this.gameRooms.delete(gameId);
            }
        }

        // Remove from player connections
        const playerConns = this.playerConnections.get(playerId);
        if (playerConns) {
            playerConns.delete(connectionId);
            if (playerConns.size === 0) {
                this.playerConnections.delete(playerId);
            }
        }

        // Update connection info
        connection.gameId = null;
        connection.playerId = null;

        // Notify other players
        this.broadcastToGame(gameId, {
            type: 'player_disconnected',
            playerId
        }, connectionId);

        // Handle disconnection in game service
        await this.gameService.handlePlayerDisconnection(gameId, playerId);
    }

    /**
     * Send message to a specific connection
     */
    sendMessage(connectionId, message) {
        const connection = this.connections.get(connectionId);
        if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
            return false;
        }

        try {
            connection.ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error(`Error sending message to ${connectionId}:`, error);
            return false;
        }
    }

    /**
     * Send error message to a connection
     */
    sendError(connectionId, message) {
        this.sendMessage(connectionId, {
            type: 'error',
            message
        });
    }

    /**
     * Broadcast message to all connections in a game
     */
    broadcastToGame(gameId, message, excludeConnectionId = null) {
        const gameRoom = this.gameRooms.get(gameId);
        if (!gameRoom) return;

        gameRoom.forEach(connectionId => {
            if (connectionId !== excludeConnectionId) {
                this.sendMessage(connectionId, message);
            }
        });
    }

    /**
     * Broadcast message to all connections of a player
     */
    broadcastToPlayer(playerId, message) {
        const playerConns = this.playerConnections.get(playerId);
        if (!playerConns) return;

        playerConns.forEach(connectionId => {
            this.sendMessage(connectionId, message);
        });
    }

    /**
     * Setup heartbeat mechanism
     */
    setupHeartbeat() {
        setInterval(() => {
            this.connections.forEach((connection, connectionId) => {
                if (!connection.isAlive) {
                    console.log(`Terminating dead connection: ${connectionId}`);
                    connection.ws.terminate();
                    this.handleDisconnection(connectionId);
                    return;
                }

                connection.isAlive = false;
                if (connection.ws.readyState === WebSocket.OPEN) {
                    connection.ws.ping();
                }
            });

            // Clean up old database sessions
            this.database.cleanupOldSessions().catch(err => {
                console.error('Error cleaning up old sessions:', err);
            });

        }, 30000); // 30 seconds
    }

    /**
     * Get connection statistics
     */
    getStats() {
        return {
            totalConnections: this.connections.size,
            activeGames: this.gameRooms.size,
            totalPlayers: this.playerConnections.size,
            connectionsPerGame: Array.from(this.gameRooms.values()).map(room => room.size)
        };
    }

    /**
     * Cleanup on server shutdown
     */
    destroy() {
        // Close all connections
        this.connections.forEach((connection, connectionId) => {
            connection.ws.close(1000, 'Server shutting down');
        });

        // Close WebSocket server
        this.wss.close();

        // Cleanup game service
        if (this.gameService) {
            this.gameService.destroy();
        }
    }
}

module.exports = GameWebSocketHandler;