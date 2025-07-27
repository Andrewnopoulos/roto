// NetworkManager - Handles WebSocket connection and communication
class NetworkManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.connectionCallbacks = [];
        this.eventHandlers = {};
    }

    connect(serverUrl = window.location.origin) {
        return new Promise((resolve, reject) => {
            try {
                this.socket = io(serverUrl);
                this.setupEventHandlers();
                
                this.socket.on('connect', () => {
                    this.isConnected = true;
                    this.updateConnectionStatus('online');
                    console.log('Connected to server');
                    resolve();
                });

                this.socket.on('disconnect', () => {
                    this.isConnected = false;
                    this.updateConnectionStatus('offline');
                    console.log('Disconnected from server');
                });

                this.socket.on('connect_error', (error) => {
                    this.isConnected = false;
                    this.updateConnectionStatus('offline');
                    console.error('Connection error:', error);
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    setupEventHandlers() {
        // Handle server events
        this.socket.on('error', (error) => {
            this.handleError(error);
        });

        this.socket.on('gameJoined', (data) => {
            this.emit('gameJoined', data);
        });

        this.socket.on('gameState', (data) => {
            this.emit('gameState', data);
        });

        this.socket.on('gameUpdate', (data) => {
            this.emit('gameUpdate', data);
        });

        this.socket.on('gameEnded', (data) => {
            this.emit('gameEnded', data);
        });

        this.socket.on('opponentDisconnected', (data) => {
            this.emit('opponentDisconnected', data);
        });

        this.socket.on('chatMessage', (data) => {
            this.emit('chatMessage', data);
        });
        
        // Enhanced matchmaking events
        this.socket.on('loginSuccess', (data) => {
            this.emit('loginSuccess', data);
        });
        
        this.socket.on('loginError', (data) => {
            this.emit('loginError', data);
        });
        
        this.socket.on('queueJoined', (data) => {
            this.emit('queueJoined', data);
        });
        
        this.socket.on('queueUpdate', (data) => {
            this.emit('queueUpdate', data);
        });
        
        this.socket.on('queueLeft', (data) => {
            this.emit('queueLeft', data);
        });
        
        this.socket.on('matchFound', (data) => {
            this.emit('matchFound', data);
        });
        
        this.socket.on('playerProfile', (data) => {
            this.emit('playerProfile', data);
        });
        
        // Leaderboard and ranking events
        this.socket.on('rankChange', (data) => {
            this.emit('rankChange', data);
        });
        
        this.socket.on('achievementUnlocked', (data) => {
            this.emit('achievementUnlocked', data);
        });
        
        this.socket.on('leaderboardUpdate', (data) => {
            this.emit('leaderboardUpdate', data);
        });
        
        this.socket.on('seasonUpdate', (data) => {
            this.emit('seasonUpdate', data);
        });
        
        this.socket.on('ratingUpdate', (data) => {
            this.emit('ratingUpdate', data);
        });
        
        this.socket.on('achievementUnlocked', (data) => {
            this.emit('achievementUnlocked', data);
        });
    }

    // Event system for communication with game client
    on(event, callback) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(callback);
    }

    emit(event, data) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(callback => callback(data));
        }
    }

    // Network operations
    joinGame(playerName) {
        if (this.isConnected) {
            this.socket.emit('joinGame', { playerName });
        }
    }

    makeMove(moveData) {
        if (this.isConnected) {
            this.socket.emit('makeMove', moveData);
        }
    }

    sendChatMessage(message) {
        if (this.isConnected) {
            this.socket.emit('chatMessage', { message });
        }
    }

    forfeitGame() {
        if (this.isConnected) {
            this.socket.emit('forfeitGame');
        }
    }

    leaveGame() {
        if (this.isConnected) {
            this.socket.emit('leaveGame');
        }
    }

    updateConnectionStatus(status) {
        const indicator = document.getElementById('connection-indicator');
        const text = document.getElementById('connection-text');
        
        indicator.className = `status-indicator ${status}`;
        
        switch (status) {
            case 'online':
                text.textContent = 'Connected';
                break;
            case 'offline':
                text.textContent = 'Disconnected';
                break;
            case 'connecting':
                text.textContent = 'Connecting...';
                break;
        }
    }

    handleError(error) {
        console.error('Network error:', error);
        this.showError(error.message || 'Network error occurred');
    }

    showError(message) {
        const errorContainer = document.getElementById('error-container');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        
        errorContainer.appendChild(errorDiv);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }
}

// RotaGameRenderer - Handles local game board rendering and validation
class RotaGameRenderer {
    constructor() {
        this.board = new Array(9).fill(null);
        this.selectedPosition = null;
        this.isInteractive = false;
        this.currentPlayerNumber = null;
        this.myPlayerNumber = null;
        
        this.initializeBoard();
    }
    
    initializeBoard() {
        const cells = document.querySelectorAll('.cell');
        cells.forEach((cell, index) => {
            cell.addEventListener('click', () => this.handleCellClick(index));
        });
    }
    
    handleCellClick(position) {
        if (!this.isInteractive) return;
        if (this.currentPlayerNumber !== this.myPlayerNumber) return;
        
        // Emit click event to be handled by MultiplayerGameClient
        this.onCellClick && this.onCellClick(position);
    }
    
    setInteractive(interactive) {
        this.isInteractive = interactive;
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            if (interactive) {
                cell.classList.remove('disabled');
            } else {
                cell.classList.add('disabled');
            }
        });
    }
    
    updateBoard(board) {
        this.board = [...board];
        this.renderBoard();
    }
    
    renderBoard() {
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
    
    highlightSelected(position) {
        this.clearHighlight();
        if (position !== null) {
            const cell = document.querySelector(`[data-position="${position}"]`);
            cell.classList.add('selected');
            this.selectedPosition = position;
        }
    }
    
    clearHighlight() {
        document.querySelectorAll('.cell').forEach(cell => {
            cell.classList.remove('selected');
        });
        this.selectedPosition = null;
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
    
    isValidMove(from, to) {
        if (this.board[to] !== null) return false;
        
        const connections = this.getConnections();
        return connections[from] && connections[from].includes(to);
    }
}

// MultiplayerGameClient - Main game client for multiplayer functionality
class MultiplayerGameClient {
    constructor() {
        this.networkManager = new NetworkManager();
        this.gameRenderer = new RotaGameRenderer();
        this.gameState = null;
        this.myPlayerInfo = null;
        this.isInGame = false;
        this.chatVisible = false;
        
        this.setupNetworkHandlers();
        this.setupUIHandlers();
        this.setupGameRenderer();
        
        // Initialize connection
        this.init();
    }
    
    async init() {
        try {
            this.networkManager.updateConnectionStatus('connecting');
            await this.networkManager.connect();
            this.showLobby();
        } catch (error) {
            console.error('Failed to connect:', error);
            this.showToast('Failed to connect to server. Please try again.', 'error');
        }
    }
    
    // Handle login response
    handleLoginSuccess(data) {
        this.isLoggedIn = true;
        this.myPlayerInfo = data.player;
        
        // Load player profile
        this.profileManager.updatePlayerProfile(data.profile);
        
        // Show matchmaking section
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('matchmaking-section').style.display = 'block';
        
        this.showToast(`Welcome back, ${data.player.name}!`, 'success');
    }
    
    setupNetworkHandlers() {
        this.networkManager.on('gameJoined', (data) => {
            this.myPlayerInfo = data.player;
            this.gameState = data.gameState;
            this.isInGame = true;
            this.showGame();
            this.updateGameState(this.gameState);
        });
        
        this.networkManager.on('gameState', (data) => {
            this.gameState = data;
            this.updateGameState(data);
        });
        
        this.networkManager.on('gameUpdate', (data) => {
            this.gameState = data.gameState;
            this.updateGameState(data.gameState);
        });
        
        this.networkManager.on('gameEnded', (data) => {
            this.handleGameEnd(data);
        });
        
        this.networkManager.on('opponentDisconnected', (data) => {
            this.handleOpponentDisconnected(data);
        });
        
        this.networkManager.on('chatMessage', (data) => {
            this.addChatMessage(data);
        });
        
        // Enhanced network handlers
        this.networkManager.on('loginSuccess', (data) => {
            this.handleLoginSuccess(data);
        });
        
        this.networkManager.on('loginError', (data) => {
            this.showToast(data.message || 'Login failed', 'error');
        });
    }
    
    setupUIHandlers() {
        // Lobby handlers
        document.getElementById('join-game-btn').addEventListener('click', () => {
            this.joinGame();
        });
        
        document.getElementById('quick-match-btn').addEventListener('click', () => {
            this.quickMatch();
        });
        
        document.getElementById('practice-mode-btn').addEventListener('click', () => {
            this.practiceMode();
        });
        
        document.getElementById('cancel-search-btn').addEventListener('click', () => {
            this.cancelSearch();
        });
        
        // Game handlers
        document.getElementById('forfeit-btn').addEventListener('click', () => {
            this.forfeitGame();
        });
        
        document.getElementById('leave-game-btn').addEventListener('click', () => {
            this.leaveGame();
        });
        
        // Modal handlers
        document.getElementById('play-again-btn').addEventListener('click', () => {
            this.playAgain();
        });
        
        document.getElementById('back-to-lobby-btn').addEventListener('click', () => {
            this.backToLobby();
        });
        
        // Chat handlers
        document.getElementById('toggle-chat-btn').addEventListener('click', () => {
            this.toggleChat();
        });
        
        document.getElementById('send-chat-btn').addEventListener('click', () => {
            this.sendChatMessage();
        });
        
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });
        
        // Enter key for player name
        document.getElementById('player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinGame();
            }
        });
    }
    
    setupGameRenderer() {
        this.gameRenderer.onCellClick = (position) => {
            this.handleCellClick(position);
        };
    }
    
    handleCellClick(position) {
        if (!this.gameState || !this.isMyTurn()) return;
        
        if (this.gameState.phase === 'placement') {
            this.handlePlacement(position);
        } else {
            this.handleMovement(position);
        }
    }
    
    handlePlacement(position) {
        if (this.gameRenderer.board[position] !== null) return;
        
        this.networkManager.makeMove({
            type: 'placement',
            position: position
        });
    }
    
    handleMovement(position) {
        if (this.gameRenderer.selectedPosition === null) {
            // Select piece
            if (this.gameRenderer.board[position] === this.myPlayerInfo.playerNumber) {
                this.gameRenderer.highlightSelected(position);
            }
        } else {
            // Move piece or deselect
            if (position === this.gameRenderer.selectedPosition) {
                this.gameRenderer.clearHighlight();
            } else if (this.gameRenderer.isValidMove(this.gameRenderer.selectedPosition, position)) {
                this.networkManager.makeMove({
                    type: 'movement',
                    from: this.gameRenderer.selectedPosition,
                    to: position
                });
                this.gameRenderer.clearHighlight();
            } else {
                this.gameRenderer.clearHighlight();
            }
        }
    }
    
    // UI Management Methods
    showLobby() {
        document.getElementById('lobby-interface').style.display = 'block';
        document.getElementById('game-interface').style.display = 'none';
        document.getElementById('chat-interface').style.display = 'none';
        document.getElementById('game-result-modal').style.display = 'none';
        this.isInGame = false;
    }
    
    showGame() {
        document.getElementById('lobby-interface').style.display = 'none';
        document.getElementById('game-interface').style.display = 'block';
        document.getElementById('chat-interface').style.display = 'block';
        this.gameRenderer.setInteractive(true);
    }
    
    showMatchmakingLoader() {
        document.querySelector('.lobby-section').style.display = 'none';
        document.getElementById('matchmaking-loading').style.display = 'block';
    }
    
    hideMatchmakingLoader() {
        document.querySelector('.lobby-section').style.display = 'block';
        document.getElementById('matchmaking-loading').style.display = 'none';
    }
    
    // Game Actions
    joinGame() {
        const playerName = document.getElementById('player-name').value.trim();
        if (!playerName) {
            this.networkManager.showError('Please enter your name');
            return;
        }
        
        this.showMatchmakingLoader();
        this.networkManager.joinGame(playerName);
    }
    
    quickMatch() {
        const playerName = document.getElementById('player-name').value.trim() || 'Player';
        this.showMatchmakingLoader();
        this.networkManager.joinGame(playerName);
    }
    
    practiceMode() {
        // For now, show an info message about practice mode
        this.networkManager.showError('Practice mode coming soon! Use Quick Match to play against others.');
    }
    
    cancelSearch() {
        this.hideMatchmakingLoader();
        // TODO: Send cancel search to server
    }
    
    forfeitGame() {
        if (confirm('Are you sure you want to forfeit the game?')) {
            this.networkManager.forfeitGame();
        }
    }
    
    leaveGame() {
        if (confirm('Are you sure you want to leave the game?')) {
            this.networkManager.leaveGame();
            this.showLobby();
        }
    }
    
    playAgain() {
        document.getElementById('game-result-modal').style.display = 'none';
        this.showLobby();
        // Auto-start new game search
        const playerName = this.myPlayerInfo ? this.myPlayerInfo.name : 'Player';
        document.getElementById('player-name').value = playerName;
        this.quickMatch();
    }
    
    backToLobby() {
        document.getElementById('game-result-modal').style.display = 'none';
        this.showLobby();
    }
    
    // Game State Management
    updateGameState(gameState) {
        this.gameState = gameState;
        this.gameRenderer.updateBoard(gameState.board);
        this.gameRenderer.currentPlayerNumber = gameState.currentPlayer;
        this.gameRenderer.myPlayerNumber = this.myPlayerInfo ? this.myPlayerInfo.playerNumber : null;
        
        this.updateGameInfo(gameState);
        this.updatePlayerInfo(gameState);
        this.updateTurnIndicator(gameState);
        
        // Update interactivity based on turn
        this.gameRenderer.setInteractive(this.isMyTurn() && gameState.status === 'active');
    }
    
    updateGameInfo(gameState) {
        document.getElementById('current-player').textContent = 
            gameState.currentPlayer === this.myPlayerInfo.playerNumber ? 'Your Turn' : 'Opponent\'s Turn';
        
        document.getElementById('game-phase').textContent = 
            gameState.phase === 'placement' ? 'Placement Phase' : 'Movement Phase';
        
        const remainingPieces = gameState.phase === 'placement' ? 
            (3 - (gameState.piecesPlaced[gameState.currentPlayer] || 0)) : 'N/A';
        document.getElementById('remaining-pieces').textContent = remainingPieces;
        
        document.getElementById('game-status').textContent = this.getGameStatusText(gameState);
    }
    
    updatePlayerInfo(gameState) {
        if (!this.myPlayerInfo) return;
        
        const isPlayer1 = this.myPlayerInfo.playerNumber === 1;
        const myCard = isPlayer1 ? 'player1-card' : 'player2-card';
        const opponentCard = isPlayer1 ? 'player2-card' : 'player1-card';
        
        // Update my info
        document.getElementById(isPlayer1 ? 'player1-name' : 'player2-name').textContent = 
            this.myPlayerInfo.name;
        document.getElementById(isPlayer1 ? 'player1-status' : 'player2-status').textContent = 
            gameState.currentPlayer === this.myPlayerInfo.playerNumber ? 'Your Turn' : 'Waiting';
        
        // Update player rating display
        document.getElementById(isPlayer1 ? 'player1-rating' : 'player2-rating').textContent = 
            this.myPlayerInfo.rating || 1200;
        document.getElementById(isPlayer1 ? 'player1-tier' : 'player2-tier').textContent = 
            this.getTierName(this.myPlayerInfo.rating || 1200);
        
        // Update opponent info
        const opponent = gameState.players.find(p => p.playerNumber !== this.myPlayerInfo.playerNumber);
        if (opponent) {
            document.getElementById(isPlayer1 ? 'player2-name' : 'player1-name').textContent = 
                opponent.name;
            document.getElementById(isPlayer1 ? 'player2-status' : 'player1-status').textContent = 
                gameState.currentPlayer === opponent.playerNumber ? 'Playing' : 'Waiting';
            
            // Update opponent rating display (simulate opponent rating)
            const opponentRating = opponent.rating || (1200 + Math.floor(Math.random() * 400));
            document.getElementById(isPlayer1 ? 'player2-rating' : 'player1-rating').textContent = 
                opponentRating;
            document.getElementById(isPlayer1 ? 'player2-tier' : 'player1-tier').textContent = 
                this.getTierName(opponentRating);
        }
    }
    
    getTierName(rating) {
        if (rating >= 2400) return 'Grandmaster';
        if (rating >= 2200) return 'Master';
        if (rating >= 2000) return 'Diamond';
        if (rating >= 1800) return 'Platinum';
        if (rating >= 1600) return 'Gold';
        if (rating >= 1400) return 'Silver';
        return 'Bronze';
    }
    
    updateTurnIndicator(gameState) {
        const indicator = document.getElementById('turn-indicator');
        const message = document.getElementById('turn-message');
        
        if (this.isMyTurn()) {
            indicator.className = 'turn-indicator your-turn';
            message.textContent = 'Your turn - make a move!';
        } else {
            indicator.className = 'turn-indicator opponent-turn';
            message.textContent = 'Waiting for opponent...';
        }
    }
    
    getGameStatusText(gameState) {
        switch (gameState.status) {
            case 'waiting':
                return 'Waiting for players...';
            case 'active':
                return 'Game in progress';
            case 'ended':
                return 'Game ended';
            default:
                return 'Unknown status';
        }
    }
    
    isMyTurn() {
        return this.gameState && 
               this.myPlayerInfo && 
               this.gameState.currentPlayer === this.myPlayerInfo.playerNumber;
    }
    
    // Game End Handling
    handleGameEnd(data) {
        const modal = document.getElementById('game-result-modal');
        const title = document.getElementById('result-title');
        const message = document.getElementById('result-message');
        const ratingChanges = document.getElementById('rating-changes');
        
        // Set result content
        if (data.winner) {
            if (data.winner === this.myPlayerInfo.playerNumber) {
                title.textContent = 'Victory!';
                message.textContent = 'Congratulations! You won the game!';
                document.getElementById('result-icon').textContent = '🏆';
            } else {
                title.textContent = 'Defeat';
                message.textContent = 'Better luck next time!';
                document.getElementById('result-icon').textContent = '😔';
            }
        } else {
            title.textContent = 'Game Over';
            message.textContent = data.reason || 'The game has ended.';
            document.getElementById('result-icon').textContent = '🎮';
        }
        
        // Show rating changes for ranked games
        if (data.ranked && data.ratingChange) {
            this.showRatingChanges(data);
            ratingChanges.style.display = 'block';
        } else {
            ratingChanges.style.display = 'none';
        }
        
        // Simulate some ranking data for demo
        if (data.winner === this.myPlayerInfo.playerNumber) {
            this.simulateVictoryRankingData();
        } else if (data.winner) {
            this.simulateDefeatRankingData();
        }
        
        modal.style.display = 'flex';
        this.gameRenderer.setInteractive(false);
    }
    
    showRatingChanges(data) {
        const oldRating = this.myPlayerInfo.rating || 1200;
        const newRating = oldRating + (data.ratingChange || 0);
        const ratingChange = data.ratingChange || 0;
        
        document.getElementById('old-rating-value').textContent = oldRating;
        document.getElementById('new-rating-value').textContent = newRating;
        document.getElementById('rating-change-text').textContent = 
            `${ratingChange >= 0 ? '+' : ''}${ratingChange}`;
        
        // Update rating change color
        const changeElement = document.getElementById('rating-change-text');
        changeElement.className = ratingChange >= 0 ? 'positive' : 'negative';
        
        // Update player rating
        this.myPlayerInfo.rating = newRating;
    }
    
    simulateVictoryRankingData() {
        // Simulate rank improvement for victory
        const rankImprovement = Math.floor(Math.random() * 20) + 5; // 5-25 rank improvement
        const oldRank = Math.floor(Math.random() * 1000) + 200;
        const newRank = oldRank - rankImprovement;
        
        // Update rank display
        document.getElementById('rank-movement').textContent = `↑ +${rankImprovement}`;
        document.getElementById('rank-movement').className = 'rank-movement up';
        document.querySelector('.old-rank').textContent = `#${oldRank}`;
        document.getElementById('new-rank-value').textContent = `#${newRank}`;
        
        // Show progress to next milestone
        this.updateRankProgress(true);
        
        // Possibly show achievement
        if (rankImprovement >= 20) {
            setTimeout(() => {
                this.showAchievementInResult({
                    name: 'Big Climber',
                    description: 'Climb 20+ ranks in a single game'
                });
            }, 1000);
        }
        
        // Send notification to leaderboard manager
        if (window.gameClient.leaderboardManager) {
            window.gameClient.leaderboardManager.handleRankChange({
                rank_change: rankImprovement,
                new_rank: newRank,
                old_rank: oldRank
            });
        }
    }
    
    simulateDefeatRankingData() {
        // Simulate smaller rank decrease for defeat
        const rankDecrease = Math.floor(Math.random() * 15) + 1; // 1-15 rank decrease
        const oldRank = Math.floor(Math.random() * 1000) + 200;
        const newRank = oldRank + rankDecrease;
        
        // Update rank display
        document.getElementById('rank-movement').textContent = `↓ -${rankDecrease}`;
        document.getElementById('rank-movement').className = 'rank-movement down';
        document.querySelector('.old-rank').textContent = `#${oldRank}`;
        document.getElementById('new-rank-value').textContent = `#${newRank}`;
        
        // Show progress to next milestone
        this.updateRankProgress(false);
        
        // Send notification to leaderboard manager
        if (window.gameClient.leaderboardManager) {
            window.gameClient.leaderboardManager.handleRankChange({
                rank_change: -rankDecrease,
                new_rank: newRank,
                old_rank: oldRank
            });
        }
    }
    
    updateRankProgress(isVictory) {
        const progressFill = document.getElementById('rank-progress-fill');
        const progressText = document.getElementById('rank-progress-text');
        const progressTarget = document.getElementById('progress-target');
        
        const currentProgress = parseInt(progressFill.style.width) || 50;
        const progressChange = isVictory ? Math.floor(Math.random() * 20) + 10 : -(Math.floor(Math.random() * 10) + 5);
        const newProgress = Math.max(0, Math.min(100, currentProgress + progressChange));
        
        progressFill.style.width = `${newProgress}%`;
        progressText.textContent = `${newProgress} / 100 points`;
        
        // Update target based on current rating tier
        const currentRating = this.myPlayerInfo.rating || 1200;
        if (currentRating < 1400) {
            progressTarget.textContent = 'Silver Tier';
        } else if (currentRating < 1600) {
            progressTarget.textContent = 'Gold Tier';
        } else if (currentRating < 1800) {
            progressTarget.textContent = 'Platinum Tier';
        } else {
            progressTarget.textContent = 'Diamond Tier';
        }
    }
    
    showAchievementInResult(achievement) {
        const achievementElement = document.getElementById('achievement-unlock');
        const nameElement = document.getElementById('achievement-name');
        const descElement = document.getElementById('achievement-description');
        
        nameElement.textContent = achievement.name;
        descElement.textContent = achievement.description;
        achievementElement.style.display = 'flex';
        
        // Also trigger the main achievement popup
        if (window.gameClient.leaderboardManager) {
            window.gameClient.leaderboardManager.showAchievementUnlock({
                ...achievement,
                icon: '🏆'
            });
        }
    }
    
    handleOpponentDisconnected(data) {
        this.networkManager.showError('Your opponent has disconnected. You win by default!');
        this.handleGameEnd({
            winner: this.myPlayerInfo.playerNumber,
            reason: 'Opponent disconnected'
        });
    }
    
    // Chat Functionality
    toggleChat() {
        this.chatVisible = !this.chatVisible;
        const chatMessages = document.querySelector('.chat-messages');
        const chatInput = document.querySelector('.chat-input');
        const toggleBtn = document.getElementById('toggle-chat-btn');
        
        if (this.chatVisible) {
            chatMessages.style.display = 'block';
            chatInput.style.display = 'flex';
            toggleBtn.textContent = '−';
        } else {
            chatMessages.style.display = 'none';
            chatInput.style.display = 'none';
            toggleBtn.textContent = '+';
        }
    }
    
    sendChatMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        
        if (message) {
            this.networkManager.sendChatMessage(message);
            input.value = '';
        }
    }
    
    addChatMessage(data) {
        const chatMessages = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message';
        
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isMyMessage = data.playerId === this.myPlayerInfo.id;
        const senderName = isMyMessage ? 'You' : data.playerName;
        
        messageDiv.innerHTML = `
            <span class="sender">${senderName}:</span> ${data.message}
            <div class="timestamp">${timestamp}</div>
        `;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// ===============================================
// COMPREHENSIVE LEADERBOARD SYSTEM
// ===============================================

class LeaderboardManager {
    constructor(networkManager) {
        this.networkManager = networkManager;
        this.currentCategory = 'global_rating';
        this.currentPage = 1;
        this.currentSeason = null;
        this.playerData = null;
        this.leaderboardData = null;
        this.searchTimeout = null;
        this.seasonCountdownTimer = null;
        
        this.setupEventHandlers();
        this.setupRealtimeListeners();
    }
    
    setupEventHandlers() {
        // Navigation handlers
        document.getElementById('leaderboard-nav-btn').addEventListener('click', () => {
            this.showLeaderboard();
        });
        
        document.getElementById('matchmaking-nav-btn').addEventListener('click', () => {
            this.showMatchmaking();
        });
        
        document.getElementById('profile-nav-btn').addEventListener('click', () => {
            this.showProfile();
        });
        
        // Tab handlers
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchCategory(e.target.closest('.tab-btn').dataset.category);
            });
        });
        
        // Search handlers
        document.getElementById('player-search').addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });
        
        document.getElementById('search-btn').addEventListener('click', () => {
            this.executeSearch();
        });
        
        // Control handlers
        document.getElementById('find-my-rank-btn').addEventListener('click', () => {
            this.findMyRank();
        });
        
        document.getElementById('top-players-btn').addEventListener('click', () => {
            this.showTopPlayers();
        });
        
        // Pagination handlers
        document.getElementById('prev-page-btn').addEventListener('click', () => {
            this.changePage(this.currentPage - 1);
        });
        
        document.getElementById('next-page-btn').addEventListener('click', () => {
            this.changePage(this.currentPage + 1);
        });
        
        // Game result modal handler
        document.getElementById('view-leaderboard-result-btn').addEventListener('click', () => {
            document.getElementById('game-result-modal').style.display = 'none';
            this.showLeaderboard();
        });
        
        // Achievement popup handler
        document.getElementById('close-achievement-btn').addEventListener('click', () => {
            this.closeAchievementPopup();
        });
    }
    
    setupRealtimeListeners() {
        // Listen for real-time rank changes
        this.networkManager.on('rankChange', (data) => {
            this.handleRankChange(data);
        });
        
        // Listen for achievement unlocks
        this.networkManager.on('achievementUnlocked', (data) => {
            this.showAchievementUnlock(data);
        });
        
        // Listen for leaderboard updates
        this.networkManager.on('leaderboardUpdate', (data) => {
            this.handleLeaderboardUpdate(data);
        });
        
        // Listen for season updates
        this.networkManager.on('seasonUpdate', (data) => {
            this.updateSeasonInfo(data);
        });
    }
    
    // Navigation Methods
    showLeaderboard() {
        this.switchSection('leaderboard');
        this.loadLeaderboard();
        this.loadSeasonInfo();
    }
    
    showMatchmaking() {
        this.switchSection('matchmaking');
    }
    
    showProfile() {
        this.switchSection('profile');
    }
    
    switchSection(section) {
        // Hide all sections
        document.getElementById('matchmaking-section').style.display = 'none';
        document.getElementById('leaderboard-section').style.display = 'none';
        // Profile section is handled elsewhere
        
        // Show target section
        if (section === 'leaderboard') {
            document.getElementById('leaderboard-section').style.display = 'block';
        } else if (section === 'matchmaking') {
            document.getElementById('matchmaking-section').style.display = 'block';
        }
        
        // Update navigation buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-section="${section}"]`).classList.add('active');
    }
    
    // Category Management
    switchCategory(category) {
        this.currentCategory = category;
        this.currentPage = 1;
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-category="${category}"]`).classList.add('active');
        
        // Update rank display category
        document.getElementById('current-rank-category').textContent = 
            this.getCategoryDisplayName(category);
        
        this.loadLeaderboard();
    }
    
    getCategoryDisplayName(category) {
        const names = {
            'global_rating': 'Global Rating',
            'global_wins': 'Global Wins',
            'win_percentage': 'Win Percentage',
            'seasonal_rating': 'Seasonal Rating'
        };
        return names[category] || category;
    }
    
    // Data Loading
    async loadLeaderboard() {
        this.showLoading();
        
        try {
            const response = await fetch(`/api/leaderboards/${this.currentCategory}?page=${this.currentPage}&limit=50`);
            const data = await response.json();
            
            if (data.success) {
                this.leaderboardData = data.data;
                this.renderLeaderboard();
                this.updatePagination();
            } else {
                this.showError('Failed to load leaderboard');
            }
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            this.showMockLeaderboard(); // Fallback to mock data
        }
        
        this.hideLoading();
    }
    
    async loadSeasonInfo() {
        try {
            const response = await fetch('/api/seasons/current');
            const data = await response.json();
            
            if (data.success) {
                this.currentSeason = data.data;
                this.updateSeasonDisplay();
                this.startSeasonCountdown();
            }
        } catch (error) {
            console.error('Error loading season info:', error);
            this.showMockSeasonInfo();
        }
    }
    
    async loadPlayerRank() {
        if (!this.playerData) return;
        
        try {
            const response = await fetch(`/api/leaderboards/${this.currentCategory}/players/${this.playerData.id}/rank`);
            const data = await response.json();
            
            if (data.success) {
                this.updatePlayerRankDisplay(data.data);
            }
        } catch (error) {
            console.error('Error loading player rank:', error);
            // Use mock data
            this.updatePlayerRankDisplay({
                rank: Math.floor(Math.random() * 1000) + 1,
                rating: this.playerData.rating || 1200
            });
        }
    }
    
    // Rendering Methods
    renderLeaderboard() {
        const tbody = document.getElementById('leaderboard-tbody');
        tbody.innerHTML = '';
        
        if (!this.leaderboardData || !this.leaderboardData.players) {
            this.showEmptyState();
            return;
        }
        
        this.leaderboardData.players.forEach((player, index) => {
            const row = this.createLeaderboardRow(player, index);
            tbody.appendChild(row);
        });
        
        this.hideEmptyState();
    }
    
    createLeaderboardRow(player, index) {
        const row = document.createElement('tr');
        const rank = ((this.currentPage - 1) * 50) + index + 1;
        const isCurrentPlayer = this.playerData && player.id === this.playerData.id;
        
        if (isCurrentPlayer) {
            row.classList.add('current-player');
        }
        
        if (rank <= 3) {
            row.classList.add('top-3');
        }
        
        row.innerHTML = `
            <td class="rank-col">
                <div class="rank-display ${rank <= 3 ? 'top-' + rank : ''}">
                    ${rank <= 3 ? this.getRankMedal(rank) : ''}
                    ${rank}
                </div>
            </td>
            <td class="player-col">
                <div class="player-display">
                    <div class="player-avatar-small">
                        ${player.username.charAt(0).toUpperCase()}
                    </div>
                    <div class="player-info">
                        <div class="player-name-display">${player.username}</div>
                        <div class="player-tier-small">${this.getTierName(player.rating)}</div>
                    </div>
                </div>
            </td>
            <td class="rating-col">
                <div class="rating-display">
                    ${this.formatRating(player)}
                    ${this.formatRatingChange(player.rating_change_24h)}
                </div>
            </td>
            <td class="games-col">${player.games_played || 0}</td>
            <td class="winrate-col">
                <div class="winrate-display ${this.getWinRateClass(player.win_percentage)}">
                    ${player.win_percentage ? player.win_percentage.toFixed(1) + '%' : '0%'}
                </div>
            </td>
            <td class="streak-col">
                <div class="streak-display ${player.current_streak >= 0 ? 'win-streak' : 'loss-streak'}">
                    <span class="streak-icon">${player.current_streak >= 0 ? '🔥' : '❄️'}</span>
                    ${Math.abs(player.current_streak || 0)}
                </div>
            </td>
            <td class="change-col">
                ${this.formatRankChange(player.rank_change_24h)}
            </td>
        `;
        
        return row;
    }
    
    getRankMedal(rank) {
        const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
        return `<span class="rank-medal">${medals[rank]}</span>`;
    }
    
    getTierName(rating) {
        if (rating >= 2400) return 'Grandmaster';
        if (rating >= 2200) return 'Master';
        if (rating >= 2000) return 'Diamond';
        if (rating >= 1800) return 'Platinum';
        if (rating >= 1600) return 'Gold';
        if (rating >= 1400) return 'Silver';
        return 'Bronze';
    }
    
    formatRating(player) {
        const value = this.currentCategory === 'win_percentage' 
            ? (player.win_percentage || 0).toFixed(1) + '%'
            : player.rating || player.wins || 0;
        return value;
    }
    
    formatRatingChange(change) {
        if (!change) return '';
        
        const className = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
        const prefix = change > 0 ? '+' : '';
        
        return `<span class="rating-change ${className}">${prefix}${change}</span>`;
    }
    
    formatRankChange(change) {
        if (!change) return '<span class="rating-change neutral">-</span>';
        
        const isUp = change < 0; // Negative change means rank went up
        const className = isUp ? 'positive' : 'negative';
        const arrow = isUp ? '↗' : '↘';
        
        return `<span class="rating-change ${className}">${arrow} ${Math.abs(change)}</span>`;
    }
    
    getWinRateClass(winRate) {
        if (winRate >= 80) return 'excellent';
        if (winRate >= 60) return 'good';
        if (winRate >= 40) return 'average';
        return 'poor';
    }
    
    // Season Management
    updateSeasonDisplay() {
        if (!this.currentSeason) return;
        
        document.getElementById('current-season-name').textContent = this.currentSeason.name;
        document.getElementById('season-status').textContent = 
            this.currentSeason.is_active ? 'Active' : 'Inactive';
        
        const progress = this.calculateSeasonProgress();
        document.getElementById('season-progress-fill').style.width = `${progress}%`;
        document.getElementById('season-progress-text').textContent = `${progress}% Complete`;
    }
    
    calculateSeasonProgress() {
        if (!this.currentSeason) return 0;
        
        const start = new Date(this.currentSeason.start_date);
        const end = new Date(this.currentSeason.end_date);
        const now = new Date();
        
        const total = end - start;
        const elapsed = now - start;
        
        return Math.min(100, Math.max(0, (elapsed / total) * 100));
    }
    
    startSeasonCountdown() {
        if (this.seasonCountdownTimer) {
            clearInterval(this.seasonCountdownTimer);
        }
        
        this.seasonCountdownTimer = setInterval(() => {
            this.updateCountdownTimer();
        }, 1000);
        
        this.updateCountdownTimer();
    }
    
    updateCountdownTimer() {
        if (!this.currentSeason) return;
        
        const end = new Date(this.currentSeason.end_date);
        const now = new Date();
        const diff = end - now;
        
        if (diff <= 0) {
            document.getElementById('season-timer').textContent = 'Season Ended';
            clearInterval(this.seasonCountdownTimer);
            return;
        }
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        document.getElementById('season-timer').textContent = `${days}d ${hours}h ${minutes}m`;
    }
    
    // Search and Pagination
    handleSearch(query) {
        clearTimeout(this.searchTimeout);
        
        this.searchTimeout = setTimeout(() => {
            if (query.trim()) {
                this.executeSearch(query.trim());
            } else {
                this.loadLeaderboard();
            }
        }, 500);
    }
    
    async executeSearch(query = null) {
        const searchQuery = query || document.getElementById('player-search').value.trim();
        
        if (!searchQuery) {
            this.loadLeaderboard();
            return;
        }
        
        this.showLoading();
        
        try {
            // Mock search functionality
            this.showMockSearchResults(searchQuery);
        } catch (error) {
            console.error('Search error:', error);
            this.showError('Search failed');
        }
        
        this.hideLoading();
    }
    
    findMyRank() {
        if (!this.playerData) return;
        
        // Highlight "Find My Rank" button
        document.querySelectorAll('.control-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('find-my-rank-btn').classList.add('active');
        
        // Load page containing player's rank
        this.loadPlayerRankPage();
    }
    
    showTopPlayers() {
        // Highlight "Top Players" button
        document.querySelectorAll('.control-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('top-players-btn').classList.add('active');
        
        this.currentPage = 1;
        this.loadLeaderboard();
    }
    
    changePage(newPage) {
        if (newPage < 1) return;
        
        this.currentPage = newPage;
        this.loadLeaderboard();
    }
    
    updatePagination() {
        const prevBtn = document.getElementById('prev-page-btn');
        const nextBtn = document.getElementById('next-page-btn');
        const pageInfo = document.getElementById('page-info');
        const totalPlayers = document.getElementById('total-players');
        
        prevBtn.disabled = this.currentPage <= 1;
        
        const totalPages = this.leaderboardData ? 
            Math.ceil(this.leaderboardData.total / 50) : 10;
        
        nextBtn.disabled = this.currentPage >= totalPages;
        
        pageInfo.textContent = `Page ${this.currentPage} of ${totalPages}`;
        totalPlayers.textContent = `${this.leaderboardData?.total || 1234} players`;
    }
    
    // Real-time Updates
    handleRankChange(data) {
        this.showRankChangeNotification(data);
        this.updatePlayerRankDisplay(data);
        
        // Update leaderboard if currently viewing
        if (document.getElementById('leaderboard-section').style.display === 'block') {
            this.loadLeaderboard();
        }
    }
    
    showRankChangeNotification(data) {
        const container = document.getElementById('rank-notifications');
        const notification = document.createElement('div');
        
        const changeType = data.rank_change > 0 ? 'rank-up' : 'rank-down';
        const changeText = data.rank_change > 0 ? 
            `↗ Climbed ${data.rank_change} ranks` : 
            `↘ Dropped ${Math.abs(data.rank_change)} ranks`;
        
        notification.className = `rank-notification ${changeType}`;
        notification.innerHTML = `
            <div class="notification-header">
                <span class="notification-title">Rank Update</span>
                <button class="notification-close">×</button>
            </div>
            <div class="notification-content">
                New rank: <span class="notification-rank-change">#${data.new_rank}</span><br>
                ${changeText}
            </div>
        `;
        
        // Add close handler
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });
        
        container.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }
    
    showAchievementUnlock(achievement) {
        const popup = document.getElementById('achievement-popup');
        const icon = document.getElementById('achievement-popup-icon');
        const title = document.getElementById('achievement-popup-title');
        const description = document.getElementById('achievement-popup-description');
        
        icon.textContent = achievement.icon || '🏆';
        title.textContent = achievement.name;
        description.textContent = achievement.description;
        
        popup.style.display = 'flex';
        
        // Auto-close after 4 seconds
        setTimeout(() => {
            this.closeAchievementPopup();
        }, 4000);
    }
    
    closeAchievementPopup() {
        document.getElementById('achievement-popup').style.display = 'none';
    }
    
    updatePlayerRankDisplay(data) {
        document.getElementById('current-player-rank').textContent = `#${data.rank}`;
    }
    
    // UI State Management
    showLoading() {
        document.getElementById('leaderboard-loading').style.display = 'block';
        document.getElementById('leaderboard-table-wrapper').style.display = 'none';
        document.getElementById('leaderboard-empty').style.display = 'none';
    }
    
    hideLoading() {
        document.getElementById('leaderboard-loading').style.display = 'none';
        document.getElementById('leaderboard-table-wrapper').style.display = 'block';
    }
    
    showEmptyState() {
        document.getElementById('leaderboard-table-wrapper').style.display = 'none';
        document.getElementById('leaderboard-empty').style.display = 'block';
    }
    
    hideEmptyState() {
        document.getElementById('leaderboard-empty').style.display = 'none';
    }
    
    showError(message) {
        // Use existing error system
        this.networkManager.showError(message);
    }
    
    // Mock Data Methods (for development/demo)
    showMockLeaderboard() {
        const mockPlayers = this.generateMockPlayers();
        this.leaderboardData = {
            players: mockPlayers,
            total: 1234,
            page: this.currentPage
        };
        this.renderLeaderboard();
        this.updatePagination();
    }
    
    generateMockPlayers() {
        const players = [];
        const names = ['ProGamer', 'RotaMaster', 'Champion', 'Strategist', 'Victor', 'Genius', 'Wizard', 'Legend'];
        
        for (let i = 0; i < 50; i++) {
            const rating = Math.max(800, 2000 - (this.currentPage - 1) * 50 * 10 - i * 10 + Math.random() * 20);
            players.push({
                id: (this.currentPage - 1) * 50 + i + 1,
                username: `${names[i % names.length]}${Math.floor(Math.random() * 999)}`,
                rating: Math.floor(rating),
                games_played: Math.floor(Math.random() * 100) + 10,
                win_percentage: Math.random() * 100,
                current_streak: Math.floor(Math.random() * 21) - 10,
                rating_change_24h: Math.floor(Math.random() * 41) - 20,
                rank_change_24h: Math.floor(Math.random() * 21) - 10
            });
        }
        
        return players;
    }
    
    showMockSeasonInfo() {
        this.currentSeason = {
            name: 'Season 3: Winter Championship',
            start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            end_date: new Date(Date.now() + 23 * 24 * 60 * 60 * 1000),
            is_active: true
        };
        this.updateSeasonDisplay();
        this.startSeasonCountdown();
        this.loadMockSeasonWinners();
    }
    
    loadMockSeasonWinners() {
        const winnersGrid = document.getElementById('winners-grid');
        const mockWinners = [
            { name: 'ChampionX', season: 'Season 2: Autumn Glory', rating: 2456, trophy: '🥇' },
            { name: 'RotaMaster', season: 'Season 1: Summer Siege', rating: 2389, trophy: '🥇' },
            { name: 'StrategicMind', season: 'Pre-Season Beta', rating: 2234, trophy: '🥇' }
        ];
        
        winnersGrid.innerHTML = '';
        
        mockWinners.forEach(winner => {
            const card = document.createElement('div');
            card.className = 'winner-card';
            card.innerHTML = `
                <div class="winner-trophy">${winner.trophy}</div>
                <div class="winner-name">${winner.name}</div>
                <div class="winner-season">${winner.season}</div>
                <div class="winner-rating">${winner.rating} Rating</div>
            `;
            winnersGrid.appendChild(card);
        });
    }
    
    showMockSearchResults(query) {
        const mockResults = this.generateMockPlayers().filter(player => 
            player.username.toLowerCase().includes(query.toLowerCase())
        );
        
        this.leaderboardData = {
            players: mockResults,
            total: mockResults.length,
            page: 1
        };
        
        this.renderLeaderboard();
        this.updatePagination();
    }
    
    async loadPlayerRankPage() {
        if (!this.playerData) return;
        
        this.showLoading();
        
        try {
            // Mock player rank loading
            const playerRank = Math.floor(Math.random() * 500) + 1;
            const page = Math.ceil(playerRank / 50);
            
            this.currentPage = page;
            await this.loadLeaderboard();
            
            // Highlight player row after a short delay
            setTimeout(() => {
                const playerRow = document.querySelector('.current-player');
                if (playerRow) {
                    playerRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 500);
            
        } catch (error) {
            console.error('Error loading player rank page:', error);
            this.showError('Failed to find your rank');
        }
    }
    
    // Public API
    setPlayerData(playerData) {
        this.playerData = playerData;
        this.loadPlayerRank();
    }
    
    updateLeaderboard() {
        if (document.getElementById('leaderboard-section').style.display === 'block') {
            this.loadLeaderboard();
        }
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.gameClient = new MultiplayerGameClient();
    
    // Add leaderboard manager to the game client
    window.gameClient.leaderboardManager = new LeaderboardManager(window.gameClient.networkManager);
    
    // Set up navigation after login
    window.gameClient.networkManager.on('loginSuccess', (data) => {
        document.getElementById('navigation-section').style.display = 'block';
        window.gameClient.leaderboardManager.setPlayerData(data.player);
    });
});