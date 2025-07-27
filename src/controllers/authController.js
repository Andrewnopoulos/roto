/**
 * Authentication Controller
 * 
 * Handles all authentication-related operations including user registration,
 * login, logout, password reset, and email verification. Implements secure
 * authentication patterns with proper error handling and logging.
 * 
 * Security features:
 * - Password hashing with bcrypt
 * - JWT token generation and validation
 * - Rate limiting integration
 * - Secure session management
 * - Email verification workflow
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { createError } = require('../middleware/errorHandler');
const { query, transaction } = require('../config/database');

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * Generate JWT tokens for authenticated user
 * @param {Object} user - User object
 * @returns {Object} Access and refresh tokens
 */
function generateTokens(user) {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role
  };
  
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
  
  return { accessToken, refreshToken };
}

/**
 * Register a new user account
 */
async function register(req, res) {
  const { email, username, password } = req.body;
  
  logger.info('User registration attempt', { email, username, ip: req.ip });
  
  await transaction(async (client) => {
    // Check if user already exists
    const existingUser = await client.query(
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
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Generate verification token
    const verificationToken = uuidv4();
    
    // Create user
    const userResult = await client.query(`
      INSERT INTO users (
        id, email, username, password_hash, verification_token, 
        created_at, updated_at, is_verified, role, status
      ) VALUES (
        $1, $2, $3, $4, $5, 
        NOW(), NOW(), false, 'user', 'active'
      ) RETURNING id, email, username, created_at, is_verified, role, status
    `, [uuidv4(), email, username, passwordHash, verificationToken]);
    
    const user = userResult.rows[0];
    
    // TODO: Send verification email
    // await emailService.sendVerificationEmail(email, verificationToken);
    
    logger.info('User registered successfully', {
      userId: user.id,
      email: user.email,
      username: user.username
    });
    
    // Generate tokens
    const tokens = generateTokens(user);
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please check your email for verification.',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        isVerified: user.is_verified,
        role: user.role,
        createdAt: user.created_at
      },
      tokens
    });
  });
}

/**
 * Authenticate user login
 */
async function login(req, res) {
  const { email, password } = req.body;
  
  logger.info('User login attempt', { email, ip: req.ip });
  
  // Get user from database
  const userResult = await query(`
    SELECT id, email, username, password_hash, is_verified, 
           role, status, last_login_at, login_attempts
    FROM users 
    WHERE email = $1
  `, [email]);
  
  if (userResult.rows.length === 0) {
    logger.warn('Login attempt with non-existent email', { email, ip: req.ip });
    throw createError('Invalid email or password', 401);
  }
  
  const user = userResult.rows[0];
  
  // Check account status
  if (user.status === 'suspended') {
    throw createError('Account is suspended', 403);
  }
  
  if (user.status === 'banned') {
    throw createError('Account is banned', 403);
  }
  
  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  
  if (!isPasswordValid) {
    // Increment login attempts
    await query(
      'UPDATE users SET login_attempts = login_attempts + 1 WHERE id = $1',
      [user.id]
    );
    
    logger.warn('Invalid password attempt', { 
      userId: user.id, 
      email: user.email, 
      ip: req.ip 
    });
    
    throw createError('Invalid email or password', 401);
  }
  
  // Reset login attempts and update last login
  await query(`
    UPDATE users 
    SET login_attempts = 0, last_login_at = NOW(), updated_at = NOW()
    WHERE id = $1
  `, [user.id]);
  
  // Generate tokens
  const tokens = generateTokens(user);
  
  // Store refresh token in database
  await query(`
    INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at)
    VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', NOW())
  `, [uuidv4(), user.id, tokens.refreshToken]);
  
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
      isVerified: user.is_verified,
      role: user.role,
      lastLoginAt: user.last_login_at
    },
    tokens
  });
}

/**
 * Logout user and invalidate tokens
 */
async function logout(req, res) {
  const userId = req.user.id;
  
  // Invalidate all refresh tokens for this user
  await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
  
  logger.info('User logged out successfully', { userId });
  
  res.json({
    success: true,
    message: 'Logout successful'
  });
}

/**
 * Refresh access token using refresh token
 */
async function refreshToken(req, res) {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    throw createError('Refresh token is required', 400);
  }
  
  // Verify refresh token
  const tokenResult = await query(`
    SELECT rt.*, u.id, u.email, u.role, u.status 
    FROM refresh_tokens rt
    JOIN users u ON rt.user_id = u.id
    WHERE rt.token = $1 AND rt.expires_at > NOW()
  `, [refreshToken]);
  
  if (tokenResult.rows.length === 0) {
    throw createError('Invalid or expired refresh token', 401);
  }
  
  const tokenData = tokenResult.rows[0];
  
  // Check user status
  if (tokenData.status !== 'active') {
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [tokenData.user_id]);
    throw createError('Account is not active', 403);
  }
  
  // Generate new tokens
  const user = {
    id: tokenData.id,
    email: tokenData.email,
    role: tokenData.role
  };
  
  const tokens = generateTokens(user);
  
  // Replace old refresh token with new one
  await query(`
    UPDATE refresh_tokens 
    SET token = $1, expires_at = NOW() + INTERVAL '7 days', updated_at = NOW()
    WHERE id = $2
  `, [tokens.refreshToken, tokenData.id]);
  
  logger.info('Token refreshed successfully', { userId: user.id });
  
  res.json({
    success: true,
    tokens
  });
}

