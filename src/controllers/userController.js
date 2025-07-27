/**
 * User Controller
 * 
 * Handles user profile management, preferences, and user-related operations.
 * All operations are performed on behalf of the authenticated user to ensure
 * proper access control and data privacy.
 */

const { createError } = require('../middleware/errorHandler');
const { query, transaction } = require('../config/database');
const logger = require('../utils/logger');
const StatisticsService = require('../services/statisticsService');
const RatingService = require('../services/ratingService');

/**
 * Get current user's profile information
 */
async function getProfile(req, res) {
  const userId = req.user.id;
  
  const userResult = await query(`
    SELECT 
      id, email, username, first_name, last_name, avatar_url,
      is_verified, role, status, created_at, last_login_at,
      total_games, games_won, games_lost, current_rating,
      timezone, language, is_online
    FROM users 
    WHERE id = $1
  `, [userId]);
  
  if (userResult.rows.length === 0) {
    throw createError('User not found', 404);
  }
  
  const user = userResult.rows[0];
  
  logger.info('User profile retrieved', { userId });
  
  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      avatarUrl: user.avatar_url,
      isVerified: user.is_verified,
      role: user.role,
      status: user.status,
      createdAt: user.created_at,
      lastLoginAt: user.last_login_at,
      stats: {
        totalGames: user.total_games || 0,
        gamesWon: user.games_won || 0,
        gamesLost: user.games_lost || 0,
        currentRating: user.current_rating || 1000,
        winRate: user.total_games ? ((user.games_won || 0) / user.total_games * 100).toFixed(1) : '0.0'
      },
      preferences: {
        timezone: user.timezone,
        language: user.language,
        isOnline: user.is_online
      }
    }
  });
}

/**
 * Update current user's profile information
 */
