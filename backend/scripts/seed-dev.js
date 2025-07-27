#!/usr/bin/env node

/**
 * Development Database Seeding Script
 * Populates the database with realistic test data for development
 */

const Database = require('../db/database');
const bcrypt = require('bcrypt');

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'roto_game',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// Sample user data for development
const sampleUsers = [
    {
        username: 'alice_gamer',
        email: 'alice@example.com',
        display_name: 'Alice Cooper',
        password: 'password123'
    },
    {
        username: 'bob_pro',
        email: 'bob@example.com',
        display_name: 'Bob the Builder',
        password: 'password123'
    },
    {
        username: 'charlie_rookie',
        email: 'charlie@example.com',
        display_name: 'Charlie Brown',
        password: 'password123'
    },
    {
        username: 'diana_master',
        email: 'diana@example.com',
        display_name: 'Diana Prince',
        password: 'password123'
    },
    {
        username: 'eve_ninja',
        email: 'eve@example.com',
        display_name: 'Eve Online',
        password: 'password123'
    },
    {
        username: 'frank_tank',
        email: 'frank@example.com',
        display_name: 'Frank Castle',
        password: 'password123'
    },
    {
        username: 'grace_ace',
        email: 'grace@example.com',
        display_name: 'Grace Hopper',
        password: 'password123'
    },
    {
        username: 'henry_hero',
        email: 'henry@example.com',
        display_name: 'Henry Ford',
        password: 'password123'
    }
];

// Game types and their settings
const gameTypes = [
    { type: 'classic', settings: { time_limit: 300, board_size: 8 } },
    { type: 'blitz', settings: { time_limit: 60, board_size: 6 } },
    { type: 'tournament', settings: { time_limit: 600, board_size: 10 } }
];

async function main() {
    console.log('🌱 Seeding development database...\n');

    const db = new Database(dbConfig);

    try {
        // Test connection
        await db.testConnection();

        // Clear existing development data (but keep migrations)
        await clearDevelopmentData(db);

        // Create users
        const users = await createUsers(db);
        console.log(`✅ Created ${users.length} users`);

        // Create seasons
        const seasons = await createSeasons(db);
        console.log(`✅ Created ${seasons.length} seasons`);

        // Create completed games and matches
        const matches = await createMatchHistory(db, users);
        console.log(`✅ Created ${matches.length} completed matches`);

        // Create some active games
        const activeGames = await createActiveGames(db, users);
        console.log(`✅ Created ${activeGames.length} active games`);

        // Update leaderboards
        await updateLeaderboards(db, seasons[0].id);
        console.log(`✅ Updated leaderboards`);

        // Display summary
        await displaySummary(db);

    } catch (error) {
        console.error('❌ Seeding failed:', error.message);
        if (process.env.NODE_ENV === 'development') {
            console.error('\nStack trace:', error.stack);
        }
        process.exit(1);
    } finally {
        await db.close();
    }

    console.log('\n✅ Development database seeding completed!');
}

async function clearDevelopmentData(db) {
    console.log('🧹 Clearing existing development data...');
    
    // Delete in correct order to handle foreign key constraints
    await db.query('DELETE FROM game_moves');
    await db.query('DELETE FROM user_sessions');
    await db.query('DELETE FROM leaderboards');
    await db.query('DELETE FROM matches');
    await db.query('DELETE FROM game_participants');
    await db.query('DELETE FROM games');
    await db.query('DELETE FROM user_statistics');
    await db.query('DELETE FROM users WHERE email LIKE \'%@example.com\'');
    await db.query('DELETE FROM seasons WHERE name LIKE \'%Development%\'');
    
    console.log('✅ Development data cleared');
}

async function createUsers(db) {
    console.log('👥 Creating sample users...');
    const users = [];

    for (const userData of sampleUsers) {
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        
        const user = await db.users.create({
            username: userData.username,
            email: userData.email,
            display_name: userData.display_name,
            password_hash: hashedPassword
        });

        users.push(user);
    }

    return users;
}

