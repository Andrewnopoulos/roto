# Roto Backend - Database Schema and Migration System

This directory contains the complete database schema and migration system for the Roto multiplayer game platform.

## 🗄️ Database Architecture

### Core Tables

- **users** - User authentication and profile data
- **user_statistics** - Aggregate player statistics for performance
- **games** - Game rooms (active and historical sessions)
- **game_participants** - Many-to-many relationship between users and games
- **matches** - Completed games with results and replay data
- **seasons** - Time-based periods for leaderboard management
- **leaderboards** - Rankings for different game types and seasons
- **game_moves** - Individual moves for replay functionality
- **user_sessions** - Authentication session management

### Key Features

- **UUID Primary Keys** - For security and scalability
- **JSONB Support** - Flexible game state and configuration storage
- **Comprehensive Indexing** - Optimized for real-time queries
- **Foreign Key Constraints** - Data integrity enforcement
- **Audit Trails** - Created/updated timestamps on all relevant tables
- **Rating System** - ELO-style rating calculations with history
- **Seasonal Leaderboards** - Support for leaderboard resets and seasons

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup

```bash
# Test database connection
npm run db:test

# Initialize database with migrations
npm run db:init

# Seed with development data
npm run db:seed
```

## 📊 Migration Commands

```bash
# Run pending migrations
npm run migrate:up

# Check migration status
npm run migrate:status

# Rollback last migration (limited support)
npm run migrate:down

# Reset database (development only)
npm run migrate:reset

# Test database connection
npm run db:test

# Seed development data
npm run db:seed
```

## 🏗️ Database Schema Overview

### User Management
```sql
users (id, username, email, password_hash, display_name, ...)
user_statistics (user_id, total_games, wins, losses, current_rating, ...)
user_sessions (user_id, session_token, expires_at, ...)
```

### Game Management
```sql
games (id, room_code, game_type, status, max_players, game_state, ...)
game_participants (game_id, user_id, player_position, final_score, ...)
game_moves (game_id, user_id, move_number, move_data, ...)
```

### Match History & Rankings
```sql
matches (game_id, winner_id, duration, replay_data, ...)
seasons (id, name, start_date, end_date, is_active, ...)
leaderboards (user_id, season_id, rank_position, score, ...)
```

## 🔧 Database Utilities

### Connection Management
```javascript
const Database = require('./db/database');

const db = new Database({
    host: 'localhost',
    port: 5432,
    database: 'roto_game',
    user: 'postgres',
    password: 'password'
});

// Test connection
await db.testConnection();

// Initialize with migrations
await db.initialize();
```

### User Operations
```javascript
// Create user
const user = await db.users.create({
    username: 'player1',
    email: 'player1@example.com',
    password_hash: hashedPassword,
    display_name: 'Player One'
});

// Find user
const user = await db.users.findByEmailOrUsername('player1@example.com');
```

### Game Operations
```javascript
// Create game
const game = await db.games.create({
    room_code: 'ABC123',
    game_type: 'classic',
    max_players: 4,
    settings: { time_limit: 300 }
});

// Join game
await db.games.joinGame(gameId, userId);
```

## 📈 Performance Considerations

### Indexing Strategy
- **Primary queries** - All foreign keys are indexed
- **Leaderboard queries** - Composite indexes on rank/score columns
- **Game lookup** - Room codes and active game status
- **User sessions** - Token-based lookups for authentication

### Query Optimization
- **Connection pooling** - Configurable pool sizes
- **Prepared statements** - All queries use parameterized statements
- **Transaction management** - Complex operations wrapped in transactions
- **Slow query logging** - Automatic detection of queries > 1000ms

### Scalability Features
- **JSONB storage** - Flexible game state without schema changes
- **Partitioning ready** - Date-based partitioning for matches/moves
- **Read replicas** - Separate read-only queries
- **Caching layer** - Redis integration for session storage

## 🔐 Security Features

