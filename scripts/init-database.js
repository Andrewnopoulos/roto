#!/usr/bin/env node

/**
 * Database Initialization Script
 * Sets up the complete database schema for the Roto Leaderboard System
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// Database configuration
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'roto_db',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});

async function initializeDatabase() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 Starting database initialization...');
        
        // Read the schema file
        const schemaPath = path.join(__dirname, '../database/schema/leaderboards.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        console.log('📋 Executing database schema...');
        await client.query(schema);
        
        console.log('👥 Creating sample data...');
        await createSampleData(client);
        
        console.log('✅ Database initialization completed successfully!');
        
        // Display summary
        await displayDatabaseSummary(client);
        
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

async function createSampleData(client) {
    // Create sample players
    const players = [
        { username: 'champion_alice', email: 'alice@example.com', display_name: 'Alice Champion' },
        { username: 'bob_master', email: 'bob@example.com', display_name: 'Bob Master' },
        { username: 'carol_expert', email: 'carol@example.com', display_name: 'Carol Expert' },
        { username: 'dave_rookie', email: 'dave@example.com', display_name: 'Dave Rookie' },
        { username: 'eve_pro', email: 'eve@example.com', display_name: 'Eve Pro' },
        { username: 'frank_legend', email: 'frank@example.com', display_name: 'Frank Legend' },
        { username: 'grace_warrior', email: 'grace@example.com', display_name: 'Grace Warrior' },
        { username: 'henry_knight', email: 'henry@example.com', display_name: 'Henry Knight' },
        { username: 'ivy_sage', email: 'ivy@example.com', display_name: 'Ivy Sage' },
        { username: 'jack_titan', email: 'jack@example.com', display_name: 'Jack Titan' }
    ];
    
    console.log('  → Creating sample players...');
    for (const player of players) {
        await client.query(`
            INSERT INTO players (username, email, display_name, password_hash, is_active)
            VALUES ($1, $2, $3, $4, true)
            ON CONFLICT (username) DO NOTHING
        `, [player.username, player.email, player.display_name, 'sample_hash']);
    }
    
    // Create a sample season
    console.log('  → Creating sample season...');
    const seasonStart = new Date();
    const seasonEnd = new Date();
    seasonEnd.setMonth(seasonEnd.getMonth() + 3); // 3 months from now
    
    await client.query(`
        INSERT INTO seasons (name, start_date, end_date, is_active)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (name) DO NOTHING
    `, ['Season 1 - 2024', seasonStart, seasonEnd]);
    
    // Initialize leaderboard entries for all players
    console.log('  → Initializing leaderboard entries...');
    const playersResult = await client.query('SELECT id FROM players LIMIT 10');
    const categoriesResult = await client.query('SELECT id FROM leaderboard_categories');
    const seasonResult = await client.query('SELECT id FROM seasons WHERE is_active = true LIMIT 1');
    
    const seasonId = seasonResult.rows[0]?.id;
    
    for (const player of playersResult.rows) {
        for (const category of categoriesResult.rows) {
            // Generate some sample stats
            const wins = Math.floor(Math.random() * 50);
            const losses = Math.floor(Math.random() * 30);
            const draws = Math.floor(Math.random() * 10);
            const totalGames = wins + losses + draws;
            const winPercentage = totalGames > 0 ? (wins / totalGames * 100) : 0;
            const rating = 800 + Math.floor(Math.random() * 400); // Rating between 800-1200
            
            await client.query(`
                INSERT INTO leaderboard_entries (
                    player_id, category_id, season_id, wins, losses, draws, 
                    total_games, win_percentage, rating, last_game_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() - INTERVAL '1 hour' * random() * 24)
                ON CONFLICT (player_id, category_id, season_id) DO NOTHING
            `, [
                player.id, 
                category.id, 
                category.reset_frequency === 'seasonal' ? seasonId : null,
                wins, 
                losses, 
                draws, 
                totalGames, 
                winPercentage.toFixed(2), 
                rating
            ]);
        }
    }
    
    // Create some sample game results
    console.log('  → Creating sample game results...');
    const playerIds = playersResult.rows.map(p => p.id);
    
    for (let i = 0; i < 20; i++) {
        const player1Id = playerIds[Math.floor(Math.random() * playerIds.length)];
        let player2Id = playerIds[Math.floor(Math.random() * playerIds.length)];
        
        // Ensure different players
        while (player2Id === player1Id) {
            player2Id = playerIds[Math.floor(Math.random() * playerIds.length)];
        }
        
        const winnerId = Math.random() > 0.1 ? (Math.random() > 0.5 ? player1Id : player2Id) : null; // 10% draws
        const resultType = winnerId ? 'win' : 'draw';
        const duration = 300 + Math.floor(Math.random() * 1800); // 5-35 minutes
        
        await client.query(`
            INSERT INTO game_results (
                game_id, player1_id, player2_id, winner_id, 
                game_type, result_type, duration_seconds
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            `game_${Date.now()}_${i}`,
            player1Id,
            player2Id,
            winnerId,
            'standard',
            resultType,
            duration
        ]);
    }
}

async function displayDatabaseSummary(client) {
    console.log('\n📊 Database Summary:');
    console.log('==================');
    
    // Players count
    const playersResult = await client.query('SELECT COUNT(*) as count FROM players');
    console.log(`👥 Players: ${playersResult.rows[0].count}`);
    
    // Seasons count
    const seasonsResult = await client.query('SELECT COUNT(*) as count FROM seasons');
    console.log(`🏆 Seasons: ${seasonsResult.rows[0].count}`);
    
    // Categories count
    const categoriesResult = await client.query('SELECT COUNT(*) as count FROM leaderboard_categories');
    console.log(`📋 Leaderboard Categories: ${categoriesResult.rows[0].count}`);
    
    // Leaderboard entries count
    const entriesResult = await client.query('SELECT COUNT(*) as count FROM leaderboard_entries');
    console.log(`📈 Leaderboard Entries: ${entriesResult.rows[0].count}`);
    
    // Game results count
    const gamesResult = await client.query('SELECT COUNT(*) as count FROM game_results');
    console.log(`🎮 Game Results: ${gamesResult.rows[0].count}`);
    
    // Top 3 players by rating
    console.log('\n🏆 Top 3 Players (Global Rating):');
    const topPlayersResult = await client.query(`
        SELECT p.display_name, le.rating, le.wins, le.losses
        FROM leaderboard_entries le
        JOIN players p ON le.player_id = p.id
        JOIN leaderboard_categories lc ON le.category_id = lc.id
        WHERE lc.name = 'global_rating'
        ORDER BY le.rating DESC
        LIMIT 3
    `);
    
    topPlayersResult.rows.forEach((player, index) => {
        console.log(`   ${index + 1}. ${player.display_name} - Rating: ${player.rating} (${player.wins}W/${player.losses}L)`);
    });
    
    console.log('\n🌟 Database is ready for the Roto Leaderboard System!');
    console.log('🔗 You can now start the server with: npm start');
}

// Run the initialization
if (require.main === module) {
    initializeDatabase()
        .then(() => {
            console.log('\n✨ Initialization completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Initialization failed:', error);
            process.exit(1);
        });
}

module.exports = { initializeDatabase };