async function updateProfile(req, res) {
  const userId = req.user.id;
  const { username, email, firstName, lastName, avatarUrl, timezone, language } = req.body;
  
  logger.info('User profile update requested', { userId, fields: Object.keys(req.body) });
  
  await transaction(async (client) => {
    // Check if username or email is taken (if provided)
    if (username || email) {
      const conflicts = await client.query(`
        SELECT username, email 
        FROM users 
        WHERE (username = $1 OR email = $2) AND id != $3
      `, [username || '', email || '', userId]);
      
      if (conflicts.rows.length > 0) {
        const conflict = conflicts.rows[0];
        if (conflict.username === username) {
          throw createError('Username already taken', 409);
        }
        if (conflict.email === email) {
          throw createError('Email already registered', 409);
        }
      }
    }
    
    // Build dynamic update query
    const updateFields = [];
    const values = [];
    let paramCount = 1;
    
    if (username) {
      updateFields.push(`username = $${paramCount++}`);
      values.push(username);
    }
    
    if (email) {
      updateFields.push(`email = $${paramCount++}`);
      values.push(email);
      // Note: In a real app, you'd need to re-verify email
    }
    
    if (firstName !== undefined) {
      updateFields.push(`first_name = $${paramCount++}`);
      values.push(firstName);
    }
    
    if (lastName !== undefined) {
      updateFields.push(`last_name = $${paramCount++}`);
      values.push(lastName);
    }
    
    if (avatarUrl !== undefined) {
      updateFields.push(`avatar_url = $${paramCount++}`);
      values.push(avatarUrl);
    }
    
    if (timezone) {
      updateFields.push(`timezone = $${paramCount++}`);
      values.push(timezone);
    }
    
    if (language) {
      updateFields.push(`language = $${paramCount++}`);
      values.push(language);
    }
    
    if (updateFields.length === 0) {
      throw createError('No valid fields provided for update', 400);
    }
    
    updateFields.push(`updated_at = NOW()`);
    values.push(userId);
    
    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, email, username, first_name, last_name, avatar_url, 
                timezone, language, updated_at
    `;
    
    const result = await client.query(updateQuery, values);
    const updatedUser = result.rows[0];
    
    logger.info('User profile updated successfully', { userId });
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        avatarUrl: updatedUser.avatar_url,
        timezone: updatedUser.timezone,
        language: updatedUser.language,
        updatedAt: updatedUser.updated_at
      }
    });
  });
}

/**
 * Get current user's comprehensive statistics
 */
async function getStats(req, res) {
  const userId = req.user.id;
  
  try {
    // Get comprehensive statistics from StatisticsService
    const stats = await StatisticsService.getPlayerStatistics(userId);
    
    if (!stats) {
      throw createError('User statistics not found', 404);
    }

    // Get rating information
    const ratingInfo = await RatingService.getPlayerRank(userId);
    const ratingTier = RatingService.getRatingTier(stats.rating);

    // Get achievements
    const achievements = await StatisticsService.getPlayerAchievements(userId);

    // Get recent performance
    const recentPerformance = await StatisticsService.getRecentPerformance(userId, 10);

    // Get performance trends
    const performanceTrends = await StatisticsService.getPerformanceTrends(userId, 30);

    logger.info('User comprehensive stats retrieved', { userId });
    
    res.json({
      success: true,
      stats: {
        // Basic stats
        gamesPlayed: stats.games_played,
        wins: stats.wins,
        losses: stats.losses,
        winPercentage: stats.win_percentage,
        
        // Rating information
        rating: stats.rating,
        peakRating: stats.peak_rating,
        ratingTier: ratingTier,
        globalRank: ratingInfo?.rank || null,
        totalRankedPlayers: ratingInfo?.total_players || null,
        
        // Streaks
        currentWinStreak: stats.current_win_streak,
        currentLossStreak: stats.current_loss_streak,
        bestWinStreak: stats.best_win_streak,
        
        // Time stats
        totalGameTime: stats.total_game_time,
        averageGameDuration: stats.average_game_duration_minutes,
        fastestWin: stats.fastest_win,
        
        // Performance metrics
        averageMovesPerGame: stats.average_moves_per_game,
        
        // Account info
        accountCreated: stats.account_created,
        lastGameAt: stats.last_game_at
      },
      achievements: achievements,
      recentPerformance: recentPerformance,
      performanceTrends: performanceTrends
    });
    
  } catch (error) {
    logger.error('Failed to retrieve user stats', { userId, error: error.message });
    throw error;
  }
}

/**
 * Get current user's match history
 */
async function getMatchHistory(req, res) {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const status = req.query.status; // 'completed', 'abandoned', etc.
  const offset = (page - 1) * limit;
  
  let whereClause = 'WHERE (m.player1_id = $1 OR m.player2_id = $1)';
  const queryParams = [userId];
  let paramCount = 2;
  
  if (status) {
    whereClause += ` AND m.status = $${paramCount++}`;
    queryParams.push(status);
  }
  
  // Get total count
  const countResult = await query(`
    SELECT COUNT(*) as total
    FROM matches m
    ${whereClause}
  `, queryParams);
  
  const total = parseInt(countResult.rows[0].total);
  const totalPages = Math.ceil(total / limit);
  
  // Get matches with pagination
  queryParams.push(limit, offset);
  const matchesResult = await query(`
    SELECT 
      m.id, m.status, m.result, m.started_at, m.ended_at,
      m.duration_minutes, m.game_mode,
      p1.username as player1_username, p1.avatar_url as player1_avatar,
      p2.username as player2_username, p2.avatar_url as player2_avatar,
      CASE 
        WHEN m.player1_id = $1 THEN 'player1'
        WHEN m.player2_id = $1 THEN 'player2'
      END as user_role,
      CASE 
        WHEN m.result = 'player1_win' AND m.player1_id = $1 THEN 'win'
        WHEN m.result = 'player2_win' AND m.player2_id = $1 THEN 'win'
        WHEN m.result = 'draw' THEN 'draw'
        WHEN m.result IN ('player1_win', 'player2_win') THEN 'loss'
        ELSE 'unknown'
      END as user_result
    FROM matches m
    JOIN users p1 ON m.player1_id = p1.id
    JOIN users p2 ON m.player2_id = p2.id
    ${whereClause}
    ORDER BY m.started_at DESC
    LIMIT $${paramCount++} OFFSET $${paramCount++}
  `, queryParams);
  
  logger.info('User match history retrieved', { 
    userId, 
    page, 
    limit, 
    total 
  });
  
  res.json({
    success: true,
    matches: matchesResult.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    }
  });
}

/**
 * Change user's password
 */
async function changePassword(req, res) {
  const userId = req.user.id;
  const { currentPassword, newPassword } = req.body;
  
  logger.info('Password change requested', { userId });
  
  await transaction(async (client) => {
    // Verify current password
    const userResult = await client.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      throw createError('User not found', 404);
    }
    
    const isCurrentPasswordValid = await require('bcrypt').compare(
      currentPassword, 
      userResult.rows[0].password_hash
    );
    
    if (!isCurrentPasswordValid) {
      throw createError('Current password is incorrect', 400);
    }
    
    // Hash new password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const newPasswordHash = await require('bcrypt').hash(newPassword, saltRounds);
    
    // Update password
    await client.query(`
      UPDATE users 
      SET password_hash = $1, updated_at = NOW()
      WHERE id = $2
    `, [newPasswordHash, userId]);
    
    // Invalidate all refresh tokens to force re-login
    await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
    
    logger.info('Password changed successfully', { userId });
  });
  
  res.json({
    success: true,
    message: 'Password changed successfully. Please log in again.'
  });
}

/**
 * Get user's preferences
 */
async function getPreferences(req, res) {
  const userId = req.user.id;
  
  const prefsResult = await query(`
    SELECT preferences FROM user_preferences WHERE user_id = $1
  `, [userId]);
  
  const preferences = prefsResult.rows[0]?.preferences || {
    theme: 'light',
    notifications: {
      email: true,
      push: true,
      gameInvites: true,
      friendRequests: true,
      matchResults: true
    },
    gameSettings: {
      soundEnabled: true,
      musicEnabled: true,
      animationSpeed: 'normal',
      autoSave: true
    },
    privacy: {
      showOnlineStatus: true,
      allowFriendRequests: true,
      showMatchHistory: true
    }
  };
  
  logger.info('User preferences retrieved', { userId });
  
  res.json({
    success: true,
    preferences
  });
}

/**
 * Update user's preferences
 */
async function updatePreferences(req, res) {
  const userId = req.user.id;
  const newPreferences = req.body;
  
  logger.info('User preferences update requested', { userId });
  
  await query(`
    INSERT INTO user_preferences (user_id, preferences, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET preferences = $2, updated_at = NOW()
  `, [userId, JSON.stringify(newPreferences)]);
  
  logger.info('User preferences updated successfully', { userId });
  
  res.json({
    success: true,
    message: 'Preferences updated successfully',
    preferences: newPreferences
  });
}

/**
 * Delete user account (soft delete)
 */
async function deleteAccount(req, res) {
  const userId = req.user.id;
  const { password, confirmation } = req.body;
  
  if (confirmation !== 'DELETE_MY_ACCOUNT') {
    throw createError('Invalid confirmation', 400);
  }
  
  logger.info('Account deletion requested', { userId });
  
  await transaction(async (client) => {
    // Verify password
    const userResult = await client.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );
    
    const isPasswordValid = await require('bcrypt').compare(
      password, 
      userResult.rows[0].password_hash
    );
    
    if (!isPasswordValid) {
      throw createError('Invalid password', 400);
    }
    
    // Soft delete user account
    await client.query(`
      UPDATE users 
      SET status = 'deleted', 
          email = CONCAT('deleted_', id, '@deleted.local'),
          updated_at = NOW(),
          deleted_at = NOW()
      WHERE id = $1
    `, [userId]);
    
    // Invalidate all tokens
    await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
    
    logger.info('Account deleted successfully', { userId });
  });
  
  res.json({
    success: true,
    message: 'Account deleted successfully'
  });
}

/**
 * Get user's rating history
 */
async function getRatingHistory(req, res) {
  const userId = req.user.id;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  
  try {
    const ratingHistory = await RatingService.getPlayerRatingHistory(userId, limit);
    
    logger.info('User rating history retrieved', { userId, limit });
    
    res.json({
      success: true,
      ratingHistory: ratingHistory
    });
    
  } catch (error) {
    logger.error('Failed to retrieve rating history', { userId, error: error.message });
    throw error;
  }
}

/**
 * Get detailed player profile with all statistics
 */
async function getDetailedProfile(req, res) {
  const userId = req.user.id;
  
  try {
    // Get basic profile
    const profile = await this.getProfile(req, res);
    
    // Get comprehensive stats
    const stats = await StatisticsService.getPlayerStatistics(userId);
    const achievements = await StatisticsService.getPlayerAchievements(userId);
    const ratingInfo = await RatingService.getPlayerRank(userId);
    const ratingTier = RatingService.getRatingTier(stats?.rating || 1200);
    
    logger.info('Detailed user profile retrieved', { userId });
    
    res.json({
      success: true,
      profile: {
        ...profile.user,
        detailedStats: stats,
        achievements: achievements,
        ratingInfo: {
          ...ratingInfo,
          tier: ratingTier
        }
      }
    });
    
  } catch (error) {
    logger.error('Failed to retrieve detailed profile', { userId, error: error.message });
    throw error;
  }
}

/**
 * Get global leaderboard context for user
 */
async function getLeaderboardContext(req, res) {
  const userId = req.user.id;
  
  try {
    const globalStats = await StatisticsService.getGlobalStats();
    const ratingDistribution = await RatingService.getRatingDistribution();
    const userRank = await RatingService.getPlayerRank(userId);
    
    logger.info('Leaderboard context retrieved', { userId });
    
    res.json({
      success: true,
      context: {
        globalStats: globalStats,
        ratingDistribution: ratingDistribution,
        userRank: userRank
      }
    });
    
  } catch (error) {
    logger.error('Failed to retrieve leaderboard context', { userId, error: error.message });
    throw error;
  }
}

// Placeholder functions for friend system (to be implemented)
async function getFriends(req, res) {
  res.json({ success: true, friends: [], message: 'Friend system not yet implemented' });
}

async function sendFriendRequest(req, res) {
  res.json({ success: true, message: 'Friend system not yet implemented' });
}

async function acceptFriendRequest(req, res) {
  res.json({ success: true, message: 'Friend system not yet implemented' });
}

async function removeFriend(req, res) {
  res.json({ success: true, message: 'Friend system not yet implemented' });
}

module.exports = {
  getProfile,
  updateProfile,
  getStats,
  getMatchHistory,
  changePassword,
  getPreferences,
  updatePreferences,
  deleteAccount,
  getRatingHistory,
  getDetailedProfile,
  getLeaderboardContext,
  getFriends,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend
};