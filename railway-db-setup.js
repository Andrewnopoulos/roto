/**
 * Railway Database Setup Script
 * This script will be run during Railway deployment to set up the database
 */

const Database = require('./backend/db/database');

async function setupDatabase() {
    console.log('🚂 Railway Database Setup Starting...');
    
    try {
        // Initialize database with Railway environment variables
        const db = new Database({
            host: process.env.PGHOST,
            port: process.env.PGPORT || 5432,
            database: process.env.PGDATABASE,
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
        
        console.log('📦 Testing database connection...');
        await db.testConnection();
        
        console.log('🔧 Running database migrations...');
        await db.initialize();
        
        console.log('✅ Railway database setup completed successfully!');
        await db.close();
        
        return true;
    } catch (error) {
        console.error('❌ Railway database setup failed:', error);
        process.exit(1);
    }
}

// Run setup if this script is executed directly
if (require.main === module) {
    setupDatabase();
}

module.exports = setupDatabase;