/**
 * Initiate password reset process
 */
async function forgotPassword(req, res) {
  const { email } = req.body;
  
  logger.info('Password reset requested', { email, ip: req.ip });
  
  // Check if user exists
  const userResult = await query('SELECT id FROM users WHERE email = $1', [email]);
  
  if (userResult.rows.length === 0) {
    // Don't reveal if email exists or not
    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.'
    });
    return;
  }
  
  const user = userResult.rows[0];
  const resetToken = uuidv4();
  
  // Store reset token
  await query(`
    INSERT INTO password_reset_tokens (id, user_id, token, expires_at, created_at)
    VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW())
  `, [uuidv4(), user.id, resetToken]);
  
  // TODO: Send password reset email
  // await emailService.sendPasswordResetEmail(email, resetToken);
  
  logger.info('Password reset token generated', { userId: user.id });
  
  res.json({
    success: true,
    message: 'If an account with that email exists, a password reset link has been sent.'
  });
}

/**
 * Reset password using reset token
 */
async function resetPassword(req, res) {
  const { token, password } = req.body;
  
  logger.info('Password reset attempt', { token: token.substring(0, 8) + '...', ip: req.ip });
  
  await transaction(async (client) => {
    // Verify reset token
    const tokenResult = await client.query(`
      SELECT prt.*, u.email 
      FROM password_reset_tokens prt
      JOIN users u ON prt.user_id = u.id
      WHERE prt.token = $1 AND prt.expires_at > NOW() AND prt.used_at IS NULL
    `, [token]);
    
    if (tokenResult.rows.length === 0) {
      throw createError('Invalid or expired reset token', 400);
    }
    
    const tokenData = tokenResult.rows[0];
    
    // Hash new password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Update password
    await client.query(`
      UPDATE users 
      SET password_hash = $1, updated_at = NOW()
      WHERE id = $2
    `, [passwordHash, tokenData.user_id]);
    
    // Mark token as used
    await client.query(`
      UPDATE password_reset_tokens 
      SET used_at = NOW() 
      WHERE id = $1
    `, [tokenData.id]);
    
    // Invalidate all refresh tokens
    await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [tokenData.user_id]);
    
    logger.info('Password reset successful', { userId: tokenData.user_id });
  });
  
  res.json({
    success: true,
    message: 'Password reset successful. Please log in with your new password.'
  });
}

/**
 * Verify email address
 */
async function verifyEmail(req, res) {
  const { token } = req.params;
  
  logger.info('Email verification attempt', { token: token.substring(0, 8) + '...' });
  
  const userResult = await query(`
    UPDATE users 
    SET is_verified = true, verification_token = NULL, updated_at = NOW()
    WHERE verification_token = $1 AND is_verified = false
    RETURNING id, email, username
  `, [token]);
  
  if (userResult.rows.length === 0) {
    throw createError('Invalid or expired verification token', 400);
  }
  
  const user = userResult.rows[0];
  
  logger.info('Email verified successfully', { userId: user.id, email: user.email });
  
  res.json({
    success: true,
    message: 'Email verified successfully'
  });
}

/**
 * Resend email verification
 */
async function resendVerification(req, res) {
  const { email } = req.body;
  
  logger.info('Verification email resend requested', { email, ip: req.ip });
  
  const userResult = await query(`
    SELECT id, email, is_verified 
    FROM users 
    WHERE email = $1
  `, [email]);
  
  if (userResult.rows.length === 0 || userResult.rows[0].is_verified) {
    res.json({
      success: true,
      message: 'If an unverified account with that email exists, a verification email has been sent.'
    });
    return;
  }
  
  const user = userResult.rows[0];
  const verificationToken = uuidv4();
  
  // Update verification token
  await query(`
    UPDATE users 
    SET verification_token = $1, updated_at = NOW()
    WHERE id = $2
  `, [verificationToken, user.id]);
  
  // TODO: Send verification email
  // await emailService.sendVerificationEmail(email, verificationToken);
  
  logger.info('Verification email resent', { userId: user.id });
  
  res.json({
    success: true,
    message: 'If an unverified account with that email exists, a verification email has been sent.'
  });
}

module.exports = {
  register,
  login,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification
};