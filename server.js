// Load environment variables
require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const { RateLimiterMemory } = require('rate-limiter-flexible');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Configure Socket.io with security options
const io = socketIo(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' ? 
            (process.env.RAILWAY_PUBLIC_DOMAIN ? [`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`] : false) : 
            ["http://localhost:3000"],
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

// Rate limiting
const rateLimiter = new RateLimiterMemory({
    points: 10, // Number of requests
    duration: 1, // Per 1 second
});

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            connectSrc: ["'self'", "ws:", "wss:"]
        }
    }
}));

app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? false : ["http://localhost:3000"]
}));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '1mb' }));

// API Routes
try {
    const apiRoutes = require('./src/routes/index');
    app.use('/api', apiRoutes);
    console.log('✅ API routes loaded successfully');
} catch (error) {
    console.warn('⚠️  API routes not available:', error.message);
    console.log('   Game will work with WebSocket-only functionality');
}

// Direct room join endpoint
app.get('/room/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    
    // Validate room ID format
    if (!roomId || roomId.length > 20 || !/^[a-zA-Z0-9]+$/.test(roomId)) {
        return res.redirect('/?error=invalid-room');
    }
    
    // Serve the main page but with room ID in URL for client to detect
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Game state management
class GameManager {
    constructor() {
        this.rooms = new Map();
        this.playerRooms = new Map(); // Track which room each player is in
    }
    
    createRoom(roomId) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, {
                id: roomId,
                players: [],
                gameState: 'waiting',
                board: new Array(9).fill(null), // Rota game has 9 positions
                currentPlayer: 1,
                gamePhase: 'placement',  // 'placement' or 'movement'
                piecesPlaced: { 1: 0, 2: 0 },
                selectedPosition: null,
                createdAt: new Date(),
                lastActivity: new Date()
            });
        }
        return this.rooms.get(roomId);
    }
    
    joinRoom(roomId, playerId) {
        const room = this.createRoom(roomId);
        
        // Check if player is already in the room
        if (room.players.includes(playerId)) {
            return { success: false, error: 'Already in room' };
        }
        
        // Check room capacity
        if (room.players.length >= 2) {
            return { success: false, error: 'Room is full' };
        }
        
        // Remove player from previous room if exists
        this.leaveRoom(playerId);
        
        // Add player to room
        room.players.push(playerId);
        room.lastActivity = new Date();
        this.playerRooms.set(playerId, roomId);
        
        return { success: true, room };
    }
    
    leaveRoom(playerId) {
        const roomId = this.playerRooms.get(playerId);
        if (roomId && this.rooms.has(roomId)) {
            const room = this.rooms.get(roomId);
            const playerIndex = room.players.indexOf(playerId);
            
            if (playerIndex > -1) {
                room.players.splice(playerIndex, 1);
                this.playerRooms.delete(playerId);
                
                // Delete room if empty
                if (room.players.length === 0) {
                    this.rooms.delete(roomId);
                } else {
                    // Reset game if player leaves during game
                    if (room.gameState === 'playing') {
                        room.gameState = 'waiting';
                        room.board = new Array(9).fill(null);
                        room.currentPlayer = 1;
                        room.gamePhase = 'placement';
                        room.piecesPlaced = { 1: 0, 2: 0 };
                        room.selectedPosition = null;
                    }
                }
                
                return room;
            }
        }
        return null;
    }
    
    makeMove(roomId, playerId, position) {
        const room = this.rooms.get(roomId);
        if (!room) return { success: false, error: 'Room not found' };
        
        if (room.gameState !== 'playing') {
            return { success: false, error: 'Game not active' };
        }
        
        if (!room.players.includes(playerId)) {
            return { success: false, error: 'Player not in room' };
        }
        
        const playerNumber = room.players.indexOf(playerId) + 1;
        if (playerNumber !== room.currentPlayer) {
            return { success: false, error: 'Not your turn' };
        }
        
        if (position < 0 || position > 8) {
            return { success: false, error: 'Invalid position' };
        }
        
        if (room.gamePhase === 'placement') {
            return this.handlePlacement(room, playerId, playerNumber, position);
        } else {
            return this.handleMovement(room, playerId, playerNumber, position);
        }
    }
    
    handlePlacement(room, playerId, playerNumber, position) {
        if (room.board[position] !== null) {
            return { success: false, error: 'Position already occupied' };
        }
        
        // Place piece
        room.board[position] = playerNumber;
        room.piecesPlaced[playerNumber]++;
        room.lastActivity = new Date();
        
        // Check if placement phase is complete
        if (room.piecesPlaced[1] === 3 && room.piecesPlaced[2] === 3) {
            room.gamePhase = 'movement';
        }
        
        // Check for win condition
        const winner = this.checkWinner(room.board);
        if (winner) {
            room.gameState = 'finished';
        } else {
            room.currentPlayer = room.currentPlayer === 1 ? 2 : 1;
        }
        
        return {
            success: true,
            move: { position, playerId, playerNumber },
            winner,
            gameState: room.gameState,
            gamePhase: room.gamePhase
        };
    }
    
    handleMovement(room, playerId, playerNumber, position) {
        if (room.selectedPosition === null) {
            // Select a piece to move
            if (room.board[position] === playerNumber) {
                room.selectedPosition = position;
                return {
                    success: true,
                    move: { type: 'select', position, playerId, playerNumber },
                    selectedPosition: room.selectedPosition
                };
            } else {
                return { success: false, error: 'Must select your own piece' };
            }
        } else {
            // Move the selected piece
            if (position === room.selectedPosition) {
                // Deselect
                room.selectedPosition = null;
                return {
                    success: true,
                    move: { type: 'deselect', position, playerId, playerNumber },
                    selectedPosition: null
                };
            } else if (this.isValidMove(room.selectedPosition, position, room.board)) {
                // Make the move
                const fromPosition = room.selectedPosition;
                room.board[position] = playerNumber;
                room.board[fromPosition] = null;
                room.selectedPosition = null;
                room.lastActivity = new Date();
                
                // Check for win condition
                const winner = this.checkWinner(room.board);
                if (winner) {
                    room.gameState = 'finished';
                } else {
                    room.currentPlayer = room.currentPlayer === 1 ? 2 : 1;
                }
                
                return {
                    success: true,
                    move: { type: 'move', from: fromPosition, to: position, playerId, playerNumber },
                    winner,
                    gameState: room.gameState
                };
            } else {
                return { success: false, error: 'Invalid move' };
            }
        }
    }
    
    startGame(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return { success: false, error: 'Room not found' };
        
        if (room.players.length !== 2) {
            return { success: false, error: 'Need 2 players to start' };
        }
        
        room.gameState = 'playing';
        room.board = new Array(9).fill(null);
        room.currentPlayer = 1;
        room.gamePhase = 'placement';
        room.piecesPlaced = { 1: 0, 2: 0 };
        room.selectedPosition = null;
        room.lastActivity = new Date();
        
        return { success: true, room };
    }
    
    isValidMove(from, to, board) {
        if (board[to] !== null) return false;
        
        const connections = this.getConnections();
        return connections[from] && connections[from].includes(to);
    }
    
    getConnections() {
        return {
            0: [1, 7, 8],
            1: [0, 2, 8],
            2: [1, 3, 8],
            3: [2, 4, 8],
            4: [3, 5, 8],
            5: [4, 6, 8],
            6: [5, 7, 8],
            7: [6, 0, 8],
            8: [0, 1, 2, 3, 4, 5, 6, 7]
        };
    }
    
    checkWinner(board) {
        const winPatterns = [
            // Circumference lines (around the circle)
            [0, 1, 2], [1, 2, 3], [2, 3, 4], [3, 4, 5],
            [4, 5, 6], [5, 6, 7], [6, 7, 0], [7, 0, 1],
            // Diameter lines (through center)
            [0, 4, 8], [1, 5, 8], [2, 6, 8], [3, 7, 8]
        ];
        
        for (const pattern of winPatterns) {
            const [a, b, c] = pattern;
            if (board[a] && board[a] === board[b] && board[b] === board[c]) {
                return board[a];
            }
        }
        
        return null;
    }
    
    cleanupOldRooms() {
        const now = new Date();
        const ROOM_TIMEOUT = 30 * 60 * 1000; // 30 minutes
        
        for (const [roomId, room] of this.rooms.entries()) {
            if (now - room.lastActivity > ROOM_TIMEOUT) {
                // Remove players from tracking
                room.players.forEach(playerId => {
                    this.playerRooms.delete(playerId);
                });
                
                this.rooms.delete(roomId);
                console.log(`Cleaned up inactive room: ${roomId}`);
            }
        }
    }
}

