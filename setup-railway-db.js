/**
 * Manual Railway Database Setup
 * Run this script manually in Railway to set up your database tables
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function setupRailwayDatabase() {
    console.log('🚂 Setting up Railway Database...');
    
    // Create database connection
    const pool = new Pool({
        host: process.env.PGHOST,
        port: process.env.PGPORT || 5432,
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        // Test connection
        console.log('📦 Testing database connection...');
        const testResult = await pool.query('SELECT NOW() as current_time, version() as version');
        console.log('✅ Database connection successful');
        console.log(`⏰ Server time: ${testResult.rows[0].current_time}`);
        console.log(`🔧 PostgreSQL version: ${testResult.rows[0].version.split(' ')[1]}`);

        // Check if tables already exist
        console.log('🔍 Checking existing tables...');
        const existingTables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        if (existingTables.rows.length > 0) {
            console.log('📋 Found existing tables:', existingTables.rows.map(r => r.table_name).join(', '));
            const proceed = process.argv.includes('--force');
            if (!proceed) {
                console.log('⚠️ Tables already exist. Use --force to recreate them.');
                return;
            }
        }

        // Read and execute the schema file
        console.log('🔧 Creating database schema...');
        const schemaPath = path.join(__dirname, 'backend', 'migrations', '001_initial_schema.sql');
        
        if (!fs.existsSync(schemaPath)) {
            throw new Error(`Schema file not found: ${schemaPath}`);
        }
        
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        
        // Split the SQL into individual statements
        const statements = schemaSql
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

        console.log(`📝 Executing ${statements.length} SQL statements...`);

        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            if (statement.length > 0) {
                try {
                    await pool.query(statement);
                    if (statement.toLowerCase().includes('create table')) {
                        const tableName = statement.match(/create table\s+(\w+)/i)?.[1];
                        console.log(`✅ Created table: ${tableName}`);
                    }
                } catch (error) {
                    // Ignore "already exists" errors when using --force
                    if (error.message.includes('already exists') && process.argv.includes('--force')) {
                        console.log(`⚠️ Skipped (already exists): ${statement.substring(0, 50)}...`);
                    } else {
                        console.error(`❌ Error executing statement: ${statement.substring(0, 100)}...`);
                        throw error;
                    }
                }
            }
        }

        // Verify tables were created
        console.log('🔍 Verifying table creation...');
        const finalTables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        
        console.log('📋 Created tables:');
        finalTables.rows.forEach(row => {
            console.log(`  - ${row.table_name}`);
        });

        // Create a default season if none exists
        console.log('🏆 Setting up default season...');
        const seasonExists = await pool.query('SELECT COUNT(*) FROM seasons');
        if (seasonExists.rows[0].count === '0') {
            await pool.query(`
                INSERT INTO seasons (name, description, start_date, end_date, is_active)
                VALUES ('Season 1', 'Initial game season', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '365 days', true)
            `);
            console.log('✅ Created default season');
        }

        console.log('🎉 Database setup completed successfully!');
        console.log('');
        console.log('Next steps:');
        console.log('1. Your Railway app should now work with the database');
        console.log('2. Test creating user accounts and playing games');
        console.log('3. Monitor the Railway logs for any issues');

    } catch (error) {
        console.error('❌ Database setup failed:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run the setup
if (require.main === module) {
    setupRailwayDatabase()
        .then(() => {
            console.log('✅ Setup completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Setup failed:', error);
            process.exit(1);
        });
}

module.exports = setupRailwayDatabase;