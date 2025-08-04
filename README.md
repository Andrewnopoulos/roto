# Roto - Multiplayer Tic-Tac-Toe Game

A real-time multiplayer tic-tac-toe game built with Node.js, Express, Socket.io, and vanilla JavaScript. Features secure room-based gameplay, responsive design, and production-ready deployment configuration.

## Features

- **Real-time Multiplayer**: Play with friends in real-time using WebSocket connections
- **Room-based Gameplay**: Create or join specific game rooms with unique IDs
- **Responsive Design**: Beautiful, mobile-friendly interface with smooth animations
- **Security First**: Input validation, rate limiting, and protection against common vulnerabilities
- **Production Ready**: Dockerized deployment with health checks and load balancing support
- **Clean Architecture**: Well-structured, maintainable codebase with comprehensive error handling

## Quick Start

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd roto
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Start the development server:
```bash
npm run dev
```

5. Open your browser and navigate to `http://localhost:3000`

## Game Rules

1. **Objective**: Get three of your marks (X or O) in a row, column, or diagonal
2. **Players**: Exactly 2 players per game room
3. **Turns**: Players alternate turns, with Player 1 (X) going first
4. **Winning**: First player to get three in a row wins
5. **Draw**: If all 9 squares are filled with no winner, the game is a draw

## How to Play

1. **Join a Room**: Enter a room ID or click "Create New Room" to generate one
2. **Wait for Player**: Game starts when both players have joined
3. **Make Moves**: Click on empty squares during your turn
4. **Game End**: Play again or return to the lobby after each game

## API Endpoints

### HTTP Endpoints

- `GET /` - Serve the game interface
- `GET /health` - Health check endpoint for monitoring

### WebSocket Events

#### Client to Server:
- `join-room` - Join a game room
- `leave-room` - Leave current room  
- `start-game` - Start the game (when 2 players present)
- `make-move` - Make a move on the board
- `end-game` - End the current game

#### Server to Client:
- `room-joined` - Confirmation of joining room
- `player-joined` - Another player joined the room
- `game-started` - Game has begun
- `move-made` - A move was made by a player
- `game-over` - Game ended with win/draw
- `player-left` - Other player disconnected
- `error` - Error message

## Configuration

Environment variables (see `.env.example`):

```env
NODE_ENV=development          # Environment mode
PORT=3000                    # Server port
RATE_LIMIT_POINTS=10         # Rate limit requests per second
RATE_LIMIT_DURATION=1        # Rate limit time window
ROOM_TIMEOUT_MINUTES=30      # Auto-cleanup inactive rooms
MAX_ROOM_ID_LENGTH=20        # Maximum room ID length
MAX_CONCURRENT_ROOMS=1000    # Maximum active rooms
```

## Development

### Available Scripts

```bash
npm start          # Start production server
npm run dev        # Start development server with nodemon
npm test           # Run test suite
npm run test:watch # Run tests in watch mode
```

### Project Structure

```
roto/
├── public/              # Static client files
│   ├── index.html      # Main HTML file
│   ├── script.js       # Client-side JavaScript
│   └── styles.css      # CSS styles
├── tests/              # Test files
│   └── game.test.js    # Game logic tests
├── server.js           # Main server file
├── package.json        # Dependencies and scripts
├── Dockerfile          # Docker configuration
├── docker-compose.yml  # Docker Compose setup
├── nginx.conf          # Nginx configuration
└── healthcheck.js      # Health check script
```

### Security Features

- **Helmet.js**: Security headers and CSP
- **Rate Limiting**: Prevents spam and DoS attacks
- **Input Validation**: Server-side validation of all inputs
- **CORS Protection**: Configurable origin restrictions
- **Error Handling**: Graceful error handling without information leakage

### Testing

Run the test suite:

```bash
npm test
```

Tests cover:
- Room management functionality
- Game logic and win conditions
- Input validation
- Error handling scenarios

## Deployment

### Docker Deployment (Recommended)

1. Build and run with Docker Compose:
```bash
docker-compose up -d
```

2. For production with nginx:
```bash
docker-compose --profile production up -d
```

### Manual Deployment

1. Set production environment:
```bash
export NODE_ENV=production
```

2. Install production dependencies:
```bash
npm ci --only=production
```

3. Start the server:
```bash
npm start
```

### Production Considerations

- Use environment variables for configuration
- Set up SSL/TLS certificates for HTTPS
- Configure nginx for load balancing and static file serving
- Set up monitoring and logging
- Enable health checks for container orchestration

## Performance

- **WebSocket Connections**: Efficient real-time communication
- **Memory Management**: Automatic cleanup of inactive rooms
- **Rate Limiting**: Prevents abuse and ensures fair usage
- **Static File Serving**: Optimized delivery of client assets
- **Connection Pooling**: Efficient resource utilization

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
1. Check the GitHub issues page
2. Review the documentation
3. Create a new issue with detailed information

---

**Enjoy playing Roto!** 🎮