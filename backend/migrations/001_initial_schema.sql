-- Migration: 001_initial_schema.sql
-- Description: Initial database schema for Roto multiplayer game platform
-- Created: 2025-07-26

-- Create extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table - Core user authentication and profile data
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    avatar_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT users_username_length CHECK (LENGTH(username) >= 3),
    CONSTRAINT users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- User statistics table - Aggregate stats for performance
CREATE TABLE user_statistics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_games_played INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_losses INTEGER DEFAULT 0,
    total_draws INTEGER DEFAULT 0,
    current_rating INTEGER DEFAULT 1200,
    peak_rating INTEGER DEFAULT 1200,
    current_streak INTEGER DEFAULT 0,
    longest_win_streak INTEGER DEFAULT 0,
    longest_lose_streak INTEGER DEFAULT 0,
    total_playtime_seconds INTEGER DEFAULT 0,
    average_game_duration_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT user_stats_non_negative_games CHECK (total_games_played >= 0),
    CONSTRAINT user_stats_non_negative_wins CHECK (total_wins >= 0),
    CONSTRAINT user_stats_non_negative_losses CHECK (total_losses >= 0),
    CONSTRAINT user_stats_non_negative_draws CHECK (total_draws >= 0),
    CONSTRAINT user_stats_rating_range CHECK (current_rating >= 0 AND current_rating <= 3000),
    CONSTRAINT user_stats_peak_rating_range CHECK (peak_rating >= 0 AND peak_rating <= 3000),
    CONSTRAINT user_stats_games_consistency CHECK (total_games_played = total_wins + total_losses + total_draws)
);

-- Game rooms table - Active and historical game sessions
CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_code VARCHAR(10) UNIQUE NOT NULL,
    game_type VARCHAR(50) NOT NULL DEFAULT 'classic',
    status VARCHAR(20) NOT NULL DEFAULT 'waiting',
    max_players INTEGER NOT NULL DEFAULT 2,
    current_players INTEGER DEFAULT 0,
    game_state JSONB,
    board_state JSONB,
    current_turn_player_id UUID REFERENCES users(id),
    winner_id UUID REFERENCES users(id),
    is_private BOOLEAN DEFAULT false,
    password_hash VARCHAR(255),
    settings JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT games_status_valid CHECK (status IN ('waiting', 'active', 'completed', 'abandoned', 'cancelled')),
    CONSTRAINT games_max_players_valid CHECK (max_players >= 2 AND max_players <= 8),
    CONSTRAINT games_current_players_valid CHECK (current_players >= 0 AND current_players <= max_players),
    CONSTRAINT games_room_code_format CHECK (LENGTH(room_code) = 6 AND room_code ~ '^[A-Z0-9]+$'),
    CONSTRAINT games_ended_after_started CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);

-- Game participants table - Many-to-many relationship between users and games
CREATE TABLE game_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    player_position INTEGER NOT NULL,
    is_ready BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    final_score INTEGER DEFAULT 0,
    placement INTEGER,
    rating_before INTEGER,
    rating_after INTEGER,
    rating_change INTEGER DEFAULT 0,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    UNIQUE(game_id, user_id),
    UNIQUE(game_id, player_position),
    CONSTRAINT game_participants_position_valid CHECK (player_position >= 1 AND player_position <= 8),
    CONSTRAINT game_participants_placement_valid CHECK (placement IS NULL OR (placement >= 1 AND placement <= 8)),
    CONSTRAINT game_participants_score_non_negative CHECK (final_score >= 0),
    CONSTRAINT game_participants_rating_range CHECK (
        (rating_before IS NULL OR (rating_before >= 0 AND rating_before <= 3000)) AND
        (rating_after IS NULL OR (rating_after >= 0 AND rating_after <= 3000))
    )
);

-- Match history table - Completed games with results
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    game_type VARCHAR(50) NOT NULL,
    total_players INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL,
    winner_id UUID REFERENCES users(id),
    match_result VARCHAR(20) NOT NULL,
    replay_data JSONB,
    statistics JSONB DEFAULT '{}',
    season_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT matches_result_valid CHECK (match_result IN ('completed', 'draw', 'abandoned', 'timeout')),
    CONSTRAINT matches_duration_positive CHECK (duration_seconds > 0),
    CONSTRAINT matches_players_valid CHECK (total_players >= 2 AND total_players <= 8)
);

-- Seasons table - For leaderboard management and resets
CREATE TABLE seasons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT false,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT seasons_end_after_start CHECK (end_date > start_date),
    CONSTRAINT seasons_name_not_empty CHECK (LENGTH(name) > 0)
);

