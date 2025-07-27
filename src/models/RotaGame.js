/**
 * Server-side Rota Game Implementation
 * 
 * This class handles the core game logic for the Rota board game.
 * Rota is a strategy game played on a circular board with positions
 * arranged in concentric circles connected by radial lines.
 * 
 * Game Rules:
 * - Each player has 3 pieces
 * - Phase 1: Players alternate placing pieces on empty positions
 * - Phase 2: Players move pieces to adjacent empty positions
 * - Win condition: Get 3 pieces in a row (horizontally, vertically, or radially)
 */

class RotaGame {
    constructor(gameId, player1Id, player2Id = null) {
        this.gameId = gameId;
        this.player1Id = player1Id;
        this.player2Id = player2Id;
        this.currentPlayerIndex = 0; // 0 for player1, 1 for player2
        this.phase = 'placement'; // 'placement', 'movement', 'finished'
        this.board = this.initializeBoard();
        this.piecesPlaced = { player1: 0, player2: 0 };
        this.maxPieces = 3;
        this.winner = null;
        this.createdAt = new Date();
        this.lastMoveAt = new Date();
        this.spectators = new Set();
        this.moveHistory = [];
    }

    /**
     * Initialize the Rota board
     * Board positions are numbered 0-15 in a specific pattern:
     * 
     *     0---1---2
     *     |   |   |
     *     7---8---3
     *     |   |   |
     *     6---5---4
     * 
     * Plus additional outer ring positions 9-15
     */
    initializeBoard() {
        const board = {};
        
        // Initialize all 16 positions as empty
        for (let i = 0; i < 16; i++) {
            board[i] = null;
        }
        
        return board;
    }

    /**
     * Get the current player's ID
     */
    getCurrentPlayer() {
        return this.currentPlayerIndex === 0 ? this.player1Id : this.player2Id;
    }

    /**
     * Get the opponent player's ID
     */
    getOpponentPlayer() {
        return this.currentPlayerIndex === 0 ? this.player2Id : this.player1Id;
    }

    /**
     * Get player number (1 or 2) for a given player ID
     */
    getPlayerNumber(playerId) {
        if (playerId === this.player1Id) return 1;
        if (playerId === this.player2Id) return 2;
        return null;
    }

    /**
     * Check if a player can make a move
     */
    canPlayerMove(playerId) {
        if (this.phase === 'finished') return false;
        if (!this.player2Id) return false; // Need two players
        return this.getCurrentPlayer() === playerId;
    }

    /**
     * Get adjacent positions for a given board position
     */
    getAdjacentPositions(position) {
        const adjacencyMap = {
            0: [1, 7, 8],
            1: [0, 2, 8],
            2: [1, 3, 8],
            3: [2, 4, 8],
            4: [3, 5, 8],
            5: [4, 6, 8],
            6: [5, 7, 8],
            7: [6, 0, 8],
            8: [0, 1, 2, 3, 4, 5, 6, 7], // Center connects to all inner ring
            9: [10, 15, 0], // Outer ring
            10: [9, 11, 1],
            11: [10, 12, 2],
            12: [11, 13, 3],
            13: [12, 14, 4],
            14: [13, 15, 5],
            15: [14, 9, 6]
        };
        
        return adjacencyMap[position] || [];
    }

    /**
     * Validate a placement move
     */
    validatePlacement(playerId, position) {
        const errors = [];

        // Check if it's the player's turn
        if (!this.canPlayerMove(playerId)) {
            errors.push('Not your turn');
        }

        // Check if we're in placement phase
        if (this.phase !== 'placement') {
            errors.push('Not in placement phase');
        }

        // Check if position is valid
        if (position < 0 || position > 15) {
            errors.push('Invalid position');
        }

        // Check if position is empty
        if (this.board[position] !== null) {
            errors.push('Position already occupied');
        }

        // Check if player has pieces left to place
        const playerKey = playerId === this.player1Id ? 'player1' : 'player2';
        if (this.piecesPlaced[playerKey] >= this.maxPieces) {
            errors.push('All pieces already placed');
        }

        return errors;
    }

