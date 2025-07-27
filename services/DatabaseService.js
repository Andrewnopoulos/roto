/**
 * Database Service
 * Handles database connections and common database operations
 */

const mysql = require('mysql2/promise');

class DatabaseService {
    constructor() {
        this.pool = null;
        this.isInitialized = false;
        this.initializePool();
    }

    /**
     * Initialize database connection pool
     */
    initializePool() {
        try {
            const config = {
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 3306,
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME || 'roto',
                waitForConnections: true,
                connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
                queueLimit: 0,
                acquireTimeout: 60000,
                timeout: 60000,
                reconnect: true,
                charset: 'utf8mb4',
                timezone: '+00:00'
            };

            this.pool = mysql.createPool(config);
            this.isInitialized = true;

            // Test the connection
            this.testConnection();

            // Handle pool events
            this.pool.on('connection', (connection) => {
                console.log('Database connection established as id ' + connection.threadId);
            });

            this.pool.on('error', (err) => {
                console.error('Database pool error:', err);
                if (err.code === 'PROTOCOL_CONNECTION_LOST') {
                    this.initializePool();
                } else {
                    throw err;
                }
            });

        } catch (error) {
            console.error('Failed to initialize database pool:', error);
            throw error;
        }
    }

    /**
     * Test database connection
     */
    async testConnection() {
        try {
            const connection = await this.pool.getConnection();
            await connection.ping();
            connection.release();
            console.log('Database connection test successful');
        } catch (error) {
            console.error('Database connection test failed:', error);
            throw error;
        }
    }

    /**
     * Get a connection from the pool
     * @returns {Promise<Connection>} Database connection
     */
    async getConnection() {
        if (!this.isInitialized || !this.pool) {
            throw new Error('Database pool not initialized');
        }

        try {
            return await this.pool.getConnection();
        } catch (error) {
            console.error('Error getting database connection:', error);
            throw error;
        }
    }

