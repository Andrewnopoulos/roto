# Rota Game Server Implementation

This document describes the server-side implementation of the Rota board game, including the game logic, API endpoints, WebSocket support, and database schema.

## Architecture Overview

The server-side implementation follows a layered architecture with clear separation of concerns:

```
├── src/
│   ├── models/           # Game logic and data models
│   ├── services/         # Business logic and game management
│   ├── controllers/      # HTTP request handlers
│   ├── routes/           # API route definitions
│   ├── database/         # Database interface and queries
│   ├── websocket/        # Real-time WebSocket handlers
│   ├── utils/            # Validation and utility functions
│   ├── tests/            # Integration and unit tests
│   └── server.js         # Main server entry point
```

## Core Components

### 1. RotaGame Model (`src/models/RotaGame.js`)

The core game logic class that handles:
- **Game State Management**: Tracks board positions, current player, game phase
- **Move Validation**: Validates placement and movement moves against game rules
- **Win Detection**: Checks for three-in-a-row winning conditions
- **Game Phases**: Manages placement phase (6 pieces) and movement phase
- **Serialization**: Supports database persistence

**Key Methods:**
- `placePiece(playerId, position)` - Execute placement move
- `movePiece(playerId, fromPosition, toPosition)` - Execute movement move
- `validatePlacement/validateMovement()` - Server-side move validation
- `checkWinCondition(playerNumber)` - Detect game completion
- `getValidMoves()` - Return available moves for current player

### 2. Game Service (`src/services/gameService.js`)

High-level game management service providing:
- **Game Lifecycle Management**: Create, join, and manage games
- **Player Authentication**: Validate player permissions
- **Rate Limiting**: Prevent move spam and ensure fair play
- **Statistics Tracking**: Update player win/loss records
- **Game Persistence**: Database integration for game state

**Key Features:**
- In-memory game caching for performance
- Automatic cleanup of expired games
- Player disconnection handling
- Game spectator support

### 3. Game Validation (`src/utils/gameValidation.js`)

Comprehensive server-side validation including:
- **Input Sanitization**: Clean and validate all user inputs
- **Security Checks**: Prevent unauthorized game access
- **Rate Limiting**: Move frequency validation
- **Data Integrity**: Game state consistency checks

**Security Measures:**
- SQL injection prevention
- XSS protection through input sanitization
- Player authorization validation
- Game state integrity checks

### 4. Database Layer (`src/database/gameDatabase.js`)

SQLite-based persistence with:
- **Game Storage**: Complete game state serialization
- **Player Statistics**: Win/loss tracking and leaderboards
- **Session Management**: Active connection tracking
- **Performance Optimization**: Proper indexing and query optimization

**Database Schema:**
```sql
-- Games table
games (gameId, player1Id, player2Id, currentPlayerIndex, phase, 
       board, piecesPlaced, winner, createdAt, lastMoveAt, moveHistory)

-- Player statistics
player_stats (playerId, gamesPlayed, gamesWon, gamesLost, 
              totalMoves, winStreak, lastGameAt)

-- Active sessions
game_sessions (sessionId, gameId, playerId, joinedAt, lastSeenAt)
```

### 5. WebSocket Handler (`src/websocket/gameWebSocket.js`)

Real-time communication system featuring:
- **Game Rooms**: Automatic player grouping by game
- **Live Updates**: Instant move broadcasting
- **Connection Management**: Heartbeat monitoring and cleanup
- **Spectator Support**: Non-player game observation

**WebSocket Events:**
- `join_game` - Join a game room
- `make_move` - Execute game moves
- `game_updated` - Broadcast state changes
- `player_disconnected` - Handle disconnections

## API Endpoints

### Game Management
- `POST /api/games` - Create new game
- `GET /api/games/available` - List joinable games
- `POST /api/games/:gameId/join` - Join existing game
- `GET /api/games/:gameId` - Get current game state

### Game Actions
- `POST /api/games/:gameId/moves` - Make a move
- `POST /api/games/:gameId/forfeit` - Forfeit game
- `GET /api/games/:gameId/stats` - Get game statistics

### System Status
- `GET /health` - Server health check
- `GET /api/status` - Detailed system status

## Security Implementation

### Input Validation
All user inputs are validated and sanitized:
```javascript
// Example: Position validation
function validatePosition(position) {
    const pos = parseInt(position, 10);
    if (isNaN(pos) || pos < 0 || pos > 15) {
        throw new Error('Invalid board position');
    }
    return pos;
}
```

### Rate Limiting
Multiple layers of rate limiting:
- Global API rate limiting (1000 requests/15min)
- Move-specific limiting (20 moves/10sec)
- Per-player move throttling (500ms minimum)

### Authorization
- Player-specific game access validation
- Move authorization against current player turn
- Spectator vs player permission separation

## Performance Optimizations

### Caching Strategy
- In-memory game state caching
- Database connection pooling
- Efficient game lookup by ID

### Database Optimization
- Proper indexing on frequently queried fields
- Batch operations for statistics updates
- Automatic cleanup of expired sessions

### WebSocket Efficiency
- Connection heartbeat monitoring
- Automatic dead connection cleanup
- Efficient room-based message broadcasting

## Game Rules Implementation

### Board Layout
16-position Rota board with adjacency mapping:
```
Positions 0-15 arranged in concentric circles:
    0---1---2
    |   |   |
    7---8---3    (Plus outer ring 9-15)
    |   |   |
    6---5---4
```

### Win Conditions
Multiple winning patterns detected:
- Horizontal lines: [0,1,2], [6,5,4], [7,8,3]
- Vertical lines: [0,7,6], [2,3,4], [1,8,5]
- Radial lines through center: [0,8,4], [2,8,6]
- Extended patterns with outer ring positions

### Game Phases
1. **Placement Phase**: Players alternate placing 3 pieces each
2. **Movement Phase**: Players move pieces to adjacent empty positions
3. **Completion**: First player to achieve three-in-a-row wins

## Testing

Comprehensive test suite covering:
- Unit tests for game logic
- Integration tests for API endpoints
- Database operation testing
- WebSocket communication testing
- Security validation testing

Run tests:
```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report
```

## Deployment

### Environment Variables
```bash
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://yourdomain.com
DATABASE_PATH=./data/rota.db
```

### Production Considerations
- Use process manager (PM2) for reliability
- Configure reverse proxy (nginx) for SSL/load balancing
- Set up database backups
- Monitor memory usage and connection counts
- Configure proper logging and error tracking

### Docker Deployment
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3000
CMD ["npm", "start"]
```

## Monitoring and Logging

### Health Monitoring
- `/health` endpoint for basic health checks
- `/api/status` for detailed system metrics
- Database connection monitoring
- WebSocket connection tracking

### Performance Metrics
- Active games count
- Player connection statistics
- Average game duration
- Move frequency analysis
- Database query performance

## Error Handling

### Graceful Error Recovery
- Database connection retry logic
- WebSocket reconnection handling
- Game state recovery from persistence
- Automatic cleanup of corrupted sessions

### User-Friendly Error Messages
- Clear validation error descriptions
- Helpful debugging information in development
- Security-conscious error messages in production

This server-side implementation provides a robust, secure, and scalable foundation for the Rota board game with real-time multiplayer capabilities.