    /**
     * Validate a movement move
     */
    validateMovement(playerId, fromPosition, toPosition) {
        const errors = [];

        // Check if it's the player's turn
        if (!this.canPlayerMove(playerId)) {
            errors.push('Not your turn');
        }

        // Check if we're in movement phase
        if (this.phase !== 'movement') {
            errors.push('Not in movement phase');
        }

        // Check if positions are valid
        if (fromPosition < 0 || fromPosition > 15 || toPosition < 0 || toPosition > 15) {
            errors.push('Invalid position');
        }

        // Check if from position has player's piece
        const playerNumber = this.getPlayerNumber(playerId);
        if (this.board[fromPosition] !== playerNumber) {
            errors.push('No piece at source position');
        }

        // Check if to position is empty
        if (this.board[toPosition] !== null) {
            errors.push('Destination position occupied');
        }

        // Check if positions are adjacent
        const adjacentPositions = this.getAdjacentPositions(fromPosition);
        if (!adjacentPositions.includes(toPosition)) {
            errors.push('Positions are not adjacent');
        }

        return errors;
    }

    /**
     * Execute a placement move
     */
    placePiece(playerId, position) {
        const errors = this.validatePlacement(playerId, position);
        if (errors.length > 0) {
            throw new Error(`Invalid placement: ${errors.join(', ')}`);
        }

        const playerNumber = this.getPlayerNumber(playerId);
        this.board[position] = playerNumber;
        
        const playerKey = playerId === this.player1Id ? 'player1' : 'player2';
        this.piecesPlaced[playerKey]++;

        // Record move
        this.moveHistory.push({
            type: 'placement',
            playerId,
            position,
            timestamp: new Date()
        });

        // Check if placement phase is complete
        if (this.piecesPlaced.player1 === this.maxPieces && this.piecesPlaced.player2 === this.maxPieces) {
            this.phase = 'movement';
        }

        // Check for win condition
        if (this.checkWinCondition(playerNumber)) {
            this.phase = 'finished';
            this.winner = playerId;
        }

        // Switch turns
        this.currentPlayerIndex = 1 - this.currentPlayerIndex;
        this.lastMoveAt = new Date();

        return {
            success: true,
            gameState: this.getGameState(),
            winner: this.winner
        };
    }

    /**
     * Execute a movement move
     */
    movePiece(playerId, fromPosition, toPosition) {
        const errors = this.validateMovement(playerId, fromPosition, toPosition);
        if (errors.length > 0) {
            throw new Error(`Invalid movement: ${errors.join(', ')}`);
        }

        const playerNumber = this.getPlayerNumber(playerId);
        
        // Move the piece
        this.board[fromPosition] = null;
        this.board[toPosition] = playerNumber;

        // Record move
        this.moveHistory.push({
            type: 'movement',
            playerId,
            fromPosition,
            toPosition,
            timestamp: new Date()
        });

        // Check for win condition
        if (this.checkWinCondition(playerNumber)) {
            this.phase = 'finished';
            this.winner = playerId;
        }

        // Switch turns
        this.currentPlayerIndex = 1 - this.currentPlayerIndex;
        this.lastMoveAt = new Date();

        return {
            success: true,
            gameState: this.getGameState(),
            winner: this.winner
        };
    }

    /**
     * Check if a player has won the game
     */
    checkWinCondition(playerNumber) {
        // Define winning lines (3 in a row)
        const winningLines = [
            // Horizontal lines
            [0, 1, 2],
            [6, 5, 4],
            [7, 8, 3],
            
            // Vertical lines
            [0, 7, 6],
            [2, 3, 4],
            [1, 8, 5],
            
            // Radial lines through center
            [0, 8, 4],
            [2, 8, 6],
            [1, 8, 5],
            [7, 8, 3],
            
            // Outer ring connections
            [9, 0, 7],
            [10, 1, 8],
            [11, 2, 3],
            [12, 3, 4],
            [13, 4, 5],
            [14, 5, 6],
            [15, 6, 7]
        ];

        return winningLines.some(line => 
            line.every(position => this.board[position] === playerNumber)
        );
    }

