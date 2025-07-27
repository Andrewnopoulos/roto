/**
 * Database Migration Runner
 * Handles running SQL migrations in order and tracking migration state
 */

const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');

class MigrationRunner {
    constructor(databaseConfig) {
        this.pool = new Pool(databaseConfig);
        this.migrationsDir = path.join(__dirname, '..', 'migrations');
    }

    /**
     * Initialize the migrations table if it doesn't exist
     */
    async initializeMigrationsTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                migration_name VARCHAR(255) NOT NULL UNIQUE,
                executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                checksum VARCHAR(64) NOT NULL
            );
            
            CREATE INDEX IF NOT EXISTS idx_schema_migrations_name 
            ON schema_migrations(migration_name);
        `;
        
        try {
            await this.pool.query(query);
            console.log('✓ Migrations table initialized');
        } catch (error) {
            console.error('✗ Failed to initialize migrations table:', error.message);
            throw error;
        }
    }

    /**
     * Get list of available migration files
     */
    async getMigrationFiles() {
        try {
            const files = await fs.readdir(this.migrationsDir);
            return files
                .filter(file => file.endsWith('.sql'))
                .sort(); // Ensures migrations run in order
        } catch (error) {
            console.error('✗ Failed to read migrations directory:', error.message);
            throw error;
        }
    }

    /**
     * Get list of executed migrations from database
     */
    async getExecutedMigrations() {
        try {
            const result = await this.pool.query(
                'SELECT migration_name, checksum FROM schema_migrations ORDER BY migration_name'
            );
            return result.rows;
        } catch (error) {
            console.error('✗ Failed to get executed migrations:', error.message);
            throw error;
        }
    }

    /**
     * Calculate checksum for migration file content
     */
    calculateChecksum(content) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Read and parse migration file
     */
    async readMigrationFile(filename) {
        const filePath = path.join(this.migrationsDir, filename);
        try {
            const content = await fs.readFile(filePath, 'utf8');
            return {
                filename,
                content,
                checksum: this.calculateChecksum(content)
            };
        } catch (error) {
            console.error(`✗ Failed to read migration file ${filename}:`, error.message);
            throw error;
        }
    }

    /**
     * Execute a single migration
     */
    async executeMigration(migration) {
        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Execute the migration SQL
            console.log(`→ Executing migration: ${migration.filename}`);
            await client.query(migration.content);
            
            // Record the migration as executed
            await client.query(
                'INSERT INTO schema_migrations (migration_name, checksum) VALUES ($1, $2)',
                [migration.filename, migration.checksum]
            );
            
            await client.query('COMMIT');
            console.log(`✓ Migration completed: ${migration.filename}`);
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`✗ Migration failed: ${migration.filename}`, error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Validate migration checksum against database record
     */
    validateMigrationChecksum(migration, executedMigration) {
        if (migration.checksum !== executedMigration.checksum) {
            throw new Error(
                `Migration checksum mismatch for ${migration.filename}. ` +
                `File may have been modified after execution.`
            );
        }
    }

    /**
     * Run all pending migrations
     */
    async runMigrations() {
        console.log('🚀 Starting database migrations...\n');
        
        try {
            // Initialize migrations table
            await this.initializeMigrationsTable();
            
            // Get available and executed migrations
            const migrationFiles = await this.getMigrationFiles();
            const executedMigrations = await this.getExecutedMigrations();
            
            // Create lookup map for executed migrations
            const executedMap = new Map(
                executedMigrations.map(m => [m.migration_name, m])
            );
            
            let migrationsRun = 0;
            
            for (const filename of migrationFiles) {
                const migration = await this.readMigrationFile(filename);
                const executedMigration = executedMap.get(filename);
                
                if (executedMigration) {
                    // Migration already executed, validate checksum
                    try {
                        this.validateMigrationChecksum(migration, executedMigration);
                        console.log(`↩ Migration already executed: ${filename}`);
                    } catch (error) {
                        console.error(`✗ ${error.message}`);
                        throw error;
                    }
                } else {
                    // New migration, execute it
                    await this.executeMigration(migration);
                    migrationsRun++;
                }
            }
            
            console.log(`\n✅ Migration process completed successfully!`);
            console.log(`📊 Migrations executed: ${migrationsRun}`);
            console.log(`📊 Total migrations: ${migrationFiles.length}`);
            
        } catch (error) {
            console.error('\n❌ Migration process failed:', error.message);
            throw error;
        }
    }

    /**
     * Rollback the last migration (if supported)
     * Note: This requires migrations to have explicit rollback statements
     */
    async rollbackLastMigration() {
        console.log('⏪ Rolling back last migration...\n');
        
        try {
            const result = await this.pool.query(
                'SELECT migration_name FROM schema_migrations ORDER BY executed_at DESC LIMIT 1'
            );
            
            if (result.rows.length === 0) {
                console.log('ℹ No migrations to rollback');
                return;
            }
            
            const lastMigration = result.rows[0].migration_name;
            console.log(`⚠️ Rollback functionality not implemented for: ${lastMigration}`);
            console.log('Manual rollback required - check migration file for reverse operations');
            
        } catch (error) {
            console.error('✗ Rollback failed:', error.message);
            throw error;
        }
    }

    /**
     * Get migration status
     */
    async getMigrationStatus() {
        try {
            await this.initializeMigrationsTable();
            
            const migrationFiles = await this.getMigrationFiles();
            const executedMigrations = await this.getExecutedMigrations();
            
            const executedMap = new Map(
                executedMigrations.map(m => [m.migration_name, m])
            );
            
            console.log('\n📋 Migration Status:\n');
            console.log('Status | Migration File');
            console.log('-------|---------------');
            
            for (const filename of migrationFiles) {
                const status = executedMap.has(filename) ? '✅ DONE' : '⏳ PENDING';
                console.log(`${status} | ${filename}`);
            }
            
            const pendingCount = migrationFiles.length - executedMigrations.length;
            console.log(`\n📊 Total: ${migrationFiles.length} | Executed: ${executedMigrations.length} | Pending: ${pendingCount}`);
            
        } catch (error) {
            console.error('✗ Failed to get migration status:', error.message);
            throw error;
        }
    }

    /**
     * Close database connection pool
     */
    async close() {
        await this.pool.end();
    }
}

module.exports = MigrationRunner;