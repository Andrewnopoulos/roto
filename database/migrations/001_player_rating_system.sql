-- Player Rating and Statistics System Database Schema
-- Migration: 001_player_rating_system

-- Update users table to include rating and basic stats
ALTER TABLE users ADD COLUMN IF NOT EXISTS elo_rating INTEGER DEFAULT 1200;
ALTER TABLE users ADD COLUMN IF NOT EXISTS games_played INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS games_won INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS games_lost INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS games_drawn INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS longest_win_streak INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_playtime_seconds INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS average_moves_per_game DECIMAL(8,2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_game_played TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ranking_percentile DECIMAL(5,2) DEFAULT 0;

-- Rating history table for tracking ELO changes over time
CREATE TABLE IF NOT EXISTS rating_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    old_rating INTEGER NOT NULL,
    new_rating INTEGER NOT NULL,
    rating_change INTEGER NOT NULL,
    game_id INTEGER,
    reason VARCHAR(50) NOT NULL, -- 'win', 'loss', 'draw', 'adjustment'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id_created (user_id, created_at),
    INDEX idx_game_id (game_id)
);

-- Game statistics table for detailed game metrics
CREATE TABLE IF NOT EXISTS game_statistics (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL UNIQUE,
    player1_id INTEGER NOT NULL REFERENCES users(id),
    player2_id INTEGER NOT NULL REFERENCES users(id),
    winner_id INTEGER REFERENCES users(id), -- NULL for draws
    game_duration_seconds INTEGER NOT NULL,
    total_moves INTEGER NOT NULL,
    player1_moves INTEGER NOT NULL,
    player2_moves INTEGER NOT NULL,
    player1_avg_move_time DECIMAL(8,2),
    player2_avg_move_time DECIMAL(8,2),
    player1_rating_before INTEGER NOT NULL,
    player2_rating_before INTEGER NOT NULL,
    player1_rating_after INTEGER NOT NULL,
    player2_rating_after INTEGER NOT NULL,
    game_type VARCHAR(50) DEFAULT 'standard',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_player1_id (player1_id),
    INDEX idx_player2_id (player2_id),
    INDEX idx_winner_id (winner_id),
    INDEX idx_created_at (created_at)
);

-- Achievements table
CREATE TABLE IF NOT EXISTS achievements (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'wins', 'streaks', 'games', 'rating', 'special'
    condition_type VARCHAR(50) NOT NULL, -- 'total_wins', 'win_streak', 'rating_reached', etc.
    condition_value INTEGER NOT NULL,
    icon_url VARCHAR(255),
    points INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Player achievements junction table
CREATE TABLE IF NOT EXISTS player_achievements (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id INTEGER NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    progress INTEGER DEFAULT 0, -- For tracking progress towards achievement
    UNIQUE KEY unique_user_achievement (user_id, achievement_id),
    INDEX idx_user_id (user_id),
    INDEX idx_achievement_id (achievement_id)
);

-- Player preferences and settings
CREATE TABLE IF NOT EXISTS player_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    preferred_game_type VARCHAR(50) DEFAULT 'standard',
    auto_accept_challenges BOOLEAN DEFAULT FALSE,
    show_rating BOOLEAN DEFAULT TRUE,
    show_statistics BOOLEAN DEFAULT TRUE,
    notification_preferences JSON,
    theme_preference VARCHAR(50) DEFAULT 'default',
    board_style VARCHAR(50) DEFAULT 'classic',
    move_confirmation BOOLEAN DEFAULT TRUE,
    show_move_hints BOOLEAN DEFAULT FALSE,
    privacy_level VARCHAR(20) DEFAULT 'public', -- 'public', 'friends', 'private'
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Daily/Monthly statistics aggregation for performance
CREATE TABLE IF NOT EXISTS statistics_snapshots (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    snapshot_type ENUM('daily', 'weekly', 'monthly') NOT NULL,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    games_lost INTEGER DEFAULT 0,
    games_drawn INTEGER DEFAULT 0,
    rating_start INTEGER,
    rating_end INTEGER,
    rating_peak INTEGER,
    total_playtime_seconds INTEGER DEFAULT 0,
    average_game_duration DECIMAL(8,2),
    win_rate DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_snapshot (user_id, snapshot_date, snapshot_type),
    INDEX idx_user_date (user_id, snapshot_date),
    INDEX idx_snapshot_type (snapshot_type)
);

-- Insert default achievements
INSERT IGNORE INTO achievements (name, description, category, condition_type, condition_value, points) VALUES
('First Victory', 'Win your first game', 'wins', 'total_wins', 1, 10),
('Veteran Player', 'Win 10 games', 'wins', 'total_wins', 10, 25),
('Champion', 'Win 50 games', 'wins', 'total_wins', 50, 100),
('Master', 'Win 100 games', 'wins', 'total_wins', 100, 250),
('Grandmaster', 'Win 500 games', 'wins', 'total_wins', 500, 1000),
('Hot Streak', 'Win 3 games in a row', 'streaks', 'win_streak', 3, 20),
('Unstoppable', 'Win 5 games in a row', 'streaks', 'win_streak', 5, 50),
('Legendary Streak', 'Win 10 games in a row', 'streaks', 'win_streak', 10, 150),
('Dedicated Player', 'Play 100 games', 'games', 'games_played', 100, 75),
('Game Enthusiast', 'Play 500 games', 'games', 'games_played', 500, 200),
('Rising Star', 'Reach 1400 rating', 'rating', 'rating_reached', 1400, 50),
('Skilled Player', 'Reach 1600 rating', 'rating', 'rating_reached', 1600, 100),
('Expert', 'Reach 1800 rating', 'rating', 'rating_reached', 1800, 200),
('Elite', 'Reach 2000 rating', 'rating', 'rating_reached', 2000, 500);