    /**
     * Get the current game state
     */
    getGameState() {
        return {
            gameId: this.gameId,
            player1Id: this.player1Id,
            player2Id: this.player2Id,
            currentPlayer: this.getCurrentPlayer(),
            phase: this.phase,
            board: { ...this.board },
            piecesPlaced: { ...this.piecesPlaced },
            winner: this.winner,
            lastMoveAt: this.lastMoveAt,
            moveCount: this.moveHistory.length
        };
    }

    /**
     * Get game state for a specific player (hiding sensitive info)
     */
    getGameStateForPlayer(playerId) {
        const state = this.getGameState();
        
        // Add player-specific information
        state.isYourTurn = this.getCurrentPlayer() === playerId;
        state.yourPlayerNumber = this.getPlayerNumber(playerId);
        
        return state;
    }

    /**
     * Add a spectator to the game
     */
    addSpectator(userId) {
        this.spectators.add(userId);
    }

    /**
     * Remove a spectator from the game
     */
    removeSpectator(userId) {
        this.spectators.delete(userId);
    }

    /**
     * Get list of valid moves for the current player
     */
    getValidMoves() {
        const validMoves = [];
        const currentPlayer = this.getCurrentPlayer();
        const playerNumber = this.getPlayerNumber(currentPlayer);

        if (this.phase === 'placement') {
            // Find empty positions
            for (let i = 0; i < 16; i++) {
                if (this.board[i] === null) {
                    validMoves.push({ type: 'placement', position: i });
                }
            }
        } else if (this.phase === 'movement') {
            // Find pieces belonging to current player and their valid moves
            for (let from = 0; from < 16; from++) {
                if (this.board[from] === playerNumber) {
                    const adjacentPositions = this.getAdjacentPositions(from);
                    for (const to of adjacentPositions) {
                        if (this.board[to] === null) {
                            validMoves.push({ 
                                type: 'movement', 
                                fromPosition: from, 
                                toPosition: to 
                            });
                        }
                    }
                }
            }
        }

        return validMoves;
    }

    /**
     * Handle player disconnection
     */
    handlePlayerDisconnection(playerId) {
        // Game continues - player can reconnect
        // Could implement timeout logic here
        return {
            gameId: this.gameId,
            disconnectedPlayer: playerId,
            gameState: this.getGameState()
        };
    }

    /**
     * Check if game is expired (for cleanup)
     */
    isExpired(timeoutMinutes = 30) {
        const now = new Date();
        const timeDiff = now - this.lastMoveAt;
        return timeDiff > timeoutMinutes * 60 * 1000;
    }

    /**
     * Serialize game for database storage
     */
    serialize() {
        return {
            gameId: this.gameId,
            player1Id: this.player1Id,
            player2Id: this.player2Id,
            currentPlayerIndex: this.currentPlayerIndex,
            phase: this.phase,
            board: JSON.stringify(this.board),
            piecesPlaced: JSON.stringify(this.piecesPlaced),
            winner: this.winner,
            createdAt: this.createdAt,
            lastMoveAt: this.lastMoveAt,
            moveHistory: JSON.stringify(this.moveHistory)
        };
    }

    /**
     * Deserialize game from database
     */
    static deserialize(data) {
        const game = new RotaGame(data.gameId, data.player1Id, data.player2Id);
        game.currentPlayerIndex = data.currentPlayerIndex;
        game.phase = data.phase;
        game.board = JSON.parse(data.board);
        game.piecesPlaced = JSON.parse(data.piecesPlaced);
        game.winner = data.winner;
        game.createdAt = new Date(data.createdAt);
        game.lastMoveAt = new Date(data.lastMoveAt);
        game.moveHistory = JSON.parse(data.moveHistory);
        return game;
    }
}

module.exports = RotaGame;