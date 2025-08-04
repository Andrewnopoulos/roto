const { describe, test, expect, beforeEach } = require('@jest/globals');

// Mock Socket.io for testing
const mockSocket = {
    join: jest.fn(),
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
    leave: jest.fn()
};

const mockIo = {
    to: jest.fn(() => ({ emit: jest.fn() }))
};

// Import GameManager class (we'll need to extract it to a separate module for proper testing)
class GameManager {
    constructor() {
        this.rooms = new Map();
        this.playerRooms = new Map();
    }
    
    createRoom(roomId) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, {
                id: roomId,
                players: [],
                gameState: 'waiting',
                board: Array(3).fill().map(() => Array(3).fill(null)),
                currentTurn: 1,
                createdAt: new Date(),
                lastActivity: new Date()
            });
        }
        return this.rooms.get(roomId);
    }
    
    joinRoom(roomId, playerId) {
        const room = this.createRoom(roomId);
        
        if (room.players.includes(playerId)) {
            return { success: false, error: 'Already in room' };
        }
        
        if (room.players.length >= 2) {
            return { success: false, error: 'Room is full' };
        }
        
        this.leaveRoom(playerId);
        
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
                
                if (room.players.length === 0) {
                    this.rooms.delete(roomId);
                } else {
                    if (room.gameState === 'playing') {
                        room.gameState = 'waiting';
                        room.board = Array(3).fill().map(() => Array(3).fill(null));
                        room.currentTurn = 1;
                    }
                }
                
                return room;
            }
        }
        return null;
    }
    
    makeMove(roomId, playerId, row, col) {
        const room = this.rooms.get(roomId);
        if (!room) return { success: false, error: 'Room not found' };
        
        if (room.gameState !== 'playing') {
            return { success: false, error: 'Game not active' };
        }
        
        if (!room.players.includes(playerId)) {
            return { success: false, error: 'Player not in room' };
        }
        
        const playerNumber = room.players.indexOf(playerId) + 1;
        if (playerNumber !== room.currentTurn) {
            return { success: false, error: 'Not your turn' };
        }
        
        if (row < 0 || row > 2 || col < 0 || col > 2) {
            return { success: false, error: 'Invalid position' };
        }
        
        if (room.board[row][col] !== null) {
            return { success: false, error: 'Position already occupied' };
        }
        
        room.board[row][col] = playerNumber;
        room.currentTurn = room.currentTurn === 1 ? 2 : 1;
        room.lastActivity = new Date();
        
        const winner = this.checkWinner(room.board);
        if (winner || this.isBoardFull(room.board)) {
            room.gameState = 'finished';
        }
        
        return {
            success: true,
            move: { row, col, playerId, playerNumber },
            winner,
            gameState: room.gameState
        };
    }
    
    startGame(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return { success: false, error: 'Room not found' };
        
        if (room.players.length !== 2) {
            return { success: false, error: 'Need 2 players to start' };
        }
        
        room.gameState = 'playing';
        room.board = Array(3).fill().map(() => Array(3).fill(null));
        room.currentTurn = 1;
        room.lastActivity = new Date();
        
        return { success: true, room };
    }
    
    checkWinner(board) {
        // Check rows
        for (let row = 0; row < 3; row++) {
            if (board[row][0] && board[row][0] === board[row][1] && board[row][1] === board[row][2]) {
                return board[row][0];
            }
        }
        
        // Check columns
        for (let col = 0; col < 3; col++) {
            if (board[0][col] && board[0][col] === board[1][col] && board[1][col] === board[2][col]) {
                return board[0][col];
            }
        }
        
        // Check diagonals
        if (board[0][0] && board[0][0] === board[1][1] && board[1][1] === board[2][2]) {
            return board[0][0];
        }
        
        if (board[0][2] && board[0][2] === board[1][1] && board[1][1] === board[2][0]) {
            return board[0][2];
        }
        
        return null;
    }
    
    isBoardFull(board) {
        return board.flat().every(cell => cell !== null);
    }
}

