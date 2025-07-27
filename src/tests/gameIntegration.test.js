/**
 * Game Integration Tests
 * 
 * These tests validate the complete server-side game implementation
 * including game logic, database persistence, and API endpoints.
 */

const request = require('supertest');
const RotaGameServer = require('../server');
const RotaGame = require('../models/RotaGame');
const GameDatabase = require('../database/gameDatabase');

describe('Rota Game Server Integration', () => {
    let server;
    let app;
    let database;

    beforeAll(async () => {
        // Use in-memory database for testing
        database = new GameDatabase(':memory:');
        await database.init();
        
        server = new RotaGameServer();
        server.database = database; // Override with test database
        await server.init();
        app = server.app;
    });

    afterAll(async () => {
        if (database) {
            await database.close();
        }
        if (server) {
            await server.shutdown();
        }
    });

    describe('Game Model Tests', () => {
        test('should create a new game with correct initial state', () => {
            const game = new RotaGame('test-game-1', 'player1', 'player2');
            
            expect(game.gameId).toBe('test-game-1');
            expect(game.player1Id).toBe('player1');
            expect(game.player2Id).toBe('player2');
            expect(game.phase).toBe('placement');
            expect(game.currentPlayerIndex).toBe(0);
            expect(game.winner).toBeNull();
            
            // Check initial board state
            Object.values(game.board).forEach(position => {
                expect(position).toBeNull();
            });
        });

        test('should validate placement moves correctly', () => {
            const game = new RotaGame('test-game-2', 'player1', 'player2');
            
            // Valid placement
            let errors = game.validatePlacement('player1', 0);
            expect(errors).toHaveLength(0);
            
            // Invalid player turn
            errors = game.validatePlacement('player2', 0);
            expect(errors).toContain('Not your turn');
            
            // Invalid position
            errors = game.validatePlacement('player1', 20);
            expect(errors).toContain('Invalid position');
        });

        test('should execute placement moves correctly', () => {
            const game = new RotaGame('test-game-3', 'player1', 'player2');
            
            // Player 1 places first piece
            const result = game.placePiece('player1', 0);
            expect(result.success).toBe(true);
            expect(game.board[0]).toBe(1);
            expect(game.piecesPlaced.player1).toBe(1);
            expect(game.currentPlayerIndex).toBe(1); // Switch to player 2
        });

        test('should detect win conditions correctly', () => {
            const game = new RotaGame('test-game-4', 'player1', 'player2');
            
            // Set up a winning position for player 1 (horizontal line 0-1-2)
            game.board[0] = 1;
            game.board[1] = 1;
            game.board[2] = 1;
            
            expect(game.checkWinCondition(1)).toBe(true);
            expect(game.checkWinCondition(2)).toBe(false);
        });

        test('should transition from placement to movement phase', () => {
            const game = new RotaGame('test-game-5', 'player1', 'player2');
            
            // Place all pieces (3 per player)
            game.placePiece('player1', 0);
            game.placePiece('player2', 1);
            game.placePiece('player1', 2);
            game.placePiece('player2', 3);
            game.placePiece('player1', 4);
            game.placePiece('player2', 5);
            
            expect(game.phase).toBe('movement');
        });

        test('should validate movement moves correctly', () => {
            const game = new RotaGame('test-game-6', 'player1', 'player2');
            game.phase = 'movement';
            game.board[0] = 1; // Player 1 piece at position 0
            game.currentPlayerIndex = 0; // Player 1 turn
            
            // Valid movement (0 -> 1, adjacent positions)
            let errors = game.validateMovement('player1', 0, 1);
            expect(errors).toHaveLength(0);
            
            // Invalid movement (0 -> 5, not adjacent)
            errors = game.validateMovement('player1', 0, 5);
            expect(errors).toContain('Positions are not adjacent');
            
            // Moving from empty position
            errors = game.validateMovement('player1', 10, 11);
            expect(errors).toContain('No piece at source position');
        });
    });

    describe('API Endpoint Tests', () => {
        test('GET /health should return server status', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);
            
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Server is healthy');
        });

        test('POST /api/games should create a new game', async () => {
            const response = await request(app)
                .post('/api/games')
                .send({
                    playerId: 'test-player-1'
                })
                .expect(201);
            
            expect(response.body.success).toBe(true);
            expect(response.body.data.gameId).toBeDefined();
            expect(response.body.data.gameState.player1Id).toBe('test-player-1');
        });

        test('POST /api/games/:gameId/join should join existing game', async () => {
            // First create a game
            const createResponse = await request(app)
                .post('/api/games')
                .send({ playerId: 'test-player-1' })
                .expect(201);
            
            const gameId = createResponse.body.data.gameId;
            
            // Join the game as player 2
            const joinResponse = await request(app)
                .post(`/api/games/${gameId}/join`)
                .send({ playerId: 'test-player-2' })
                .expect(200);
            
            expect(joinResponse.body.success).toBe(true);
            expect(joinResponse.body.data.gameState.player2Id).toBe('test-player-2');
        });

        test('POST /api/games/:gameId/moves should make a placement move', async () => {
            // Create and join game
            const createResponse = await request(app)
                .post('/api/games')
                .send({ playerId: 'test-player-1' })
                .expect(201);
            
            const gameId = createResponse.body.data.gameId;
            
            await request(app)
                .post(`/api/games/${gameId}/join`)
                .send({ playerId: 'test-player-2' })
                .expect(200);
            
            // Make a placement move
            const moveResponse = await request(app)
                .post(`/api/games/${gameId}/moves`)
                .send({
                    playerId: 'test-player-1',
                    type: 'placement',
                    position: 0
                })
                .expect(200);
            
            expect(moveResponse.body.success).toBe(true);
            expect(moveResponse.body.data.gameState.board[0]).toBe(1);
        });

        test('GET /api/games/:gameId should return game state', async () => {
            // Create game
            const createResponse = await request(app)
                .post('/api/games')
                .send({ playerId: 'test-player-1' })
                .expect(201);
            
            const gameId = createResponse.body.data.gameId;
            
            // Get game state
            const stateResponse = await request(app)
                .get(`/api/games/${gameId}?playerId=test-player-1`)
                .expect(200);
            
            expect(stateResponse.body.success).toBe(true);
            expect(stateResponse.body.data.gameState.gameId).toBe(gameId);
        });

        test('should handle invalid moves with proper error responses', async () => {
            // Create and join game
            const createResponse = await request(app)
                .post('/api/games')
                .send({ playerId: 'test-player-1' })
                .expect(201);
            
            const gameId = createResponse.body.data.gameId;
            
            await request(app)
                .post(`/api/games/${gameId}/join`)
                .send({ playerId: 'test-player-2' })
                .expect(200);
            
            // Try to make move with wrong player
            await request(app)
                .post(`/api/games/${gameId}/moves`)
                .send({
                    playerId: 'test-player-2', // Not their turn
                    type: 'placement',
                    position: 0
                })
                .expect(403);
            
            // Try to make move on invalid position
            await request(app)
                .post(`/api/games/${gameId}/moves`)
                .send({
                    playerId: 'test-player-1',
                    type: 'placement',
                    position: 20 // Invalid position
                })
                .expect(400);
        });
    });

    describe('Database Tests', () => {
        test('should save and retrieve games correctly', async () => {
            const game = new RotaGame('db-test-game', 'player1', 'player2');
            const serializedGame = game.serialize();
            
            // Save game
            await database.saveGame(serializedGame);
            
            // Retrieve game
            const retrievedGame = await database.getGame('db-test-game');
            expect(retrievedGame).toBeDefined();
            expect(retrievedGame.gameId).toBe('db-test-game');
            expect(retrievedGame.player1Id).toBe('player1');
        });

        test('should update player statistics correctly', async () => {
            // Update stats for a win
            await database.updatePlayerStats('stats-player-1', {
                gamesPlayed: 1,
                gamesWon: 1,
                totalMoves: 6
            });
            
            // Retrieve stats
            const stats = await database.getPlayerStats('stats-player-1');
            expect(stats.gamesPlayed).toBe(1);
            expect(stats.gamesWon).toBe(1);
            expect(stats.totalMoves).toBe(6);
        });
    });

    describe('Game Logic Edge Cases', () => {
        test('should handle game completion correctly', () => {
            const game = new RotaGame('edge-test-1', 'player1', 'player2');
            
            // Set up winning position
            game.board[0] = 1;
            game.board[1] = 1;
            
            // Make winning move
            const result = game.placePiece('player1', 2);
            
            expect(result.winner).toBe('player1');
            expect(game.phase).toBe('finished');
        });

        test('should serialize and deserialize games correctly', () => {
            const originalGame = new RotaGame('serialize-test', 'player1', 'player2');
            originalGame.placePiece('player1', 0);
            originalGame.placePiece('player2', 1);
            
            const serialized = originalGame.serialize();
            const deserializedGame = RotaGame.deserialize(serialized);
            
            expect(deserializedGame.gameId).toBe(originalGame.gameId);
            expect(deserializedGame.board[0]).toBe(1);
            expect(deserializedGame.board[1]).toBe(2);
            expect(deserializedGame.piecesPlaced.player1).toBe(1);
        });

        test('should validate adjacent positions correctly', () => {
            const game = new RotaGame('adjacent-test', 'player1', 'player2');
            
            // Test center position (8) adjacencies
            const centerAdjacent = game.getAdjacentPositions(8);
            expect(centerAdjacent).toContain(0);
            expect(centerAdjacent).toContain(1);
            expect(centerAdjacent).toContain(7);
            expect(centerAdjacent).toHaveLength(8);
            
            // Test corner position (0) adjacencies
            const cornerAdjacent = game.getAdjacentPositions(0);
            expect(cornerAdjacent).toContain(1);
            expect(cornerAdjacent).toContain(7);
            expect(cornerAdjacent).toContain(8);
            expect(cornerAdjacent).toHaveLength(3);
        });
    });
});