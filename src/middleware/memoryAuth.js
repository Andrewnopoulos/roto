/**
 * Memory-based Authentication Middleware
 * 
 * JWT validation middleware that works without database dependencies
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

/**
 * Authenticate user from JWT token
 */
async function authenticate(req, res, next) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Access token has expired'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid access token'
        });
      } else {
        return res.status(401).json({
          success: false,
          message: 'Token verification failed'
        });
      }
    }
    
    // Attach user to request object (from JWT payload)
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      username: decoded.username,
      role: decoded.role || 'user',
      status: 'active',
      isVerified: true
    };
    
    console.log(`🔐 User authenticated: ${req.user.username} (${req.user.email})`);
    
    next();
    
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
}

/**
 * Require admin role for access
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  
  next();
}

module.exports = {
  authenticate,
  requireAdmin
};