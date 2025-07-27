/**
 * Database Connection and Query Management
 * Handles PostgreSQL connection pooling and provides query utilities
 */

const { Pool } = require('pg');
const MigrationRunner = require('./migration-runner');

class Database {
    constructor(config) {
        this.config = {
            host: config.host || process.env.DB_HOST || 'localhost',
            port: config.port || process.env.DB_PORT || 5432,
            database: config.database || process.env.DB_NAME || 'roto_game',
            user: config.user || process.env.DB_USER || 'postgres',
            password: config.password || process.env.DB_PASSWORD || '',
            max: config.max || 20, // Maximum number of clients in pool
            idleTimeoutMillis: config.idleTimeoutMillis || 30000,
            connectionTimeoutMillis: config.connectionTimeoutMillis || 10000,
            ssl: config.ssl || (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false)
        };

        this.pool = new Pool(this.config);
        this.migrationRunner = new MigrationRunner(this.config);

        // Handle pool errors
        this.pool.on('error', (err) => {
            console.error('Database pool error:', err);
        });

        // Handle connection events
        this.pool.on('connect', (client) => {
            console.log('Database client connected');
        });

        this.pool.on('remove', (client) => {
            console.log('Database client removed');
        });
    }

    /**
     * Test database connection
     */
    async testConnection() {
        try {
            const client = await this.pool.connect();
            const result = await client.query('SELECT NOW() as current_time, version() as version');
            client.release();
            
            console.log('✅ Database connection successful');
            console.log(`⏰ Server time: ${result.rows[0].current_time}`);
            console.log(`🔧 PostgreSQL version: ${result.rows[0].version.split(' ')[1]}`);
            
            return true;
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            throw error;
        }
    }

    /**
     * Initialize database (run migrations)
     */
    async initialize() {
        console.log('🔧 Initializing database...\n');
        
        try {
            await this.testConnection();
            await this.migrationRunner.runMigrations();
            console.log('✅ Database initialization completed\n');
        } catch (error) {
            console.error('❌ Database initialization failed:', error.message);
            throw error;
        }
    }

