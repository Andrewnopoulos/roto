#!/usr/bin/env node

/**
 * Database Migration CLI Script
 * Usage: node scripts/migrate.js [command]
 * Commands: up, down, status, reset
 */

const Database = require('../db/database');
const MigrationRunner = require('../db/migration-runner');

// Database configuration from environment variables
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'roto_game',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

async function main() {
    const command = process.argv[2] || 'up';
    const migrationRunner = new MigrationRunner(dbConfig);

    console.log(`🎯 Roto Database Migration Tool`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🗄️  Database: ${dbConfig.database}@${dbConfig.host}:${dbConfig.port}\n`);

    try {
        switch (command) {
            case 'up':
                console.log('⬆️  Running migrations...\n');
                await migrationRunner.runMigrations();
                break;

            case 'down':
                console.log('⬇️  Rolling back migration...\n');
                await migrationRunner.rollbackLastMigration();
                break;

            case 'status':
                console.log('📋 Checking migration status...');
                await migrationRunner.getMigrationStatus();
                break;

            case 'reset':
                console.log('🔄 Resetting database...\n');
                await resetDatabase(dbConfig);
                await migrationRunner.runMigrations();
                break;

            case 'init':
                console.log('🚀 Initializing database...\n');
                const db = new Database(dbConfig);
                await db.initialize();
                await db.close();
                break;

            case 'test':
                console.log('🧪 Testing database connection...\n');
                const testDb = new Database(dbConfig);
                await testDb.testConnection();
                await testDb.close();
                break;

            default:
                console.log('❓ Unknown command:', command);
                console.log('\nAvailable commands:');
                console.log('  up     - Run pending migrations');
                console.log('  down   - Rollback last migration');
                console.log('  status - Show migration status');
                console.log('  reset  - Drop all tables and re-run migrations');
                console.log('  init   - Initialize database with migrations');
                console.log('  test   - Test database connection');
                process.exit(1);
        }

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        if (process.env.NODE_ENV === 'development') {
            console.error('\nStack trace:', error.stack);
        }
        process.exit(1);
        
    } finally {
        await migrationRunner.close();
    }

    console.log('\n✅ Migration command completed successfully!');
    process.exit(0);
}

/**
 * Reset database by dropping all tables
 */
async function resetDatabase(config) {
    const { Pool } = require('pg');
    const pool = new Pool(config);

    try {
        console.log('⚠️  WARNING: This will destroy all data in the database!');
        
        // In production, require explicit confirmation
        if (process.env.NODE_ENV === 'production') {
            console.log('❌ Database reset is not allowed in production environment');
            return;
        }

        console.log('🗑️  Dropping all tables...');
        
        // Drop all tables in correct order to handle foreign key constraints
        const dropTablesQuery = `
            DROP TABLE IF EXISTS game_moves CASCADE;
            DROP TABLE IF EXISTS user_sessions CASCADE;
            DROP TABLE IF EXISTS leaderboards CASCADE;
            DROP TABLE IF EXISTS matches CASCADE;
            DROP TABLE IF EXISTS game_participants CASCADE;
            DROP TABLE IF EXISTS games CASCADE;
            DROP TABLE IF EXISTS user_statistics CASCADE;
            DROP TABLE IF EXISTS users CASCADE;
            DROP TABLE IF EXISTS seasons CASCADE;
            DROP TABLE IF EXISTS schema_migrations CASCADE;
            
            -- Drop functions
            DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
            DROP FUNCTION IF EXISTS generate_room_code() CASCADE;
            DROP FUNCTION IF EXISTS update_user_statistics_after_game(UUID, BOOLEAN, BOOLEAN, INTEGER) CASCADE;
            DROP FUNCTION IF EXISTS refresh_leaderboard(UUID, VARCHAR) CASCADE;
            
            -- Drop extensions if they exist
            DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;
        `;

        await pool.query(dropTablesQuery);
        console.log('✅ All tables dropped successfully');

    } catch (error) {
        console.error('❌ Failed to reset database:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught exception:', error.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run the main function
main();