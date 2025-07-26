class RotaGame {
    constructor() {
        this.board = new Array(9).fill(null);
        this.currentPlayer = 1;
        this.gamePhase = 'placement';
        this.piecesPlaced = { 1: 0, 2: 0 };
        this.selectedPosition = null;
        this.gameEnded = false;
        
        this.initializeBoard();
        this.updateUI();
    }
    
    initializeBoard() {
        const cells = document.querySelectorAll('.cell');
        cells.forEach((cell, index) => {
            cell.addEventListener('click', () => this.handleCellClick(index));
        });
        
        document.getElementById('reset-btn').addEventListener('click', () => this.resetGame());
    }
    
    handleCellClick(position) {
        if (this.gameEnded) return;
        
        if (this.gamePhase === 'placement') {
            this.handlePlacement(position);
        } else {
            this.handleMovement(position);
        }
    }
    
    handlePlacement(position) {
        if (this.board[position] !== null) return;
        
        this.board[position] = this.currentPlayer;
        this.piecesPlaced[this.currentPlayer]++;
        
        if (this.piecesPlaced[1] === 3 && this.piecesPlaced[2] === 3) {
            this.gamePhase = 'movement';
        }
        
        if (this.checkWin()) {
            this.gameEnded = true;
            alert(`Player ${this.currentPlayer} wins!`);
        } else {
            this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        }
        
        this.updateUI();
    }
    
    handleMovement(position) {
        if (this.selectedPosition === null) {
            if (this.board[position] === this.currentPlayer) {
                this.selectedPosition = position;
                this.highlightSelected(position);
            }
        } else {
            if (position === this.selectedPosition) {
                this.selectedPosition = null;
                this.clearHighlight();
            } else if (this.isValidMove(this.selectedPosition, position)) {
                this.board[position] = this.currentPlayer;
                this.board[this.selectedPosition] = null;
                this.selectedPosition = null;
                this.clearHighlight();
                
                if (this.checkWin()) {
                    this.gameEnded = true;
                    alert(`Player ${this.currentPlayer} wins!`);
                } else {
                    this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
                }
            } else {
                this.selectedPosition = null;
                this.clearHighlight();
            }
        }
        
        this.updateUI();
    }
    
    isValidMove(from, to) {
        if (this.board[to] !== null) return false;
        
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
    
    checkWin() {
        const winPatterns = [
            [0, 1, 2], [1, 2, 3], [2, 3, 4], [3, 4, 5],
            [4, 5, 6], [5, 6, 7], [6, 7, 0], [7, 0, 1],
            [0, 4, 8], [1, 5, 8], [2, 6, 8], [3, 7, 8]
        ];
        
        return winPatterns.some(pattern => 
            pattern.every(pos => this.board[pos] === this.currentPlayer)
        );
    }
    
    highlightSelected(position) {
        const cell = document.querySelector(`[data-position="${position}"]`);
        cell.classList.add('selected');
    }
    
    clearHighlight() {
        document.querySelectorAll('.cell').forEach(cell => {
            cell.classList.remove('selected');
        });
    }
    
    updateUI() {
        document.getElementById('current-player').textContent = `Player ${this.currentPlayer}`;
        document.getElementById('game-phase').textContent = this.gamePhase === 'placement' ? 'Placement' : 'Movement';
        document.getElementById('remaining-pieces').textContent = 
            this.gamePhase === 'placement' ? (3 - this.piecesPlaced[this.currentPlayer]) : 'N/A';
        
        const cells = document.querySelectorAll('.cell');
        cells.forEach((cell, index) => {
            cell.classList.remove('player1', 'player2');
            if (this.board[index] === 1) {
                cell.classList.add('player1');
            } else if (this.board[index] === 2) {
                cell.classList.add('player2');
            }
        });
    }
    
    resetGame() {
        this.board = new Array(9).fill(null);
        this.currentPlayer = 1;
        this.gamePhase = 'placement';
        this.piecesPlaced = { 1: 0, 2: 0 };
        this.selectedPosition = null;
        this.gameEnded = false;
        this.clearHighlight();
        this.updateUI();
    }
}

const game = new RotaGame();