-- Leaderboards table - Rankings for different time periods and game types
CREATE TABLE leaderboards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    season_id UUID REFERENCES seasons(id) ON DELETE CASCADE,
    game_type VARCHAR(50) NOT NULL DEFAULT 'classic',
    leaderboard_type VARCHAR(20) NOT NULL DEFAULT 'rating',
    rank_position INTEGER NOT NULL,
    score INTEGER NOT NULL,
    games_played INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    win_rate DECIMAL(5,4) DEFAULT 0.0000,
    last_game_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(user_id, season_id, game_type, leaderboard_type),
    CONSTRAINT leaderboards_type_valid CHECK (leaderboard_type IN ('rating', 'wins', 'games_played')),
    CONSTRAINT leaderboards_rank_positive CHECK (rank_position > 0),
    CONSTRAINT leaderboards_score_non_negative CHECK (score >= 0),
    CONSTRAINT leaderboards_games_non_negative CHECK (games_played >= 0),
    CONSTRAINT leaderboards_wins_non_negative CHECK (wins >= 0),
    CONSTRAINT leaderboards_losses_non_negative CHECK (losses >= 0),
    CONSTRAINT leaderboards_draws_non_negative CHECK (draws >= 0),
    CONSTRAINT leaderboards_win_rate_valid CHECK (win_rate >= 0 AND win_rate <= 1),
    CONSTRAINT leaderboards_games_consistency CHECK (games_played = wins + losses + draws)
);

-- Game moves table - For replay functionality and game analysis
CREATE TABLE game_moves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    move_number INTEGER NOT NULL,
    move_data JSONB NOT NULL,
    board_state_after JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    duration_ms INTEGER,
    
    -- Constraints
    UNIQUE(game_id, move_number),
    CONSTRAINT game_moves_number_positive CHECK (move_number > 0),
    CONSTRAINT game_moves_duration_non_negative CHECK (duration_ms IS NULL OR duration_ms >= 0)
);

-- User sessions table - For authentication and active session management
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    refresh_token VARCHAR(255) UNIQUE,
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT user_sessions_expires_future CHECK (expires_at > CURRENT_TIMESTAMP)
);

-- Indexes for performance optimization
-- Users table indexes
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(is_active);
CREATE INDEX idx_users_created_at ON users(created_at);

-- User statistics indexes
CREATE INDEX idx_user_statistics_user_id ON user_statistics(user_id);
CREATE INDEX idx_user_statistics_rating ON user_statistics(current_rating DESC);
CREATE INDEX idx_user_statistics_wins ON user_statistics(total_wins DESC);

-- Games table indexes
CREATE INDEX idx_games_room_code ON games(room_code);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_games_created_at ON games(created_at);
CREATE INDEX idx_games_game_type ON games(game_type);
CREATE INDEX idx_games_current_turn ON games(current_turn_player_id);
CREATE INDEX idx_games_active ON games(status) WHERE status IN ('waiting', 'active');

-- Game participants indexes
CREATE INDEX idx_game_participants_game_id ON game_participants(game_id);
CREATE INDEX idx_game_participants_user_id ON game_participants(user_id);
CREATE INDEX idx_game_participants_user_games ON game_participants(user_id, game_id);

-- Matches table indexes
CREATE INDEX idx_matches_game_id ON matches(game_id);
CREATE INDEX idx_matches_winner_id ON matches(winner_id);
CREATE INDEX idx_matches_created_at ON matches(created_at);
CREATE INDEX idx_matches_season_id ON matches(season_id);
CREATE INDEX idx_matches_game_type ON matches(game_type);

-- Seasons table indexes
CREATE INDEX idx_seasons_active ON seasons(is_active);
CREATE INDEX idx_seasons_dates ON seasons(start_date, end_date);

-- Leaderboards table indexes
CREATE INDEX idx_leaderboards_user_id ON leaderboards(user_id);
CREATE INDEX idx_leaderboards_season_id ON leaderboards(season_id);
CREATE INDEX idx_leaderboards_type_rank ON leaderboards(leaderboard_type, rank_position);
CREATE INDEX idx_leaderboards_game_type ON leaderboards(game_type);
CREATE INDEX idx_leaderboards_score ON leaderboards(score DESC);

-- Game moves indexes
CREATE INDEX idx_game_moves_game_id ON game_moves(game_id);
CREATE INDEX idx_game_moves_user_id ON game_moves(user_id);
CREATE INDEX idx_game_moves_game_move ON game_moves(game_id, move_number);

-- User sessions indexes
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_active ON user_sessions(is_active);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);

-- Triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_statistics_updated_at BEFORE UPDATE ON user_statistics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leaderboards_updated_at BEFORE UPDATE ON leaderboards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();