    /**
     * Execute a query with parameters
     */
    async query(text, params = []) {
        const start = Date.now();
        
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;
            
            // Log slow queries (> 1000ms)
            if (duration > 1000) {
                console.warn(`🐌 Slow query detected (${duration}ms):`, text.substring(0, 100));
            }
            
            return result;
        } catch (error) {
            console.error('Database query error:', {
                error: error.message,
                query: text.substring(0, 100),
                params: params
            });
            throw error;
        }
    }

    /**
     * Execute a query and return only the first row
     */
    async queryOne(text, params = []) {
        const result = await this.query(text, params);
        return result.rows[0] || null;
    }

    /**
     * Execute a query and return only the rows
     */
    async queryMany(text, params = []) {
        const result = await this.query(text, params);
        return result.rows;
    }

    /**
     * Execute multiple queries in a transaction
     */
    async transaction(callback) {
        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');
            
            const transactionDb = {
                query: async (text, params) => {
                    return await client.query(text, params);
                },
                queryOne: async (text, params) => {
                    const result = await client.query(text, params);
                    return result.rows[0] || null;
                },
                queryMany: async (text, params) => {
                    const result = await client.query(text, params);
                    return result.rows;
                }
            };
            
            const result = await callback(transactionDb);
            await client.query('COMMIT');
            
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Transaction rolled back due to error:', error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Check if database is ready for queries
     */
    async isReady() {
        try {
            await this.query('SELECT 1');
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get database statistics
     */
    async getStats() {
        try {
            const poolStats = {
                totalCount: this.pool.totalCount,
                idleCount: this.pool.idleCount,
                waitingCount: this.pool.waitingCount
            };

            const dbStats = await this.queryOne(`
                SELECT 
                    (SELECT count(*) FROM users) as total_users,
                    (SELECT count(*) FROM games WHERE status = 'active') as active_games,
                    (SELECT count(*) FROM games WHERE status = 'waiting') as waiting_games,
                    (SELECT count(*) FROM matches) as total_matches,
                    (SELECT count(*) FROM user_sessions WHERE is_active = true) as active_sessions
            `);

            return {
                pool: poolStats,
                database: dbStats
            };
        } catch (error) {
            console.error('Failed to get database stats:', error.message);
            throw error;
        }
    }

    /**
     * User-related database operations
     */
    users = {
        /**
         * Create a new user
         */
        create: async (userData) => {
            return await this.transaction(async (db) => {
                // Insert user
                const user = await db.queryOne(`
                    INSERT INTO users (username, email, password_hash, display_name, avatar_url)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING id, username, email, display_name, avatar_url, created_at
                `, [userData.username, userData.email, userData.password_hash, userData.display_name, userData.avatar_url]);

                // Create initial user statistics
                await db.query(`
                    INSERT INTO user_statistics (user_id)
                    VALUES ($1)
                `, [user.id]);

                return user;
            });
        },

        /**
         * Find user by email or username
         */
        findByEmailOrUsername: async (identifier) => {
            return await this.queryOne(`
                SELECT u.*, us.current_rating, us.total_games_played, us.total_wins
                FROM users u
                LEFT JOIN user_statistics us ON u.id = us.user_id
                WHERE u.email = $1 OR u.username = $1
            `, [identifier]);
        },

        /**
         * Find user by ID
         */
        findById: async (userId) => {
            return await this.queryOne(`
                SELECT u.*, us.current_rating, us.total_games_played, us.total_wins, us.total_losses, us.total_draws
                FROM users u
                LEFT JOIN user_statistics us ON u.id = us.user_id
                WHERE u.id = $1
            `, [userId]);
        },

        /**
         * Update user last login
         */
        updateLastLogin: async (userId) => {
            return await this.query(`
                UPDATE users 
                SET last_login_at = CURRENT_TIMESTAMP 
                WHERE id = $1
            `, [userId]);
        }
    };

    /**
     * Game-related database operations
     */
    games = {
        /**
         * Create a new game room
         */
        create: async (gameData) => {
            return await this.queryOne(`
                INSERT INTO games (room_code, game_type, max_players, is_private, password_hash, settings)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `, [gameData.room_code, gameData.game_type, gameData.max_players, gameData.is_private, gameData.password_hash, gameData.settings]);
        },

        /**
         * Find game by room code
         */
        findByRoomCode: async (roomCode) => {
            return await this.queryOne(`
                SELECT g.*, 
                       array_agg(
                           json_build_object(
                               'user_id', gp.user_id,
                               'username', u.username,
                               'display_name', u.display_name,
                               'player_position', gp.player_position,
                               'is_ready', gp.is_ready,
                               'rating', us.current_rating
                           ) ORDER BY gp.player_position
                       ) FILTER (WHERE gp.user_id IS NOT NULL) as players
                FROM games g
                LEFT JOIN game_participants gp ON g.id = gp.game_id AND gp.is_active = true
                LEFT JOIN users u ON gp.user_id = u.id
                LEFT JOIN user_statistics us ON u.id = us.user_id
                WHERE g.room_code = $1
                GROUP BY g.id
            `, [roomCode]);
        },

        /**
         * Join a game
         */
        joinGame: async (gameId, userId) => {
            return await this.transaction(async (db) => {
                // Get next player position
                const nextPosition = await db.queryOne(`
                    SELECT COALESCE(MAX(player_position), 0) + 1 as next_position
                    FROM game_participants 
                    WHERE game_id = $1 AND is_active = true
                `, [gameId]);

                // Add player to game
                const participant = await db.queryOne(`
                    INSERT INTO game_participants (game_id, user_id, player_position)
                    VALUES ($1, $2, $3)
                    RETURNING *
                `, [gameId, userId, nextPosition.next_position]);

                // Update game current players count
                await db.query(`
                    UPDATE games 
                    SET current_players = (
                        SELECT COUNT(*) FROM game_participants 
                        WHERE game_id = $1 AND is_active = true
                    ),
                    updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                `, [gameId]);

                return participant;
            });
        },

        /**
         * Update game state
         */
        updateState: async (gameId, gameState, boardState) => {
            return await this.query(`
                UPDATE games 
                SET game_state = $2, board_state = $3, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [gameId, gameState, boardState]);
        }
    };

    /**
     * Close database connections
     */
    async close() {
        console.log('🔌 Closing database connections...');
        await this.migrationRunner.close();
        await this.pool.end();
        console.log('✅ Database connections closed');
    }
}

module.exports = Database;