describe('GameManager', () => {
    let gameManager;
    
    beforeEach(() => {
        gameManager = new GameManager();
        jest.clearAllMocks();
    });
    
    describe('Room Management', () => {
        test('should create a new room', () => {
            const room = gameManager.createRoom('TEST123');
            
            expect(room).toBeDefined();
            expect(room.id).toBe('TEST123');
            expect(room.players).toEqual([]);
            expect(room.gameState).toBe('waiting');
            expect(room.board).toEqual([
                [null, null, null],
                [null, null, null],
                [null, null, null]
            ]);
        });
        
        test('should join a room successfully', () => {
            const result = gameManager.joinRoom('TEST123', 'player1');
            
            expect(result.success).toBe(true);
            expect(result.room.players).toContain('player1');
            expect(gameManager.playerRooms.get('player1')).toBe('TEST123');
        });
        
        test('should not allow more than 2 players in a room', () => {
            gameManager.joinRoom('TEST123', 'player1');
            gameManager.joinRoom('TEST123', 'player2');
            const result = gameManager.joinRoom('TEST123', 'player3');
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Room is full');
        });
        
        test('should not allow same player to join twice', () => {
            gameManager.joinRoom('TEST123', 'player1');
            const result = gameManager.joinRoom('TEST123', 'player1');
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Already in room');
        });
        
        test('should remove player from previous room when joining new room', () => {
            gameManager.joinRoom('ROOM1', 'player1');
            gameManager.joinRoom('ROOM2', 'player1');
            
            expect(gameManager.rooms.get('ROOM1').players).not.toContain('player1');
            expect(gameManager.rooms.get('ROOM2').players).toContain('player1');
            expect(gameManager.playerRooms.get('player1')).toBe('ROOM2');
        });
        
        test('should delete room when last player leaves', () => {
            gameManager.joinRoom('TEST123', 'player1');
            gameManager.leaveRoom('player1');
            
            expect(gameManager.rooms.has('TEST123')).toBe(false);
        });
    });
    
    describe('Game Logic', () => {
        beforeEach(() => {
            gameManager.joinRoom('TEST123', 'player1');
            gameManager.joinRoom('TEST123', 'player2');
            gameManager.startGame('TEST123');
        });
        
        test('should start game with 2 players', () => {
            const room = gameManager.rooms.get('TEST123');
            
            expect(room.gameState).toBe('playing');
            expect(room.currentTurn).toBe(1);
        });
        
        test('should not start game with less than 2 players', () => {
            gameManager.createRoom('ROOM2');
            gameManager.joinRoom('ROOM2', 'player1');
            const result = gameManager.startGame('ROOM2');
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Need 2 players to start');
        });
        
        test('should make valid moves', () => {
            const result = gameManager.makeMove('TEST123', 'player1', 0, 0);
            
            expect(result.success).toBe(true);
            expect(result.move.row).toBe(0);
            expect(result.move.col).toBe(0);
            expect(result.move.playerNumber).toBe(1);
            
            const room = gameManager.rooms.get('TEST123');
            expect(room.board[0][0]).toBe(1);
            expect(room.currentTurn).toBe(2);
        });
        
        test('should not allow moves on occupied positions', () => {
            gameManager.makeMove('TEST123', 'player1', 0, 0);
            const result = gameManager.makeMove('TEST123', 'player2', 0, 0);
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Position already occupied');
        });
        
        test('should not allow moves out of turn', () => {
            const result = gameManager.makeMove('TEST123', 'player2', 0, 0);
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Not your turn');
        });
        
        test('should not allow moves outside board', () => {
            const result = gameManager.makeMove('TEST123', 'player1', 3, 3);
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid position');
        });
        
        test('should detect row win', () => {
            gameManager.makeMove('TEST123', 'player1', 0, 0); // X
            gameManager.makeMove('TEST123', 'player2', 1, 0); // O
            gameManager.makeMove('TEST123', 'player1', 0, 1); // X
            gameManager.makeMove('TEST123', 'player2', 1, 1); // O
            const result = gameManager.makeMove('TEST123', 'player1', 0, 2); // X wins
            
            expect(result.success).toBe(true);
            expect(result.winner).toBe(1);
            expect(result.gameState).toBe('finished');
        });
        
        test('should detect column win', () => {
            gameManager.makeMove('TEST123', 'player1', 0, 0); // X
            gameManager.makeMove('TEST123', 'player2', 0, 1); // O
            gameManager.makeMove('TEST123', 'player1', 1, 0); // X
            gameManager.makeMove('TEST123', 'player2', 1, 1); // O
            const result = gameManager.makeMove('TEST123', 'player1', 2, 0); // X wins
            
            expect(result.success).toBe(true);
            expect(result.winner).toBe(1);
            expect(result.gameState).toBe('finished');
        });
        
        test('should detect diagonal win', () => {
            gameManager.makeMove('TEST123', 'player1', 0, 0); // X
            gameManager.makeMove('TEST123', 'player2', 0, 1); // O
            gameManager.makeMove('TEST123', 'player1', 1, 1); // X
            gameManager.makeMove('TEST123', 'player2', 0, 2); // O
            const result = gameManager.makeMove('TEST123', 'player1', 2, 2); // X wins
            
            expect(result.success).toBe(true);
            expect(result.winner).toBe(1);
            expect(result.gameState).toBe('finished');
        });
        
        test('should detect draw', () => {
            // Create a draw scenario
            const moves = [
                ['player1', 0, 0], // X
                ['player2', 0, 1], // O
                ['player1', 0, 2], // X
                ['player2', 1, 0], // O
                ['player1', 1, 1], // X
                ['player2', 2, 0], // O
                ['player1', 1, 2], // X
                ['player2', 2, 2], // O
                ['player1', 2, 1]  // X - draw
            ];
            
            let result;
            for (const [player, row, col] of moves) {
                result = gameManager.makeMove('TEST123', player, row, col);
                expect(result.success).toBe(true);
            }
            
            expect(result.winner).toBe(null);
            expect(result.gameState).toBe('finished');
        });
    });
    
    describe('Input Validation', () => {
        test('should validate room ID format', () => {
            const validIds = ['ABC123', 'test', 'ROOM1', 'a1b2c3'];
            const invalidIds = ['', 'room with spaces', 'room@123', 'a'.repeat(21)];
            
            function validateRoomId(roomId) {
                return typeof roomId === 'string' && 
                       roomId.length > 0 && 
                       roomId.length <= 20 && 
                       /^[A-Za-z0-9]+$/.test(roomId);
            }
            
            validIds.forEach(id => {
                expect(validateRoomId(id)).toBe(true);
            });
            
            invalidIds.forEach(id => {
                expect(validateRoomId(id)).toBe(false);
            });
        });
        
        test('should validate move data', () => {
            function validateMoveData(data) {
                return data &&
                       typeof data.roomId === 'string' &&
                       Number.isInteger(data.row) &&
                       Number.isInteger(data.col) &&
                       data.row >= 0 && data.row <= 2 &&
                       data.col >= 0 && data.col <= 2;
            }
            
            const validMoves = [
                { roomId: 'TEST', row: 0, col: 0 },
                { roomId: 'TEST', row: 2, col: 2 },
                { roomId: 'TEST', row: 1, col: 1 }
            ];
            
            const invalidMoves = [
                null,
                { roomId: 123, row: 0, col: 0 },
                { roomId: 'TEST', row: -1, col: 0 },
                { roomId: 'TEST', row: 3, col: 0 },
                { roomId: 'TEST', row: 0, col: 3 },
                { roomId: 'TEST', row: 'a', col: 0 },
                { roomId: 'TEST', row: 0.5, col: 0 }
            ];
            
            validMoves.forEach(move => {
                expect(validateMoveData(move)).toBe(true);
            });
            
            invalidMoves.forEach(move => {
                expect(validateMoveData(move)).toBe(false);
            });
        });
    });
});