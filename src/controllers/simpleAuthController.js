/**
 * Simplified Authentication Controller
 * 
 * A streamlined auth system that works with the existing database schema.
 * Provides basic registration, login, and JWT token management.
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { createError } = require('../middleware/errorHandler');

// JWT configuration with fallbacks
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Generate JWT token for authenticated user
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
function generateToken(user) {
  const payload = {
    userId: user.id,
    email: user.email,
    username: user.username,
    role: user.role || 'user'
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Get database connection from services
 */
function getDB() {
  try {
    const db = require('../config/database');
    return db;
  } catch (error) {
    // Fallback - try to use matchmaking service's database connection
    const MatchmakingService = require('../services/matchmakingService');
    return require('../config/database');
  }
}

/**
 * Register a new user account
 */
async function register(req, res) {
  const { email, username, password } = req.body;
  
  if (!email || !username || !password) {
    throw createError('Email, username, and password are required', 400);
  }
  
  if (password.length < 6) {
    throw createError('Password must be at least 6 characters long', 400);
  }
  
  logger.info('User registration attempt', { email, username, ip: req.ip });
  
  try {
    const db = getDB();
    
    // Check if user already exists
    const existingUser = await db.query(
      'SELECT id, email, username FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    
    if (existingUser.rows.length > 0) {
      const existing = existingUser.rows[0];
      if (existing.email === email) {
        throw createError('Email already registered', 409);
      }
      if (existing.username === username) {
        throw createError('Username already taken', 409);
      }
    }
    
    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Create user with default values
    const userId = uuidv4();
    const userResult = await db.query(`
      INSERT INTO users (
        id, email, username, password_hash, display_name,
        is_active, is_verified, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, true, true, NOW(), NOW()
      ) RETURNING id, email, username, display_name, is_active, is_verified, created_at
    `, [userId, email, username, passwordHash, username]);
    
    const user = userResult.rows[0];
    
    // Create user statistics record
    await db.query(`
      INSERT INTO user_statistics (
        user_id, current_rating, peak_rating, created_at, updated_at
      ) VALUES ($1, 1200, 1200, NOW(), NOW())
    `, [user.id]);
    
    logger.info('User registered successfully', {
      userId: user.id,
      email: user.email,
      username: user.username
    });
    
    // Generate token
    const token = generateToken({...user, role: 'user'});
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        isVerified: user.is_verified,
        role: 'user',
        createdAt: user.created_at
      },
      token
    });
    
  } catch (error) {
    logger.error('Registration failed', {
      email,
      username,
      error: error.message,
      ip: req.ip
    });
    throw error;
  }
}

/**
 * Authenticate user login
 */
async function login(req, res) {
  const { email, password } = req.body;
  
  if (!email || !password) {
    throw createError('Email and password are required', 400);
  }
  
  logger.info('User login attempt', { email, ip: req.ip });
  
  try {
    const db = getDB();
    
    // Get user from database
    const userResult = await db.query(`
      SELECT id, email, username, password_hash, display_name, 
             is_active, is_verified, last_login_at
      FROM users 
      WHERE email = $1 AND is_active = true
    `, [email]);
    
    if (userResult.rows.length === 0) {
      logger.warn('Login attempt with non-existent email', { email, ip: req.ip });
      throw createError('Invalid email or password', 401);
    }
    
    const user = userResult.rows[0];
    
    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      logger.warn('Invalid password attempt', { 
        userId: user.id, 
        email: user.email, 
        ip: req.ip 
      });
      throw createError('Invalid email or password', 401);
    }
    
    // Update last login
    await db.query(`
      UPDATE users 
      SET last_login_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [user.id]);
    
    // Generate token
    const token = generateToken({...user, role: 'user'});
    
    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
      ip: req.ip
    });
    
    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        isVerified: user.is_verified,
        role: 'user',
        lastLoginAt: user.last_login_at
      },
      token
    });
    
  } catch (error) {
    logger.error('Login failed', {
      email,
      error: error.message,
      ip: req.ip
    });
    throw error;
  }
}

/**
 * Get current user profile
 */
async function getProfile(req, res) {
  const userId = req.user.id;
  
  try {
    const db = getDB();
    
    const userResult = await db.query(`
      SELECT u.id, u.email, u.username, u.display_name, u.is_active, 
             u.is_verified, u.last_login_at, u.created_at,
             us.current_rating, us.total_games_played, us.total_wins, 
             us.total_losses, us.total_draws, us.peak_rating
      FROM users u
      LEFT JOIN user_statistics us ON u.id = us.user_id
      WHERE u.id = $1
    `, [userId]);
    
    if (userResult.rows.length === 0) {
      throw createError('User not found', 404);
    }
    
    const user = userResult.rows[0];
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        isVerified: user.is_verified,
        role: 'user',
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
        statistics: {
          currentRating: user.current_rating || 1200,
          totalGames: user.total_games_played || 0,
          wins: user.total_wins || 0,
          losses: user.total_losses || 0,
          draws: user.total_draws || 0,
          peakRating: user.peak_rating || 1200
        }
      }
    });
    
  } catch (error) {
    logger.error('Failed to get user profile', {
      userId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Logout user (placeholder - JWT is stateless)
 */
async function logout(req, res) {
  const userId = req.user.id;
  
  logger.info('User logged out', { userId });
  
  res.json({
    success: true,
    message: 'Logout successful'
  });
}

module.exports = {
  register,
  login,
  logout,
  getProfile
};