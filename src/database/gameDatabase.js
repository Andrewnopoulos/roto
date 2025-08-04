/**
 * Game Database Interface
 * 
 * This module provides database operations for the Rota game.
 * It handles game persistence, player statistics, and related queries.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class GameDatabase {
    constructor(dbPath = path.join(__dirname, '../../data/rota.db')) {
        this.dbPath = dbPath;
        this.db = null;
        this.init();
    }

    /**
     * Initialize database connection and create tables
     */
    async init() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening database:', err);
                    reject(err);
                } else {
                    console.log('Connected to SQLite database');
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    /**
     * Create necessary database tables
     */
    async createTables() {
        const queries = [
            // Games table
            `CREATE TABLE IF NOT EXISTS games (
                gameId TEXT PRIMARY KEY,
                player1Id TEXT NOT NULL,
                player2Id TEXT,
                currentPlayerIndex INTEGER NOT NULL DEFAULT 0,
                phase TEXT NOT NULL DEFAULT 'placement',
                board TEXT NOT NULL,
                piecesPlaced TEXT NOT NULL,
                winner TEXT,
                createdAt DATETIME NOT NULL,
                lastMoveAt DATETIME NOT NULL,
                moveHistory TEXT NOT NULL,
                status TEXT DEFAULT 'active'
            )`,

            // Player statistics table
            `CREATE TABLE IF NOT EXISTS player_stats (
                playerId TEXT PRIMARY KEY,
                gamesPlayed INTEGER DEFAULT 0,
                gamesWon INTEGER DEFAULT 0,
                gamesLost INTEGER DEFAULT 0,
                totalMoves INTEGER DEFAULT 0,
                averageGameDuration REAL DEFAULT 0,
                longestWinStreak INTEGER DEFAULT 0,
                currentWinStreak INTEGER DEFAULT 0,
                lastGameAt DATETIME,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Game sessions table for tracking active connections
            `CREATE TABLE IF NOT EXISTS game_sessions (
                sessionId TEXT PRIMARY KEY,
                gameId TEXT NOT NULL,
                playerId TEXT NOT NULL,
                joinedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                lastSeenAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (gameId) REFERENCES games (gameId)
            )`,

            // Indexes for performance
            `CREATE INDEX IF NOT EXISTS idx_games_player1 ON games(player1Id)`,
            `CREATE INDEX IF NOT EXISTS idx_games_player2 ON games(player2Id)`,
            `CREATE INDEX IF NOT EXISTS idx_games_status ON games(status)`,
            `CREATE INDEX IF NOT EXISTS idx_games_created ON games(createdAt)`,
            `CREATE INDEX IF NOT EXISTS idx_sessions_game ON game_sessions(gameId)`,
            `CREATE INDEX IF NOT EXISTS idx_sessions_player ON game_sessions(playerId)`
        ];

        for (const query of queries) {
            await this.runQuery(query);
        }
    }

    /**
     * Execute a query with promise wrapper
     */
    runQuery(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(query, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }

    /**
     * Execute a select query
     */
    getQuery(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(query, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * Execute a select all query
     */
    allQuery(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Save a game to the database
     */
    async saveGame(gameData) {
        const query = `
            INSERT INTO games (
                gameId, player1Id, player2Id, currentPlayerIndex, phase,
                board, piecesPlaced, winner, createdAt, lastMoveAt, moveHistory
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (gameId) DO UPDATE SET
                player1Id = EXCLUDED.player1Id,
                player2Id = EXCLUDED.player2Id,
                currentPlayerIndex = EXCLUDED.currentPlayerIndex,
                phase = EXCLUDED.phase,
                board = EXCLUDED.board,
                piecesPlaced = EXCLUDED.piecesPlaced,
                winner = EXCLUDED.winner,
                lastMoveAt = EXCLUDED.lastMoveAt,
                moveHistory = EXCLUDED.moveHistory
        `;

        const params = [
            gameData.gameId,
            gameData.player1Id,
            gameData.player2Id,
            gameData.currentPlayerIndex,
            gameData.phase,
            gameData.board,
            gameData.piecesPlaced,
            gameData.winner,
            gameData.createdAt,
            gameData.lastMoveAt,
            gameData.moveHistory
        ];

        return this.runQuery(query, params);
    }

    /**
     * Get a game by ID
     */
    async getGame(gameId) {
        const query = 'SELECT * FROM games WHERE gameId = $1 AND status = \'active\'';
        return this.getQuery(query, [gameId]);
    }

    /**
     * Get games waiting for players (no player2)
     */
    async getGamesWaitingForPlayers() {
        const query = `
            SELECT gameId, player1Id, createdAt 
            FROM games 
            WHERE player2Id IS NULL AND status = "active"
            ORDER BY createdAt ASC
            LIMIT 20
        `;
        return this.allQuery(query);
    }

    /**
     * Get games for a specific player
     */
    async getPlayerGames(playerId, limit = 10) {
        const query = `
            SELECT * FROM games 
            WHERE (player1Id = $1 OR player2Id = $1) AND status = 'active'
            ORDER BY lastMoveAt DESC
            LIMIT ?
        `;
        return this.allQuery(query, [playerId, playerId, limit]);
    }

    /**
     * Mark games as expired
     */
    async markGamesAsExpired(gameIds) {
        if (gameIds.length === 0) return;

        const placeholders = gameIds.map((_, index) => `$${index + 1}`).join(',');
        const query = `UPDATE games SET status = 'expired' WHERE gameId IN (${placeholders})`;
        return this.runQuery(query, gameIds);
    }

    /**
     * Get player statistics
     */
    async getPlayerStats(playerId) {
        const query = 'SELECT * FROM player_stats WHERE playerId = $1';
        const stats = await this.getQuery(query, [playerId]);
        
        if (!stats) {
            // Create new player stats record
            await this.createPlayerStats(playerId);
            return this.getQuery(query, [playerId]);
        }
        
        return stats;
    }

    /**
     * Create new player statistics record
     */
    async createPlayerStats(playerId) {
        const query = `
            INSERT INTO player_stats (playerId) 
            VALUES ($1)
        `;
        return this.runQuery(query, [playerId]);
    }

    /**
     * Update player statistics
     */
    async updatePlayerStats(playerId, deltaStats) {
        // First ensure player stats exist
        await this.getPlayerStats(playerId);

        const updates = [];
        const params = [];

        if (deltaStats.gamesPlayed) {
            updates.push('gamesPlayed = gamesPlayed + ?');
            params.push(deltaStats.gamesPlayed);
        }

        if (deltaStats.gamesWon) {
            updates.push('gamesWon = gamesWon + ?');
            updates.push('currentWinStreak = currentWinStreak + ?');
            updates.push('longestWinStreak = MAX(longestWinStreak, currentWinStreak + ?)');
            params.push(deltaStats.gamesWon, deltaStats.gamesWon, deltaStats.gamesWon);
        }

        if (deltaStats.gamesLost) {
            updates.push('gamesLost = gamesLost + ?');
            updates.push('currentWinStreak = 0');
            params.push(deltaStats.gamesLost);
        }

        if (deltaStats.totalMoves) {
            updates.push('totalMoves = totalMoves + ?');
            params.push(deltaStats.totalMoves);
        }

        updates.push('lastGameAt = CURRENT_TIMESTAMP');
        updates.push('updatedAt = CURRENT_TIMESTAMP');
        params.push(playerId);

        const query = `
            UPDATE player_stats 
            SET ${updates.join(', ')}
            WHERE playerId = $1
        `;

        return this.runQuery(query, params);
    }

    /**
     * Get leaderboard
     */
    async getLeaderboard(limit = 10) {
        const query = `
            SELECT 
                playerId,
                gamesPlayed,
                gamesWon,
                gamesLost,
                ROUND(CAST(gamesWon AS FLOAT) / CAST(gamesPlayed AS FLOAT) * 100, 2) as winPercentage,
                longestWinStreak,
                currentWinStreak,
                lastGameAt
            FROM player_stats 
            WHERE gamesPlayed > 0
            ORDER BY winPercentage DESC, gamesWon DESC, gamesPlayed ASC
            LIMIT ?
        `;
        return this.allQuery(query, [limit]);
    }

    /**
     * Create a game session
     */
    async createGameSession(sessionId, gameId, playerId) {
        const query = `
            INSERT INTO game_sessions (sessionId, gameId, playerId)
            VALUES ($1, $2, $3)
            ON CONFLICT (sessionId) DO UPDATE SET
                gameId = EXCLUDED.gameId,
                playerId = EXCLUDED.playerId
        `;
        return this.runQuery(query, [sessionId, gameId, playerId]);
    }

    /**
     * Update session last seen time
     */
    async updateSessionHeartbeat(sessionId) {
        const query = `
            UPDATE game_sessions 
            SET lastSeenAt = CURRENT_TIMESTAMP 
            WHERE sessionId = $1
        `;
        return this.runQuery(query, [sessionId]);
    }

    /**
     * Remove a game session
     */
    async removeGameSession(sessionId) {
        const query = 'DELETE FROM game_sessions WHERE sessionId = $1';
        return this.runQuery(query, [sessionId]);
    }

    /**
     * Get active sessions for a game
     */
    async getGameSessions(gameId) {
        const query = `
            SELECT * FROM game_sessions 
            WHERE gameId = $1 AND lastSeenAt > NOW() - INTERVAL '5 minutes'
            ORDER BY joinedAt ASC
        `;
        return this.allQuery(query, [gameId]);
    }

    /**
     * Clean up old sessions
     */
    async cleanupOldSessions() {
        const query = `
            DELETE FROM game_sessions 
            WHERE lastSeenAt < NOW() - INTERVAL '10 minutes'
        `;
        return this.runQuery(query);
    }

    /**
     * Get game history for a player
     */
    async getPlayerGameHistory(playerId, limit = 20) {
        const query = `
            SELECT 
                gameId,
                CASE 
                    WHEN player1Id = ? THEN player2Id 
                    ELSE player1Id 
                END as opponent,
                CASE 
                    WHEN winner = ? THEN 'won'
                    WHEN winner IS NULL THEN 'ongoing'
                    ELSE 'lost'
                END as result,
                phase,
                createdAt,
                lastMoveAt
            FROM games 
            WHERE (player1Id = $1 OR player2Id = $1) AND status = 'active'
            ORDER BY lastMoveAt DESC
            LIMIT ?
        `;
        return this.allQuery(query, [playerId, playerId, playerId, playerId, limit]);
    }

    /**
     * Get database statistics
     */
    async getDatabaseStats() {
        const queries = {
            totalGames: 'SELECT COUNT(*) as count FROM games',
            activeGames: 'SELECT COUNT(*) as count FROM games WHERE status = "active" AND phase != "finished"',
            totalPlayers: 'SELECT COUNT(*) as count FROM player_stats',
            activeSessions: 'SELECT COUNT(*) as count FROM game_sessions WHERE lastSeenAt > NOW() - INTERVAL \'5 minutes\''
        };

        const results = {};
        for (const [key, query] of Object.entries(queries)) {
            const result = await this.getQuery(query);
            results[key] = result.count;
        }

        return results;
    }

    /**
     * Close database connection
     */
    close() {
        return new Promise((resolve) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        console.error('Error closing database:', err);
                    } else {
                        console.log('Database connection closed');
                    }
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = GameDatabase;