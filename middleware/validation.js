/**
 * Validation Middleware
 * Handles request validation, authentication, and authorization
 */

const jwt = require('jsonwebtoken');
const DatabaseService = require('../services/DatabaseService');

const db = new DatabaseService();

/**
 * Authenticate user using JWT token
 */
const authenticateUser = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication token required'
            });
        }

        const token = authHeader.substring(7);
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Authentication token required'
            });
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        // Get user from database
        const connection = await db.getConnection();
        try {
            const [users] = await connection.execute(
                'SELECT id, username, email, created_at FROM users WHERE id = ?',
                [decoded.userId]
            );

            if (users.length === 0) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid authentication token'
                });
            }

            req.user = {
                id: users[0].id,
                username: users[0].username,
                email: users[0].email,
                createdAt: users[0].created_at,
                isAdmin: decoded.isAdmin || false
            };

            next();
        } finally {
            connection.release();
        }

    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired authentication token'
            });
        }

        console.error('Authentication error:', error);
        res.status(500).json({
            success: false,
            error: 'Authentication error'
        });
    }
};

/**
 * Require admin privileges
 */
const requireAdmin = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({
            success: false,
            error: 'Admin privileges required'
        });
    }
    next();
};

/**
 * Validate request parameters and body
 */
const validateRequest = (requiredFields = [], options = {}) => {
    return (req, res, next) => {
        const errors = [];
        const { optional = false } = options;

        for (const field of requiredFields) {
            const [source, fieldName] = field.split(':');
            let value;

            switch (source) {
                case 'params':
                    value = req.params[fieldName];
                    break;
                case 'query':
                    value = req.query[fieldName];
                    break;
                case 'body':
                    value = req.body[fieldName];
                    break;
                case 'headers':
                    value = req.headers[fieldName.toLowerCase()];
                    break;
                default:
                    errors.push(`Invalid field source: ${source}`);
                    continue;
            }

            if (!optional && (value === undefined || value === null || value === '')) {
                errors.push(`Missing required field: ${fieldName}`);
            }

            // Type-specific validation
            if (value !== undefined && value !== null && value !== '') {
                // Validate user IDs
                if (fieldName.toLowerCase().includes('id') && 
                    fieldName !== 'gameId' && 
                    isNaN(parseInt(value))) {
                    errors.push(`${fieldName} must be a valid number`);
                }

                // Validate email format
                if (fieldName === 'email' && value) {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(value)) {
                        errors.push('Invalid email format');
                    }
                }

                // Validate username format
                if (fieldName === 'username' && value) {
                    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(value)) {
                        errors.push('Username must be 3-20 characters long and contain only letters, numbers, underscores, and hyphens');
                    }
                }

                // Validate search query length
                if (fieldName === 'q' && value && value.trim().length < 2) {
                    errors.push('Search query must be at least 2 characters long');
                }
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors
            });
        }

        next();
    };
};

/**
 * Sanitize user input
 */
const sanitizeInput = (req, res, next) => {
    // Sanitize string inputs to prevent XSS
    const sanitizeValue = (value) => {
        if (typeof value === 'string') {
            return value
                .trim()
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/javascript:/gi, '')
                .replace(/on\w+=/gi, '');
        }
        return value;
    };

    // Recursively sanitize object values
    const sanitizeObject = (obj) => {
        if (obj && typeof obj === 'object') {
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    if (typeof obj[key] === 'object' && obj[key] !== null) {
                        sanitizeObject(obj[key]);
                    } else {
                        obj[key] = sanitizeValue(obj[key]);
                    }
                }
            }
        }
    };

    // Sanitize request body
    if (req.body) {
        sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query) {
        sanitizeObject(req.query);
    }

    next();
};

/**
 * Validate game completion data
 */
const validateGameCompletion = (req, res, next) => {
    const { 
        player1Id, 
        player2Id, 
        winnerId, 
        gameDurationSeconds, 
        moveHistory,
        gameType 
    } = req.body;

    const errors = [];

    // Check required fields
    if (!player1Id || !player2Id || !gameDurationSeconds) {
        errors.push('player1Id, player2Id, and gameDurationSeconds are required');
    }

    // Validate player IDs
    if (player1Id === player2Id) {
        errors.push('Players cannot be the same');
    }

    // Validate winner
    if (winnerId !== null && winnerId !== player1Id && winnerId !== player2Id) {
        errors.push('Winner must be one of the players or null for draw');
    }

    // Validate duration
    if (gameDurationSeconds < 1 || gameDurationSeconds > 86400) {
        errors.push('Game duration must be between 1 second and 24 hours');
    }

    // Validate game type
    if (gameType && !['standard', 'blitz', 'bullet', 'rapid'].includes(gameType)) {
        errors.push('Invalid game type');
    }

    // Validate move history
    if (moveHistory && Array.isArray(moveHistory)) {
        for (let i = 0; i < moveHistory.length; i++) {
            const move = moveHistory[i];
            
            if (!move.playerId) {
                errors.push(`Move ${i} missing playerId`);
                continue;
            }

            if (move.playerId !== player1Id && move.playerId !== player2Id) {
                errors.push(`Move ${i} has invalid playerId`);
            }

            // Validate move time if provided
            if (move.moveTime !== undefined && 
                (typeof move.moveTime !== 'number' || move.moveTime < 0)) {
                errors.push(`Move ${i} has invalid moveTime`);
            }

            // Validate timestamp if provided
            if (move.timestamp && !Date.parse(move.timestamp)) {
                errors.push(`Move ${i} has invalid timestamp`);
            }
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            error: 'Game completion validation failed',
            details: errors
        });
    }

    next();
};

/**
 * Validate pagination parameters
 */
const validatePagination = (req, res, next) => {
    const { page, limit } = req.query;

    if (page !== undefined) {
        const pageNum = parseInt(page);
        if (isNaN(pageNum) || pageNum < 1) {
            return res.status(400).json({
                success: false,
                error: 'Page must be a positive integer'
            });
        }
        req.query.page = pageNum;
    }

    if (limit !== undefined) {
        const limitNum = parseInt(limit);
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
            return res.status(400).json({
                success: false,
                error: 'Limit must be between 1 and 100'
            });
        }
        req.query.limit = limitNum;
    }

    next();
};

/**
 * Check if user owns resource
 */
const checkResourceOwnership = (resourceIdParam = 'userId') => {
    return (req, res, next) => {
        const resourceId = parseInt(req.params[resourceIdParam]);
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        if (resourceId !== userId && !req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        next();
    };
};

module.exports = {
    authenticateUser,
    requireAdmin,
    validateRequest,
    sanitizeInput,
    validateGameCompletion,
    validatePagination,
    checkResourceOwnership
};