const gameManager = new GameManager();

// Cleanup old rooms every 5 minutes
setInterval(() => {
    gameManager.cleanupOldRooms();
}, 5 * 60 * 1000);

// Input validation middleware
function validateRoomId(roomId) {
    return typeof roomId === 'string' && 
           roomId.length > 0 && 
           roomId.length <= 20 && 
           /^[A-Za-z0-9]+$/.test(roomId);
}

function validateMoveData(data) {
    return data &&
           typeof data.roomId === 'string' &&
           Number.isInteger(data.position) &&
           data.position >= 0 && data.position <= 8;
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Rate limiting for socket events
    socket.use(async (packet, next) => {
        try {
            await rateLimiter.consume(socket.handshake.address);
            next();
        } catch (rejRes) {
            socket.emit('error', 'Rate limit exceeded');
            next(new Error('Rate limit exceeded'));
        }
    });
    
    // Handle room joining
    socket.on('join-room', (roomId) => {
        try {
            if (!validateRoomId(roomId)) {
                socket.emit('error', 'Invalid room ID');
                return;
            }
            
            const result = gameManager.joinRoom(roomId, socket.id);
            
            if (result.success) {
                socket.join(roomId);
                socket.emit('room-joined', roomId);
                io.to(roomId).emit('player-joined', result.room.players.length);
                
                console.log(`Player ${socket.id} joined room ${roomId}`);
            } else {
                socket.emit('error', result.error);
            }
        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error', 'Failed to join room');
        }
    });
    
    // Handle leaving room
    socket.on('leave-room', (roomId) => {
        try {
            const room = gameManager.leaveRoom(socket.id);
            if (room) {
                socket.leave(roomId);
                socket.to(roomId).emit('player-left');
                
                console.log(`Player ${socket.id} left room ${roomId}`);
            }
        } catch (error) {
            console.error('Error leaving room:', error);
        }
    });
    
    // Handle game start
    socket.on('start-game', (roomId) => {
        try {
            if (!validateRoomId(roomId)) {
                socket.emit('error', 'Invalid room ID');
                return;
            }
            
            const result = gameManager.startGame(roomId);
            
            if (result.success) {
                const players = result.room.players;
                players.forEach((playerId, index) => {
                    io.to(playerId).emit('game-started', { 
                        playerNumber: index + 1,
                        roomId: roomId,
                        currentPlayer: result.room.currentPlayer,
                        gamePhase: result.room.gamePhase
                    });
                });
                
                console.log(`Game started in room ${roomId}`);
            } else {
                socket.emit('error', result.error);
            }
        } catch (error) {
            console.error('Error starting game:', error);
            socket.emit('error', 'Failed to start game');
        }
    });
    
    // Handle game moves
    socket.on('make-move', (data) => {
        try {
            if (!validateMoveData(data)) {
                socket.emit('error', 'Invalid move data');
                return;
            }
            
            const result = gameManager.makeMove(data.roomId, socket.id, data.position);
            
            if (result.success) {
                io.to(data.roomId).emit('move-made', result.move);
                
                // Send game state update
                const room = gameManager.rooms.get(data.roomId);
                io.to(data.roomId).emit('game-state-update', {
                    board: room.board,
                    currentPlayer: room.currentPlayer,
                    gamePhase: room.gamePhase,
                    selectedPosition: room.selectedPosition
                });
                
                if (result.winner) {
                    io.to(data.roomId).emit('game-over', { 
                        winner: result.winner,
                        type: 'win'
                    });
                } else if (result.gameState === 'finished') {
                    io.to(data.roomId).emit('game-over', { 
                        winner: null,
                        type: 'draw'
                    });
                }
                
                console.log(`Move made in room ${data.roomId}: position ${data.position}`);
            } else {
                socket.emit('error', result.error);
            }
        } catch (error) {
            console.error('Error making move:', error);
            socket.emit('error', 'Failed to make move');
        }
    });
    
    // Handle game restart
    socket.on('restart-game', (roomId) => {
        try {
            if (!validateRoomId(roomId)) {
                socket.emit('error', 'Invalid room ID');
                return;
            }
            
            const room = gameManager.rooms.get(roomId);
            if (!room) {
                socket.emit('error', 'Room not found');
                return;
            }
            
            if (!room.players.includes(socket.id)) {
                socket.emit('error', 'Player not in room');
                return;
            }
            
            // Reset game state but keep players and start immediately
            room.gameState = 'playing';
            room.board = new Array(9).fill(null);
            room.currentPlayer = Math.random() < 0.5 ? 1 : 2; // Randomly select first player
            room.gamePhase = 'placement';
            room.piecesPlaced = { 1: 0, 2: 0 };
            room.selectedPosition = null;
            room.lastActivity = new Date();
            
            // Notify all players in the room
            io.to(roomId).emit('game-restarted', {
                gameState: 'playing',
                board: room.board,
                currentPlayer: room.currentPlayer,
                gamePhase: room.gamePhase
            });
            
            console.log(`Game restarted in room ${roomId}`);
        } catch (error) {
            console.error('Error restarting game:', error);
            socket.emit('error', 'Failed to restart game');
        }
    });

    // Handle game end
    socket.on('end-game', (roomId) => {
        try {
            const room = gameManager.rooms.get(roomId);
            if (room) {
                // Get all players in the room before removing them
                const playersInRoom = [...room.players];
                
                // Remove all players from the room
                playersInRoom.forEach(playerId => {
                    gameManager.leaveRoom(playerId);
                });
                
                // Notify all players that the game ended and they should return to menu
                io.to(roomId).emit('game-ended');
                
                // Make all sockets leave the room
                playersInRoom.forEach(playerId => {
                    const playerSocket = io.sockets.sockets.get(playerId);
                    if (playerSocket) {
                        playerSocket.leave(roomId);
                    }
                });
                
                console.log(`Game ended in room ${roomId}, all players removed`);
            }
        } catch (error) {
            console.error('Error ending game:', error);
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        try {
            const room = gameManager.leaveRoom(socket.id);
            if (room && room.players.length > 0) {
                const roomId = gameManager.playerRooms.get(room.players[0]);
                if (roomId) {
                    socket.to(roomId).emit('player-left');
                }
            }
            
            console.log('User disconnected:', socket.id);
        } catch (error) {
            console.error('Error handling disconnect:', error);
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        rooms: gameManager.rooms.size
    });
});

// Health check endpoint for Railway
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Express error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
let isShuttingDown = false;

function gracefulShutdown(signal) {
    if (isShuttingDown) {
        console.log(`${signal} received again, forcing exit`);
        process.exit(1);
    }
    
    isShuttingDown = true;
    console.log(`${signal} received, shutting down gracefully`);
    
    // Set a timeout to force exit if graceful shutdown takes too long
    const shutdownTimeout = setTimeout(() => {
        console.log('Graceful shutdown timeout, forcing exit');
        process.exit(1);
    }, 10000);
    
    server.close(() => {
        console.log('HTTP server closed');
        
        // Close Socket.io server
        io.close(() => {
            console.log('Socket.io server closed');
            clearTimeout(shutdownTimeout);
            process.exit(0);
        });
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Roto game server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});