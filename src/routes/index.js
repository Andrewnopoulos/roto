/**
 * Main Routes Index
 * 
 * This file serves as the central routing hub for the Rota game platform.
 * It organizes and mounts all API routes in a logical structure, providing
 * clear separation of concerns and easy maintainability.
 * 
 * Route organization:
 * - /auth - Authentication and authorization
 * - /users - User management and profiles
 * - /games - Game management and operations
 * - /matches - Match creation and management
 * - /leaderboard - Rankings and statistics
 * - /admin - Administrative functions
 */

const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth');
const userRoutes = require('./users');
const gameRoutes = require('./games');
const matchRoutes = require('./matches');
const matchmakingRoutes = require('./matchmaking');
const leaderboardRoutes = require('./leaderboard');
const adminRoutes = require('./admin');

// Import middleware
const { rateLimiter } = require('../middleware/security');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * API status endpoint
 * Provides basic API information and health status
 */
router.get('/', asyncHandler(async (req, res) => {
  const uptime = process.uptime();
  const timestamp = new Date().toISOString();
  
  logger.info('API status requested', { ip: req.ip });
  
  res.json({
    message: 'Roto Game Platform API',
    version: '1.0.0',
    status: 'operational',
    timestamp,
    uptime: {
      seconds: Math.floor(uptime),
      human: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`
    },
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      games: '/api/games',
      matches: '/api/matches',
      matchmaking: '/api/matchmaking',
      leaderboard: '/api/leaderboard',
      admin: '/api/admin'
    }
  });
}));

/**
 * Mount route modules with appropriate middleware
 * Each route group has its own rate limiting and security configurations
 */

// Authentication routes - stricter rate limiting
router.use('/auth', authRoutes);

// User management routes
router.use('/users', rateLimiter, userRoutes);

// Game-related routes
router.use('/games', rateLimiter, gameRoutes);

// Match management routes
router.use('/matches', rateLimiter, matchRoutes);

// Matchmaking routes
router.use('/matchmaking', rateLimiter, matchmakingRoutes);

// Leaderboard routes - can handle more requests for public data
router.use('/leaderboard', rateLimiter, leaderboardRoutes);

// Admin routes - will have additional authentication requirements
router.use('/admin', rateLimiter, adminRoutes);

/**
 * API documentation endpoint (development only)
 * In production, this would typically be served by a documentation service
 */
if (process.env.NODE_ENV === 'development') {
  router.get('/docs', (req, res) => {
    res.json({
      message: 'API Documentation',
      note: 'In development, comprehensive API documentation would be available here',
      routes: {
        'GET /': 'API status and information',
        'POST /auth/register': 'Register a new user account',
        'POST /auth/login': 'Authenticate user and receive token',
        'POST /auth/logout': 'Invalidate user session',
        'GET /users/profile': 'Get current user profile',
        'PUT /users/profile': 'Update user profile',
        'GET /games/active': 'Get list of active games',
        'POST /games/create': 'Create a new game room',
        'GET /matches/history': 'Get user match history',
        'GET /leaderboard/global': 'Get global leaderboard',
        'GET /admin/stats': 'Get platform statistics (admin only)'
      }
    });
  });
}

module.exports = router;