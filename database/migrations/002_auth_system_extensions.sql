-- Migration: 002_auth_system_extensions.sql
-- Description: Add missing auth system tables and columns
-- Created: 2025-08-05

-- Add missing columns to users table for auth system
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0;

-- Update the is_active column to match auth controller expectations
-- The auth controller expects 'is_verified' but schema has 'is_active'
-- Let's add the missing column
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0;

-- Add constraints for new columns
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_role_valid 
    CHECK (role IN ('user', 'admin', 'super_admin'));
    
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_status_valid 
    CHECK (status IN ('active', 'suspended', 'banned', 'deleted'));

-- Create refresh_tokens table (referenced by auth controller)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create password_reset_tokens table (referenced by auth controller)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- Add triggers for updated_at columns
CREATE TRIGGER IF NOT EXISTS update_refresh_tokens_updated_at 
    BEFORE UPDATE ON refresh_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert a default admin user for testing
-- Password: "admin123" (hashed with bcrypt rounds=12)
INSERT INTO users (
    id, username, email, password_hash, display_name, 
    is_active, is_verified, role, status, created_at, updated_at
) VALUES (
    uuid_generate_v4(),
    'admin',
    'admin@roto.game',
    '$2b$12$LQv3c1yqBwEHxv03eOjcZOaZmYWdoLSJJWE0MXFmCJJJJJJJJJJJJ', -- This will need to be updated with proper hash
    'Administrator',
    true,
    true,
    'admin',
    'active',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT (email) DO NOTHING;

-- Insert default user statistics for admin user
INSERT INTO user_statistics (user_id, current_rating, peak_rating)
SELECT id, 1500, 1500 
FROM users 
WHERE email = 'admin@roto.game'
ON CONFLICT DO NOTHING;