async function createSeasons(db) {
    console.log('📅 Creating seasons...');
    
    const currentSeason = await db.queryOne(`
        INSERT INTO seasons (name, description, start_date, end_date, is_active, settings)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
    `, [
        'Development Season 2025',
        'Current development season for testing',
        '2025-01-01 00:00:00+00',
        '2025-12-31 23:59:59+00',
        true,
        JSON.stringify({ rating_decay: false, placement_games: 5, rating_k_factor: 32 })
    ]);

    const previousSeason = await db.queryOne(`
        INSERT INTO seasons (name, description, start_date, end_date, is_active, settings)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
    `, [
        'Development Season 2024',
        'Previous development season (completed)',
        '2024-01-01 00:00:00+00',
        '2024-12-31 23:59:59+00',
        false,
        JSON.stringify({ rating_decay: true, placement_games: 10, rating_k_factor: 40 })
    ]);

    return [currentSeason, previousSeason];
}

async function createMatchHistory(db, users) {
    console.log('🎮 Creating match history...');
    const matches = [];

    // Create 50 completed matches
    for (let i = 0; i < 50; i++) {
        const gameType = gameTypes[Math.floor(Math.random() * gameTypes.length)];
        const numPlayers = Math.floor(Math.random() * 3) + 2; // 2-4 players
        const gameUsers = shuffleArray([...users]).slice(0, numPlayers);
        
        // Create game
        const game = await db.queryOne(`
            INSERT INTO games (room_code, game_type, status, max_players, current_players, started_at, ended_at, settings)
            VALUES ($1, $2, 'completed', $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            generateRoomCode(),
            gameType.type,
            numPlayers,
            numPlayers,
            new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date in last 30 days
            new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000 + Math.random() * 60 * 60 * 1000), // End 0-1 hour after start
            JSON.stringify(gameType.settings)
        ]);

        // Add participants
        const winner = gameUsers[0]; // First player wins
        for (let j = 0; j < gameUsers.length; j++) {
            const user = gameUsers[j];
            const isWinner = j === 0;
            const placement = j + 1;
            const score = Math.floor(Math.random() * 100) + (isWinner ? 50 : 0);
            
            // Get current rating for rating change calculation
            const currentStats = await db.queryOne(`
                SELECT current_rating FROM user_statistics WHERE user_id = $1
            `, [user.id]);
            
            const ratingBefore = currentStats?.current_rating || 1200;
            const ratingChange = isWinner ? Math.floor(Math.random() * 40) + 10 : -Math.floor(Math.random() * 40) - 5;
            const ratingAfter = Math.max(100, ratingBefore + ratingChange);

            await db.query(`
                INSERT INTO game_participants (game_id, user_id, player_position, is_ready, is_active, final_score, placement, rating_before, rating_after, rating_change)
                VALUES ($1, $2, $3, true, true, $4, $5, $6, $7, $8)
            `, [game.id, user.id, j + 1, score, placement, ratingBefore, ratingAfter, ratingChange]);

            // Update user statistics
            await db.query(`
                UPDATE user_statistics SET
                    total_games_played = total_games_played + 1,
                    total_wins = total_wins + $2,
                    total_losses = total_losses + $3,
                    current_rating = $4,
                    peak_rating = GREATEST(peak_rating, $4),
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $1
            `, [user.id, isWinner ? 1 : 0, isWinner ? 0 : 1, ratingAfter]);
        }

        // Create match record
        const match = await db.queryOne(`
            INSERT INTO matches (game_id, game_type, total_players, duration_seconds, winner_id, match_result, statistics)
            VALUES ($1, $2, $3, $4, $5, 'completed', $6)
            RETURNING *
        `, [
            game.id,
            gameType.type,
            numPlayers,
            Math.floor(Math.random() * 1800) + 300, // 5-35 minutes
            winner.id,
            JSON.stringify({
                total_moves: Math.floor(Math.random() * 100) + 20,
                average_move_time: Math.floor(Math.random() * 30) + 5,
                total_pieces_placed: Math.floor(Math.random() * 200) + 50
            })
        ]);

        matches.push(match);
    }

    return matches;
}

async function createActiveGames(db, users) {
    console.log('🕹️  Creating active games...');
    const activeGames = [];

    // Create 5 waiting games
    for (let i = 0; i < 5; i++) {
        const gameType = gameTypes[Math.floor(Math.random() * gameTypes.length)];
        const maxPlayers = Math.floor(Math.random() * 3) + 2; // 2-4 max players
        const currentPlayers = Math.floor(Math.random() * (maxPlayers - 1)) + 1; // 1 to maxPlayers-1
        const gameUsers = shuffleArray([...users]).slice(0, currentPlayers);

        const game = await db.queryOne(`
            INSERT INTO games (room_code, game_type, status, max_players, current_players, settings)
            VALUES ($1, $2, 'waiting', $3, $4, $5)
            RETURNING *
        `, [
            generateRoomCode(),
            gameType.type,
            maxPlayers,
            currentPlayers,
            JSON.stringify(gameType.settings)
        ]);

        // Add participants
        for (let j = 0; j < gameUsers.length; j++) {
            await db.query(`
                INSERT INTO game_participants (game_id, user_id, player_position, is_ready)
                VALUES ($1, $2, $3, $4)
            `, [game.id, gameUsers[j].id, j + 1, Math.random() > 0.3]); // 70% chance to be ready
        }

        activeGames.push(game);
    }

    // Create 3 active games
    for (let i = 0; i < 3; i++) {
        const gameType = gameTypes[Math.floor(Math.random() * gameTypes.length)];
        const numPlayers = Math.floor(Math.random() * 3) + 2;
        const gameUsers = shuffleArray([...users]).slice(0, numPlayers);

        const game = await db.queryOne(`
            INSERT INTO games (room_code, game_type, status, max_players, current_players, current_turn_player_id, started_at, settings, game_state, board_state)
            VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [
            generateRoomCode(),
            gameType.type,
            numPlayers,
            numPlayers,
            gameUsers[0].id, // First player's turn
            new Date(),
            JSON.stringify(gameType.settings),
            JSON.stringify({ turn: 1, phase: 'playing', timer_started: Date.now() }),
            JSON.stringify({ pieces: [], last_move: null })
        ]);

        // Add participants
        for (let j = 0; j < gameUsers.length; j++) {
            await db.query(`
                INSERT INTO game_participants (game_id, user_id, player_position, is_ready, is_active)
                VALUES ($1, $2, $3, true, true)
            `, [game.id, gameUsers[j].id, j + 1]);
        }

        activeGames.push(game);
    }

    return activeGames;
}