    /**
     * Execute a query with parameters
     * @param {string} query - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Array>} Query results
     */
    async execute(query, params = []) {
        const connection = await this.getConnection();
        try {
            const [results] = await connection.execute(query, params);
            return results;
        } catch (error) {
            console.error('Database query error:', error);
            console.error('Query:', query);
            console.error('Params:', params);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Execute a transaction
     * @param {Function} callback - Transaction callback function
     * @returns {Promise<*>} Transaction result
     */
    async transaction(callback) {
        const connection = await this.getConnection();
        try {
            await connection.beginTransaction();
            const result = await callback(connection);
            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Insert a record and return the inserted ID
     * @param {string} table - Table name
     * @param {Object} data - Data to insert
     * @returns {Promise<number>} Inserted ID
     */
    async insert(table, data) {
        const fields = Object.keys(data);
        const values = Object.values(data);
        const placeholders = fields.map(() => '?').join(', ');
        
        const query = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`;
        
        const connection = await this.getConnection();
        try {
            const [result] = await connection.execute(query, values);
            return result.insertId;
        } finally {
            connection.release();
        }
    }

    /**
     * Update records
     * @param {string} table - Table name
     * @param {Object} data - Data to update
     * @param {Object} where - Where conditions
     * @returns {Promise<number>} Number of affected rows
     */
    async update(table, data, where) {
        const setFields = Object.keys(data).map(field => `${field} = ?`).join(', ');
        const whereFields = Object.keys(where).map(field => `${field} = ?`).join(' AND ');
        
        const query = `UPDATE ${table} SET ${setFields} WHERE ${whereFields}`;
        const params = [...Object.values(data), ...Object.values(where)];
        
        const connection = await this.getConnection();
        try {
            const [result] = await connection.execute(query, params);
            return result.affectedRows;
        } finally {
            connection.release();
        }
    }

    /**
     * Delete records
     * @param {string} table - Table name
     * @param {Object} where - Where conditions
     * @returns {Promise<number>} Number of affected rows
     */
    async delete(table, where) {
        const whereFields = Object.keys(where).map(field => `${field} = ?`).join(' AND ');
        const query = `DELETE FROM ${table} WHERE ${whereFields}`;
        const params = Object.values(where);
        
        const connection = await this.getConnection();
        try {
            const [result] = await connection.execute(query, params);
            return result.affectedRows;
        } finally {
            connection.release();
        }
    }

    /**
     * Select records
     * @param {string} table - Table name
     * @param {Object} where - Where conditions (optional)
     * @param {Object} options - Query options (limit, offset, orderBy)
     * @returns {Promise<Array>} Selected records
     */
    async select(table, where = {}, options = {}) {
        let query = `SELECT * FROM ${table}`;
        const params = [];

        // Add WHERE clause
        if (Object.keys(where).length > 0) {
            const whereFields = Object.keys(where).map(field => `${field} = ?`).join(' AND ');
            query += ` WHERE ${whereFields}`;
            params.push(...Object.values(where));
        }

        // Add ORDER BY
        if (options.orderBy) {
            query += ` ORDER BY ${options.orderBy}`;
        }

        // Add LIMIT and OFFSET
        if (options.limit) {
            query += ` LIMIT ?`;
            params.push(options.limit);
            
            if (options.offset) {
                query += ` OFFSET ?`;
                params.push(options.offset);
            }
        }

        const connection = await this.getConnection();
        try {
            const [results] = await connection.execute(query, params);
            return results;
        } finally {
            connection.release();
        }
    }

    /**
     * Count records
     * @param {string} table - Table name
     * @param {Object} where - Where conditions (optional)
     * @returns {Promise<number>} Record count
     */
    async count(table, where = {}) {
        let query = `SELECT COUNT(*) as count FROM ${table}`;
        const params = [];

        if (Object.keys(where).length > 0) {
            const whereFields = Object.keys(where).map(field => `${field} = ?`).join(' AND ');
            query += ` WHERE ${whereFields}`;
            params.push(...Object.values(where));
        }

        const connection = await this.getConnection();
        try {
            const [results] = await connection.execute(query, params);
            return results[0].count;
        } finally {
            connection.release();
        }
    }

    /**
     * Check if a record exists
     * @param {string} table - Table name
     * @param {Object} where - Where conditions
     * @returns {Promise<boolean>} Whether record exists
     */
    async exists(table, where) {
        const count = await this.count(table, where);
        return count > 0;
    }

    /**
     * Execute a raw SQL query
     * @param {string} query - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Array>} Query results
     */
    async query(query, params = []) {
        return this.execute(query, params);
    }

    /**
     * Escape identifier (table/column names)
     * @param {string} identifier - Identifier to escape
     * @returns {string} Escaped identifier
     */
    escapeId(identifier) {
        return mysql.escapeId(identifier);
    }

    /**
     * Escape value
     * @param {*} value - Value to escape
     * @returns {string} Escaped value
     */
    escape(value) {
        return mysql.escape(value);
    }

    /**
     * Close the database pool
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            this.isInitialized = false;
            console.log('Database pool closed');
        }
    }

    /**
     * Get pool status
     * @returns {Object} Pool status information
     */
    getPoolStatus() {
        if (!this.pool) {
            return { status: 'not_initialized' };
        }

        return {
            status: 'active',
            connectionLimit: this.pool.config.connectionLimit,
            acquireTimeout: this.pool.config.acquireTimeout,
            // Note: Some pool statistics might not be available in all versions
        };
    }

    /**
     * Ping the database
     * @returns {Promise<boolean>} Whether ping was successful
     */
    async ping() {
        try {
            const connection = await this.getConnection();
            await connection.ping();
            connection.release();
            return true;
        } catch (error) {
            console.error('Database ping failed:', error);
            return false;
        }
    }

    /**
     * Run database health check
     * @returns {Promise<Object>} Health check results
     */
    async healthCheck() {
        const startTime = Date.now();
        
        try {
            const pingSuccess = await this.ping();
            const responseTime = Date.now() - startTime;
            
            return {
                status: pingSuccess ? 'healthy' : 'unhealthy',
                responseTime,
                pool: this.getPoolStatus(),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                responseTime: Date.now() - startTime,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// Export singleton instance
module.exports = DatabaseService;