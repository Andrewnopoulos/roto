/**
 * In-Memory Authentication Controller
 * 
 * A simple auth system that works without a database for testing purposes.
 * Uses in-memory storage for user data.
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// In-memory user storage (for testing only)
const users = new Map();
const userStats = new Map();

// JWT configuration with fallbacks
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Generate JWT token for authenticated user
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
 * Register a new user account
 */
async function register(req, res) {
  const { email, username, password } = req.body;
  
  if (!email || !username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email, username, and password are required'
    });
  }
  
  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters long'
    });
  }
  
  try {
    // Check if user already exists
    for (const user of users.values()) {
      if (user.email === email) {
        return res.status(409).json({
          success: false,
          message: 'Email already registered'
        });
      }
      if (user.username === username) {
        return res.status(409).json({
          success: false,
          message: 'Username already taken'
        });
      }
    }
    
    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Create user
    const userId = uuidv4();
    const user = {
      id: userId,
      email,
      username,
      password_hash: passwordHash,
      display_name: username,
      is_active: true,
      is_verified: true,
      created_at: new Date(),
      last_login_at: null,
      role: 'user'
    };
    
    // Store user
    users.set(userId, user);
    
    // Create user statistics
    userStats.set(userId, {
      user_id: userId,
      current_rating: 1200,
      peak_rating: 1200,
      total_games_played: 0,
      total_wins: 0,
      total_losses: 0,
      total_draws: 0
    });
    
    console.log(`✅ User registered: ${username} (${email})`);
    
    // Generate token
    const token = generateToken(user);
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        isVerified: user.is_verified,
        role: user.role,
        createdAt: user.created_at
      },
      token
    });
    
  } catch (error) {
    console.error('Registration failed:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.'
    });
  }
}

/**
 * Authenticate user login
 */
async function login(req, res) {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required'
    });
  }
  
  try {
    // Find user by email
    let user = null;
    for (const u of users.values()) {
      if (u.email === email && u.is_active) {
        user = u;
        break;
      }
    }
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Update last login
    user.last_login_at = new Date();
    
    // Generate token
    const token = generateToken(user);
    
    console.log(`✅ User logged in: ${user.username} (${user.email})`);
    
    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        isVerified: user.is_verified,
        role: user.role,
        lastLoginAt: user.last_login_at
      },
      token
    });
    
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
}

/**
 * Get current user profile
 */
async function getProfile(req, res) {
  const userId = req.user.id;
  
  try {
    const user = users.get(userId);
    const stats = userStats.get(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        isVerified: user.is_verified,
        role: user.role,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
        statistics: {
          currentRating: stats?.current_rating || 1200,
          totalGames: stats?.total_games_played || 0,
          wins: stats?.total_wins || 0,
          losses: stats?.total_losses || 0,
          draws: stats?.total_draws || 0,
          peakRating: stats?.peak_rating || 1200
        }
      }
    });
    
  } catch (error) {
    console.error('Failed to get user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile'
    });
  }
}

/**
 * Logout user (placeholder - JWT is stateless)
 */
async function logout(req, res) {
  console.log(`📝 User logged out: ${req.user.username}`);
  
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