async function updateLeaderboards(db, seasonId) {
    console.log('🏆 Updating leaderboards...');
    
    // Refresh leaderboard using the function from migration
    await db.query('SELECT refresh_leaderboard($1, $2)', [seasonId, 'classic']);
    await db.query('SELECT refresh_leaderboard($1, $2)', [seasonId, 'blitz']);
    await db.query('SELECT refresh_leaderboard($1, $2)', [seasonId, 'tournament']);
}

async function displaySummary(db) {
    console.log('\n📊 Database Summary:');
    
    const stats = await db.getStats();
    
    console.log(`👥 Users: ${stats.database.total_users}`);
    console.log(`🎮 Active Games: ${stats.database.active_games}`);
    console.log(`⏳ Waiting Games: ${stats.database.waiting_games}`);
    console.log(`🏁 Total Matches: ${stats.database.total_matches}`);
    console.log(`🔌 Active Sessions: ${stats.database.active_sessions}`);
    
    // Show top players
    const topPlayers = await db.queryMany(`
        SELECT u.username, u.display_name, us.current_rating, us.total_wins, us.total_games_played
        FROM users u
        JOIN user_statistics us ON u.id = us.user_id
        WHERE u.email LIKE '%@example.com'
        ORDER BY us.current_rating DESC
        LIMIT 5
    `);
    
    console.log('\n🏆 Top Players:');
    topPlayers.forEach((player, index) => {
        console.log(`${index + 1}. ${player.display_name} (@${player.username}) - ${player.current_rating} rating (${player.total_wins}/${player.total_games_played})`);
    });
}

// Utility functions
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Handle errors
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught exception:', error.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run the seeding
main();