### Data Protection
- **Password hashing** - BCrypt with configurable rounds
- **SQL injection prevention** - Parameterized queries only
- **Input validation** - Database-level constraints
- **Session management** - Secure token-based authentication

### Access Control
- **Role-based permissions** - User privilege levels
- **Rate limiting** - Request throttling by user/IP
- **Audit logging** - Track all data modifications
- **Data encryption** - Sensitive data encrypted at rest

## 🧪 Testing & Development

### Development Data
```bash
# Seed realistic test data
npm run db:seed

# This creates:
# - 8 sample users with varied statistics
# - 50+ completed matches with realistic results
# - Active and waiting games
# - Leaderboard rankings
# - Sample game moves for replay testing
```

### Database Validation
```bash
# Check constraints and foreign keys
npm run migrate:status

# Test all database functions
npm test
```

## 📝 Migration System

### Creating Migrations
1. Create new `.sql` file in `/migrations/` directory
2. Use format: `XXX_description.sql` (e.g., `003_add_tournaments.sql`)
3. Include both schema changes and data transformations
4. Add appropriate indexes and constraints

### Migration Best Practices
- **Backwards compatibility** - Avoid breaking changes
- **Data migration** - Include scripts for existing data
- **Performance impact** - Consider index rebuilding time
- **Rollback strategy** - Document manual rollback steps

### Example Migration
```sql
-- Migration: 003_add_tournaments.sql
-- Description: Add tournament support

CREATE TABLE tournaments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    max_participants INTEGER NOT NULL,
    entry_fee INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'registration',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tournaments_status ON tournaments(status);
```

## 🔍 Monitoring & Maintenance

### Health Checks
```javascript
// Database health status
const stats = await db.getStats();
console.log('Active connections:', stats.pool.totalCount);
console.log('Active games:', stats.database.active_games);
```

### Performance Monitoring
- **Connection pool metrics** - Track usage and bottlenecks
- **Query performance** - Log slow queries automatically
- **Table statistics** - Monitor growth and index usage
- **Backup verification** - Automated backup testing

### Maintenance Tasks
```bash
# Database statistics update
npm run db:analyze

# Vacuum and reindex (production)
npm run db:maintenance

# Backup database
npm run db:backup

# Restore from backup
npm run db:restore backup_file.sql
```

## 📚 API Integration

The database layer integrates seamlessly with the REST API and WebSocket handlers:

```javascript
// Express route example
app.post('/api/games', async (req, res) => {
    try {
        const game = await db.games.create(req.body);
        res.json(game);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Socket.io event example
socket.on('join_game', async (data) => {
    try {
        await db.games.joinGame(data.gameId, socket.userId);
        socket.join(data.roomCode);
        io.to(data.roomCode).emit('player_joined', data);
    } catch (error) {
        socket.emit('error', { message: error.message });
    }
});
```

## 🤝 Contributing

When adding new database features:

1. **Design first** - Document table relationships
2. **Create migration** - Include in numbered migration file
3. **Add indexes** - Consider query patterns
4. **Update utilities** - Add helper methods to Database class
5. **Write tests** - Verify functionality and performance
6. **Update documentation** - Keep this README current

## 🆘 Troubleshooting

### Common Issues

**Connection failures:**
```bash
# Check PostgreSQL service
sudo systemctl status postgresql

# Verify connection settings
npm run db:test
```

**Migration errors:**
```bash
# Check migration status
npm run migrate:status

# Reset development database
npm run migrate:reset
```

**Performance issues:**
```bash
# Check database statistics
npm run db:analyze

# Monitor slow queries
tail -f logs/slow-queries.log
```

### Support Resources
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Node.js pg Library](https://node-postgres.com/)
- [Database Design Best Practices](https://wiki.postgresql.org/wiki/Don%27t_Do_This)

---

## 📄 License

This database schema and migration system is part of the Roto multiplayer game platform, licensed under MIT.