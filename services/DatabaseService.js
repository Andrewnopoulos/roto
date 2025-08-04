/**
 * Database Service
 * Handles database connections and common database operations
 * Updated to use PostgreSQL consistently with the rest of the application
 * Includes comprehensive SQL injection protection
 */

const { Pool } = require('pg');
const SQLSecurityValidator = require('../utils/sqlSecurityValidator');

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
                port: process.env.DB_PORT || 5432,
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME || 'roto_db',
                max: parseInt(process.env.DB_CONNECTION_LIMIT) || 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
                ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
            };

            this.pool = new Pool(config);
            this.isInitialized = true;

            // Test the connection (only if DB_PASSWORD is properly configured)
            if (process.env.DB_PASSWORD && process.env.DB_PASSWORD !== '') {
                this.testConnection().catch(() => {
                    console.warn('Database connection test failed during initialization');
                });
            }

            // Handle pool events
            this.pool.on('connect', () => {
                console.log('Database connection established');
            });

            this.pool.on('error', (err) => {
                console.error('Database pool error:', err);
                throw err;
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
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();
            console.log('Database connection test successful');
        } catch (error) {
            console.error('Database connection test failed:', error);
            throw error;
        }
    }

    /**
     * Get a client from the pool
     * @returns {Promise<Client>} Database client
     */
    async getConnection() {
        if (!this.isInitialized || !this.pool) {
            throw new Error('Database pool not initialized');
        }

        try {
            return await this.pool.connect();
        } catch (error) {
            console.error('Error getting database connection:', error);
            throw error;
        }
    }

    /**
     * Execute a query with parameters (with security validation)
     * @param {string} query - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Array>} Query results
     */
    async execute(query, params = []) {
        // Validate query for security
        const validation = SQLSecurityValidator.validateQuery(query, params);
        if (!validation.isValid) {
            const sanitizedQuery = SQLSecurityValidator.sanitizeForLogging(query);
            console.error('SQL Security Validation Failed:', {
                query: sanitizedQuery,
                errors: validation.errors
            });
            throw new Error(`SQL validation failed: ${validation.errors.join(', ')}`);
        }

        const client = await this.getConnection();
        try {
            const result = await client.query(query, params);
            return result.rows;
        } catch (error) {
            console.error('Database query error:', error);
            console.error('Query:', SQLSecurityValidator.sanitizeForLogging(query));
            console.error('Params:', params.map(p => SQLSecurityValidator.sanitizeForLogging(String(p))));
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Execute a transaction
     * @param {Function} callback - Transaction callback function
     * @returns {Promise<*>} Transaction result
     */
    async transaction(callback) {
        const client = await this.getConnection();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Insert a record and return the inserted ID (with security validation)
     * @param {string} table - Table name
     * @param {Object} data - Data to insert
     * @returns {Promise<number>} Inserted ID
     */
    async insert(table, data) {
        // Validate table name for security
        if (!SQLSecurityValidator.isValidTableName(table)) {
            throw new Error(`Invalid table name: ${SQLSecurityValidator.sanitizeForLogging(table)}`);
        }

        const fields = Object.keys(data);
        const values = Object.values(data);
        
        // Validate column names
        fields.forEach(field => {
            if (!SQLSecurityValidator.isValidColumnName(field)) {
                throw new Error(`Invalid column name: ${SQLSecurityValidator.sanitizeForLogging(field)}`);
            }
        });

        const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
        const escapedFields = SQLSecurityValidator.escapeIdentifiers(fields);
        const escapedTable = SQLSecurityValidator.escapeIdentifier(table);
        
        const query = `INSERT INTO ${escapedTable} (${escapedFields.join(', ')}) VALUES (${placeholders}) RETURNING id`;
        
        return this.execute(query, values).then(rows => rows[0].id);
    }

    /**
     * Update records
     * @param {string} table - Table name
     * @param {Object} data - Data to update
     * @param {Object} where - Where conditions
     * @returns {Promise<number>} Number of affected rows
     */
    async update(table, data, where) {
        const dataValues = Object.values(data);
        const whereValues = Object.values(where);
        
        const setFields = Object.keys(data).map((field, index) => `${field} = $${index + 1}`).join(', ');
        const whereFields = Object.keys(where).map((field, index) => `${field} = $${dataValues.length + index + 1}`).join(' AND ');
        
        const query = `UPDATE ${table} SET ${setFields} WHERE ${whereFields}`;
        const params = [...dataValues, ...whereValues];
        
        const client = await this.getConnection();
        try {
            const result = await client.query(query, params);
            return result.rowCount;
        } finally {
            client.release();
        }
    }

    /**
     * Delete records
     * @param {string} table - Table name
     * @param {Object} where - Where conditions
     * @returns {Promise<number>} Number of affected rows
     */
    async delete(table, where) {
        const whereFields = Object.keys(where).map((field, index) => `${field} = $${index + 1}`).join(' AND ');
        const query = `DELETE FROM ${table} WHERE ${whereFields}`;
        const params = Object.values(where);
        
        const client = await this.getConnection();
        try {
            const result = await client.query(query, params);
            return result.rowCount;
        } finally {
            client.release();
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
            const whereFields = Object.keys(where).map((field, index) => `${field} = $${index + 1}`).join(' AND ');
            query += ` WHERE ${whereFields}`;
            params.push(...Object.values(where));
        }

        // Add ORDER BY (with validation)
        if (options.orderBy) {
            if (!SQLSecurityValidator.isValidOrderBy(options.orderBy)) {
                throw new Error(`Invalid ORDER BY clause: ${SQLSecurityValidator.sanitizeForLogging(options.orderBy)}`);
            }
            query += ` ORDER BY ${options.orderBy}`;
        }

        // Add LIMIT and OFFSET
        if (options.limit) {
            query += ` LIMIT $${params.length + 1}`;
            params.push(options.limit);
            
            if (options.offset) {
                query += ` OFFSET $${params.length + 1}`;
                params.push(options.offset);
            }
        }

        const client = await this.getConnection();
        try {
            const result = await client.query(query, params);
            return result.rows;
        } finally {
            client.release();
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
            const whereFields = Object.keys(where).map((field, index) => `${field} = $${index + 1}`).join(' AND ');
            query += ` WHERE ${whereFields}`;
            params.push(...Object.values(where));
        }

        const client = await this.getConnection();
        try {
            const result = await client.query(query, params);
            return parseInt(result.rows[0].count);
        } finally {
            client.release();
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
     * Escape identifier (table/column names) - PostgreSQL version
     * @param {string} identifier - Identifier to escape
     * @returns {string} Escaped identifier
     */
    escapeId(identifier) {
        return `"${identifier.replace(/"/g, '""')}"`;
    }

    /**
     * Escape value - PostgreSQL version (note: parameterized queries are preferred)
     * @param {*} value - Value to escape
     * @returns {string} Escaped value
     */
    escape(value) {
        if (value === null) return 'NULL';
        if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
        if (typeof value === 'number') return value.toString();
        if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
        return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
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
            const client = await this.getConnection();
            await client.query('SELECT 1');
            client.release();
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