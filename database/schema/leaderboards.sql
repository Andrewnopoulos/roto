-- Leaderboard System Database Schema
-- This schema supports global, seasonal, and category-based leaderboards

-- Seasons table for managing competitive seasons
CREATE TABLE seasons (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Leaderboard categories (global, seasonal, weekly, monthly, etc.)
CREATE TABLE leaderboard_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    reset_frequency VARCHAR(20) CHECK (reset_frequency IN ('none', 'daily', 'weekly', 'monthly', 'seasonal')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Main leaderboard entries table
CREATE TABLE leaderboard_entries (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES leaderboard_categories(id) ON DELETE CASCADE,
    season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL,
    
    -- Core stats
    rating INTEGER DEFAULT 1000,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    total_games INTEGER DEFAULT 0,
    win_percentage DECIMAL(5,2) DEFAULT 0.00,
    
    -- Ranking data
    current_rank INTEGER,
    previous_rank INTEGER,
    highest_rank INTEGER,
    rank_change INTEGER DEFAULT 0,
    
    -- Timestamps
    last_game_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(player_id, category_id, season_id)
);

-- Position change history for tracking rank movements
CREATE TABLE position_changes (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES leaderboard_categories(id) ON DELETE CASCADE,
    season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL,
    
    old_rank INTEGER,
    new_rank INTEGER,
    rank_change INTEGER,
    change_reason VARCHAR(50), -- 'game_result', 'season_reset', 'manual', etc.
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Leaderboard snapshots for historical data and performance
CREATE TABLE leaderboard_snapshots (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES leaderboard_categories(id) ON DELETE CASCADE,
    season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL,
    snapshot_date DATE NOT NULL,
    snapshot_data JSONB NOT NULL,
    total_players INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Players table (assuming it doesn't exist yet)
CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    last_active_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Game results table for updating leaderboards
CREATE TABLE IF NOT EXISTS game_results (
    id SERIAL PRIMARY KEY,
    game_id VARCHAR(255) NOT NULL UNIQUE,
    player1_id INTEGER NOT NULL REFERENCES players(id),
    player2_id INTEGER NOT NULL REFERENCES players(id),
    winner_id INTEGER REFERENCES players(id),
    game_type VARCHAR(50) NOT NULL,
    result_type VARCHAR(20) CHECK (result_type IN ('win', 'loss', 'draw', 'forfeit')),
    duration_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for optimal query performance
CREATE INDEX idx_leaderboard_entries_category_season ON leaderboard_entries(category_id, season_id);
CREATE INDEX idx_leaderboard_entries_player ON leaderboard_entries(player_id);
CREATE INDEX idx_leaderboard_entries_rank ON leaderboard_entries(category_id, season_id, current_rank);
CREATE INDEX idx_leaderboard_entries_rating ON leaderboard_entries(category_id, season_id, rating DESC);
CREATE INDEX idx_leaderboard_entries_wins ON leaderboard_entries(category_id, season_id, wins DESC);
CREATE INDEX idx_leaderboard_entries_win_percentage ON leaderboard_entries(category_id, season_id, win_percentage DESC);
CREATE INDEX idx_leaderboard_entries_last_game ON leaderboard_entries(last_game_at);

CREATE INDEX idx_position_changes_player ON position_changes(player_id);
CREATE INDEX idx_position_changes_category ON position_changes(category_id, season_id);
CREATE INDEX idx_position_changes_created ON position_changes(created_at);

CREATE INDEX idx_snapshots_category_date ON leaderboard_snapshots(category_id, snapshot_date);

-- Triggers for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leaderboard_entries_updated_at 
    BEFORE UPDATE ON leaderboard_entries 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_seasons_updated_at 
    BEFORE UPDATE ON seasons 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_players_updated_at 
    BEFORE UPDATE ON players 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default leaderboard categories
INSERT INTO leaderboard_categories (name, description, reset_frequency) VALUES
('global_rating', 'Global rating leaderboard', 'none'),
('global_wins', 'Global wins leaderboard', 'none'),
('global_win_percentage', 'Global win percentage leaderboard', 'none'),
('weekly_rating', 'Weekly rating leaderboard', 'weekly'),
('monthly_rating', 'Monthly rating leaderboard', 'monthly'),
('seasonal_rating', 'Seasonal rating leaderboard', 'seasonal');