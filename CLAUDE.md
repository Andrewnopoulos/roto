# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a comprehensive multiplayer Rota game platform - a strategic two-player game with competitive features including real-time multiplayer, skill-based matchmaking, leaderboards, and player progression systems.

## Project Structure

### Production-Ready Architecture
```
/home/andrew/src/roto/
├── public/              # Client-side files
│   ├── index.html      # Main multiplayer game interface
│   ├── script.js       # Client game logic with networking
│   └── styles.css      # Responsive CSS with animations
├── src/                # Server-side code (extensive backend)
│   ├── services/       # Business logic services
│   ├── controllers/    # API controllers
│   ├── models/         # Data models
│   └── utils/          # Utility functions
├── tests/              # Test suite
├── server.js           # Production Node.js server
├── package.json        # Dependencies and scripts
├── Dockerfile          # Container configuration
├── docker-compose.yml  # Multi-container deployment
└── README.md           # Comprehensive documentation
```

## Core Systems Implemented

### 1. **Multiplayer Backend (Node.js/Express)**
- Real-time WebSocket communication with Socket.io
- PostgreSQL database with comprehensive schema
- User authentication and session management
- Server-side game logic with move validation
- Redis caching for performance optimization

### 2. **Player Rating System**
- ELO-based rating calculations with K-factor adjustments
- Player statistics tracking (wins, losses, streaks)
- Comprehensive achievement system
- Rating history and performance analytics

### 3. **Advanced Matchmaking**
- Skill-based queue system with rating ranges
- Automatic search criteria expansion over time
- Queue management with estimated wait times
- Preference-based matching (ranked/casual, game modes)

### 4. **Leaderboard System**
- Multiple leaderboard categories (rating, wins, win percentage)
- Seasonal competition with automated resets
- Real-time rank tracking and position change notifications
- Historical leaderboard data preservation

### 5. **Enhanced Client Interface**
- Modern competitive gaming UI design
- Real-time multiplayer game interface
- Comprehensive player profiles and statistics
- Achievement unlock animations and notifications
- Mobile-responsive design

## Database Schema

### Core Tables
- `users` - User accounts and authentication
- `user_statistics` - Player stats and ratings
- `games` - Game rooms and state management
- `game_participants` - Player-game relationships
- `matches` - Completed game records
- `seasons` - Leaderboard seasons
- `leaderboards` - Ranking data
- `rating_history` - Rating change tracking

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Token refresh

### Game Management
- `POST /api/games/create` - Create game room
- `POST /api/games/:id/join` - Join game
- `POST /api/games/:id/move` - Make move
- `GET /api/games/:id/state` - Get game state

### Matchmaking
- `POST /api/matchmaking/join` - Join queue
- `DELETE /api/matchmaking/leave` - Leave queue
- `GET /api/matchmaking/status` - Queue status

### Leaderboards
- `GET /api/leaderboards/:category` - Get rankings
- `GET /api/leaderboards/:category/rank/:userId` - Player rank
- `GET /api/seasons/current` - Current season info

### User Management
- `GET /api/users/profile` - User profile
- `GET /api/users/stats` - Player statistics
- `GET /api/users/history` - Match history

## Development Commands

```bash
# Install dependencies
npm install

# Development mode with hot reload
npm run dev

# Production mode
npm start

# Run tests
npm test

# Run with Docker
docker-compose up

# Database setup
npm run db:setup
npm run db:migrate
```

## Game Logic Architecture

### Server-Side Game Engine
- `GameManager` class handles all game operations
- Server-side move validation and state management
- Real-time synchronization between players
- Automatic game cleanup and memory management

### Client-Side Architecture
- `RotoGame` class for game rendering and interaction
- `NetworkManager` for WebSocket communication
- `MatchmakingManager` for queue management
- `LeaderboardManager` for ranking displays

### Game Flow
1. **Placement Phase** - Players place 3 pieces each on any empty cells
2. **Movement Phase** - Players move pieces to adjacent cells to form lines
3. **Win Condition** - First player to form a line of 3 pieces wins
4. **Rating Update** - ELO ratings calculated and leaderboards updated

## Security Features

- Helmet.js security headers
- Rate limiting and request throttling
- Input validation and sanitization
- CORS protection
- JWT authentication with refresh tokens
- Server-side move validation

## Performance Optimizations

- Redis caching for leaderboards and session data
- Database connection pooling
- Optimized SQL queries with proper indexing
- WebSocket connection management
- Automatic cleanup of inactive resources

## Testing

- Jest test framework with comprehensive coverage
- Game logic unit tests
- API endpoint integration tests
- WebSocket communication tests
- Performance and load testing

## Deployment

The application is production-ready with:
- Docker containerization
- Nginx reverse proxy configuration
- Health check endpoints
- Graceful shutdown handling
- Environment-based configuration
- Comprehensive logging and monitoring

## Key Technical Decisions

- **PostgreSQL** for relational data and ACID compliance
- **Redis** for caching and session management
- **Socket.io** for real-time communication
- **ELO rating system** for fair skill-based matching
- **Seasonal leaderboards** for ongoing competition
- **Modern responsive design** for cross-platform compatibility