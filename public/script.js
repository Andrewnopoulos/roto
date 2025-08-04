class RotoGame {
    constructor() {
        this.socket = io();
        this.currentRoom = null;
        this.playerNumber = null;
        this.gameBoard = new Array(9).fill(null);
        this.gameActive = false;
        this.gamePhase = 'placement';
        this.currentPlayer = 1;
        this.selectedPosition = null;
        this.connectionStatus = 'connecting';
        
        this.initializeElements();
        this.bindEvents();
        this.setupSocketListeners();
        this.setupConnectionHandling();
        this.checkForDirectRoomJoin();
    }
    
    initializeElements() {
        // Screens
        this.menuScreen = document.getElementById('menu');
        this.lobbyScreen = document.getElementById('lobby');
        this.gameScreen = document.getElementById('game');
        
        // Connection status
        this.connectionStatus = document.getElementById('connection-status');
        this.connectionText = document.getElementById('connection-text');
        
        // Menu elements
        this.roomIdInput = document.getElementById('roomId');
        this.joinRoomBtn = document.getElementById('joinRoom');
        this.createRoomBtn = document.getElementById('createRoom');
        
        // Lobby elements
        this.currentRoomIdSpan = document.getElementById('currentRoomId');
        this.playerCountSpan = document.getElementById('playerCount');
        this.waitingMessage = document.getElementById('waitingMessage');
        this.shareRoomBtn = document.getElementById('shareRoom');
        this.startGameBtn = document.getElementById('startGame');
        this.leaveRoomBtn = document.getElementById('leaveRoom');
        
        // Game elements
        this.gameRoomIdSpan = document.getElementById('gameRoomId');
        this.currentTurnSpan = document.getElementById('currentTurn');
        this.gamePhaseSpan = document.getElementById('gamePhase');
        this.playerRoleSpan = document.getElementById('playerRole');
        this.gameBoardSvg = document.getElementById('gameBoard');
        this.restartGameBtn = document.getElementById('restartGame');
        this.endGameBtn = document.getElementById('endGame');
        
        // Notifications
        this.notifications = document.getElementById('notifications');
        
        // Board cells
        this.cells = document.querySelectorAll('.cell');
    }
    
    bindEvents() {
        this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        this.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.shareRoomBtn.addEventListener('click', () => this.shareCurrentRoom());
        this.leaveRoomBtn.addEventListener('click', () => this.leaveRoom());
        this.startGameBtn.addEventListener('click', () => this.startGame());
        this.restartGameBtn.addEventListener('click', () => this.restartGame());
        this.endGameBtn.addEventListener('click', () => this.endGame());
        
        // Enter key support
        this.roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinRoom();
            }
        });
        
        // Board cell clicks
        this.cells.forEach(cell => {
            cell.addEventListener('click', (e) => {
                const position = parseInt(e.target.dataset.position);
                this.handleCellClick(position);
            });
        });
    }
    
    setupSocketListeners() {
        this.socket.on('connect', () => {
            this.setConnectionStatus('connected', 'Connected');
        });
        
        this.socket.on('disconnect', () => {
            this.setConnectionStatus('disconnected', 'Disconnected');
            this.gameActive = false;
        });
        
        this.socket.on('room-joined', (roomId) => {
            this.currentRoom = roomId;
            this.showLobby();
            this.currentRoomIdSpan.textContent = roomId;
            this.showNotification('Joined room successfully', 'success');
        });
        
        this.socket.on('player-joined', (playerCount) => {
            this.playerCountSpan.textContent = playerCount;
            if (playerCount === 2) {
                this.startGameBtn.style.display = 'block';
                this.waitingMessage.textContent = 'Ready to start!';
            } else {
                this.startGameBtn.style.display = 'none';
                this.waitingMessage.textContent = 'Waiting for another player...';
            }
        });
        
        this.socket.on('player-left', () => {
            this.playerCountSpan.textContent = '1';
            this.startGameBtn.style.display = 'none';
            this.waitingMessage.textContent = 'Waiting for another player...';
            if (this.gameActive) {
                this.showNotification('Other player left the game', 'warning');
                this.resetGame();
            }
        });
        
        this.socket.on('game-started', (data) => {
            this.playerNumber = data.playerNumber;
            this.gameActive = true;
            this.gamePhase = 'placement';
            this.currentPlayer = 1;
            this.gameBoard = new Array(9).fill(null);
            this.selectedPosition = null;
            this.showGame();
            this.gameRoomIdSpan.textContent = data.roomId;
            this.playerRoleSpan.textContent = `Player ${this.playerNumber}`;
            this.updateGameDisplay();
            this.showNotification('Game started!', 'success');
        });
        
        this.socket.on('move-made', (move) => {
            this.showNotification(`Player ${move.playerNumber} made a move`, 'info');
        });
        
        this.socket.on('game-state-update', (state) => {
            this.gameBoard = state.board;
            this.currentPlayer = state.currentPlayer;
            this.gamePhase = state.gamePhase;
            this.selectedPosition = state.selectedPosition;
            this.updateGameDisplay();
        });
        
        this.socket.on('game-over', (data) => {
            this.gameActive = false;
            this.restartGameBtn.style.display = 'inline-block';
            if (data.winner) {
                const winnerText = data.winner === this.playerNumber ? 'You win!' : 'You lose!';
                this.showNotification(winnerText, data.winner === this.playerNumber ? 'success' : 'error');
            } else {
                this.showNotification('Game ended in a draw!', 'info');
            }
        });
        
        this.socket.on('game-restarted', (data) => {
            this.gameActive = true;
            this.gameBoard = data.board;
            this.currentPlayer = data.currentPlayer;
            this.gamePhase = data.gamePhase;
            this.selectedPosition = null;
            this.restartGameBtn.style.display = 'none';
            this.updateGameDisplay();
            this.showGame();
            const playerText = this.currentPlayer === this.playerNumber ? 'You go first!' : 'Opponent goes first!';
            this.showNotification(`New game started! ${playerText}`, 'info');
        });
        
        this.socket.on('game-ended', () => {
            this.resetGame();
            this.currentRoom = null;
            this.showMenu();
            this.showNotification('Game ended by opponent', 'info');
        });
        
        this.socket.on('error', (error) => {
            this.showNotification(error, 'error');
        });
    }
    
    setupConnectionHandling() {
        this.socket.on('connect_error', () => {
            this.setConnectionStatus('error', 'Connection Error');
        });
        
        this.socket.on('reconnect', () => {
            this.setConnectionStatus('connected', 'Reconnected');
        });
    }
    
    setConnectionStatus(status, text) {
        this.connectionStatus.className = `connection-status ${status}`;
        this.connectionText.textContent = text;
    }
    
    joinRoom() {
        const roomId = this.roomIdInput.value.trim();
        if (!roomId) {
            this.showNotification('Please enter a room ID', 'error');
            return;
        }
        
        if (!/^[A-Za-z0-9]+$/.test(roomId)) {
            this.showNotification('Room ID can only contain letters and numbers', 'error');
            return;
        }
        
        this.socket.emit('join-room', roomId);
    }
    
    createRoom() {
        const roomId = this.generateRoomId();
        this.roomIdInput.value = roomId;
        this.socket.emit('join-room', roomId);
    }
    
    leaveRoom() {
        if (this.currentRoom) {
            this.socket.emit('leave-room', this.currentRoom);
            this.currentRoom = null;
            this.showMenu();
        }
    }
    
    startGame() {
        if (this.currentRoom) {
            this.socket.emit('start-game', this.currentRoom);
        }
    }
    
    restartGame() {
        if (this.currentRoom) {
            this.socket.emit('restart-game', this.currentRoom);
            this.showNotification('Restarting game...', 'info');
        }
    }
    
    endGame() {
        if (this.currentRoom) {
            this.socket.emit('end-game', this.currentRoom);
            this.socket.emit('leave-room', this.currentRoom);
            this.currentRoom = null;
            this.resetGame();
            this.showMenu();
        }
    }
    
    handleCellClick(position) {
        if (!this.gameActive || this.currentPlayer !== this.playerNumber) {
            return;
        }
        
        this.socket.emit('make-move', {
            roomId: this.currentRoom,
            position: position
        });
    }
    
    updateGameDisplay() {
        // Update game info
        this.currentTurnSpan.textContent = `Player ${this.currentPlayer}`;
        this.gamePhaseSpan.textContent = this.gamePhase === 'placement' ? 'Placement' : 'Movement';
        
        // Update board display
        this.cells.forEach((cell, index) => {
            cell.classList.remove('player1', 'player2', 'selected');
            
            if (this.gameBoard[index] === 1) {
                cell.classList.add('player1');
            } else if (this.gameBoard[index] === 2) {
                cell.classList.add('player2');
            }
            
            if (this.selectedPosition === index) {
                cell.classList.add('selected');
            }
        });
        
        // Add turn indicator
        if (this.currentPlayer === this.playerNumber) {
            this.gameBoardSvg.classList.add('your-turn');
        } else {
            this.gameBoardSvg.classList.remove('your-turn');
        }
    }
    
    resetGame() {
        this.gameActive = false;
        this.gameBoard = new Array(9).fill(null);
        this.selectedPosition = null;
        this.restartGameBtn.style.display = 'none';
        this.showLobby();
    }
    
    showMenu() {
        this.hideAllScreens();
        this.menuScreen.classList.add('active');
    }
    
    showLobby() {
        this.hideAllScreens();
        this.lobbyScreen.classList.add('active');
    }
    
    showGame() {
        this.hideAllScreens();
        this.gameScreen.classList.add('active');
    }
    
    hideAllScreens() {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
    }
    
    generateRoomId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        this.notifications.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
    
    // Check if user visited a direct room URL
    checkForDirectRoomJoin() {
        const path = window.location.pathname;
        const roomMatch = path.match(/^\/room\/([A-Za-z0-9]+)$/);
        
        if (roomMatch) {
            const roomId = roomMatch[1];
            console.log('Direct room join detected:', roomId);
            
            // Set the room ID in the input and show a message
            this.roomIdInput.value = roomId;
            this.showNotification(`Joining room: ${roomId}`, 'info');
            
            // Auto-join the room after a short delay to ensure socket is connected
            setTimeout(() => {
                if (this.socket.connected) {
                    this.socket.emit('join-room', roomId);
                } else {
                    // If not connected yet, wait for connection
                    this.socket.once('connect', () => {
                        this.socket.emit('join-room', roomId);
                    });
                }
            }, 500);
        }
    }
    
    // Generate shareable room URL
    generateRoomUrl(roomId) {
        const baseUrl = window.location.origin;
        return `${baseUrl}/room/${roomId}`;
    }
    
    // Copy room URL to clipboard
    async copyRoomUrl(roomId) {
        const url = this.generateRoomUrl(roomId);
        try {
            await navigator.clipboard.writeText(url);
            this.showNotification('Room URL copied to clipboard!', 'success');
        } catch (err) {
            // Fallback for browsers that don't support clipboard API
            this.showNotification(`Share this URL: ${url}`, 'info');
        }
    }
    
    // Share current room URL
    shareCurrentRoom() {
        if (this.currentRoom) {
            this.copyRoomUrl(this.currentRoom);
        } else {
            this.showNotification('No active room to share', 'error');
        }
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new RotoGame();
});