/**
 * Rate Limiting Middleware
 * Implements rate limiting for API endpoints to prevent abuse
 */

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('redis');

// Initialize Redis client for rate limiting (optional - falls back to memory store)
let redisClient;
try {
    if (process.env.REDIS_URL) {
        redisClient = Redis.createClient({
            url: process.env.REDIS_URL
        });
        redisClient.on('error', (err) => {
            console.warn('Redis rate limiting unavailable, falling back to memory store:', err.message);
            redisClient = null;
        });
    }
} catch (error) {
    console.warn('Redis connection failed, using memory store for rate limiting');
    redisClient = null;
}

/**
 * Create rate limiter with Redis store if available, otherwise use memory store
 */
const createRateLimiter = (options) => {
    const config = {
        ...options,
        standardHeaders: true, // Return rate limit info in headers
        legacyHeaders: false,
        skip: (req) => {
            // Skip rate limiting for admin users in development
            if (process.env.NODE_ENV === 'development' && req.user?.isAdmin) {
                return true;
            }
            return false;
        },
        keyGenerator: (req) => {
            // Use user ID if authenticated, otherwise use IP
            return req.user?.id?.toString() || req.ip;
        },
        handler: (req, res) => {
            res.status(429).json({
                success: false,
                error: 'Too many requests',
                message: 'Rate limit exceeded. Please try again later.',
                retryAfter: Math.round(options.windowMs / 1000)
            });
        }
    };

    // Use Redis store if available
    if (redisClient) {
        config.store = new RedisStore({
            sendCommand: (...args) => redisClient.sendCommand(args)
        });
    }

    return rateLimit(config);
};

/**
 * General rate limiter for most API endpoints
 * 100 requests per 15 minutes per user/IP
 */
const rateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each user/IP to 100 requests per windowMs
    message: 'Too many requests from this user/IP, please try again later.'
});

/**
 * Strict rate limiter for sensitive operations
 * 20 requests per 15 minutes per user/IP
 */
const strictRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each user/IP to 20 requests per windowMs
    message: 'Too many sensitive requests from this user/IP, please try again later.'
});

/**
 * Authentication rate limiter
 * 5 attempts per 15 minutes per IP
 */
const authRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login attempts per windowMs
    skipSuccessfulRequests: true, // Don't count successful requests
    keyGenerator: (req) => req.ip, // Always use IP for auth attempts
    message: 'Too many authentication attempts from this IP, please try again later.'
});

/**
 * Search rate limiter
 * 30 searches per 5 minutes per user/IP
 */
const searchRateLimiter = createRateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 30, // Limit each user/IP to 30 search requests per windowMs
    message: 'Too many search requests, please try again later.'
});

/**
 * Game completion rate limiter
 * 10 game completions per minute per user
 */
const gameCompletionRateLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // Limit each user to 10 game completions per minute
    keyGenerator: (req) => {
        // Always use user ID for game completions
        return req.user?.id?.toString() || req.ip;
    },
    message: 'Too many game completions, please slow down.'
});

/**
 * Leaderboard rate limiter
 * 20 requests per minute per user/IP
 */
const leaderboardRateLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // Limit each user/IP to 20 leaderboard requests per minute
    message: 'Too many leaderboard requests, please try again later.'
});

/**
 * Profile update rate limiter
 * 5 updates per hour per user
 */
const profileUpdateRateLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // Limit each user to 5 profile updates per hour
    keyGenerator: (req) => req.user?.id?.toString() || req.ip,
    message: 'Too many profile updates, please try again later.'
});

/**
 * Admin operation rate limiter
 * 50 operations per hour per admin
 */
const adminRateLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // Limit each admin to 50 operations per hour
    keyGenerator: (req) => req.user?.id?.toString() || req.ip,
    skip: (req) => !req.user?.isAdmin, // Only apply to admin users
    message: 'Too many admin operations, please try again later.'
});

/**
 * Dynamic rate limiter based on user type and endpoint
 */
const dynamicRateLimiter = (req, res, next) => {
    // Determine appropriate rate limiter based on endpoint and user
    let limiter = rateLimiter;

    // Check specific endpoints
    if (req.path.includes('/auth') || req.path.includes('/login')) {
        limiter = authRateLimiter;
    } else if (req.path.includes('/search')) {
        limiter = searchRateLimiter;
    } else if (req.path.includes('/leaderboard')) {
        limiter = leaderboardRateLimiter;
    } else if (req.method === 'PUT' && req.path.includes('/profile')) {
        limiter = profileUpdateRateLimiter;
    } else if (req.path.includes('/complete')) {
        limiter = gameCompletionRateLimiter;
    } else if (req.user?.isAdmin && req.path.includes('/admin')) {
        limiter = adminRateLimiter;
    } else if (req.path.includes('/rating-decay') || req.path.includes('/admin')) {
        limiter = strictRateLimiter;
    }

    limiter(req, res, next);
};

/**
 * Custom rate limiter for specific endpoints
 */
const customRateLimiter = (windowMs, maxRequests, message) => {
    return createRateLimiter({
        windowMs,
        max: maxRequests,
        message: message || 'Rate limit exceeded for this endpoint.'
    });
};

/**
 * Rate limit bypass for testing (only in test environment)
 */
const bypassRateLimit = (req, res, next) => {
    if (process.env.NODE_ENV === 'test') {
        next();
    } else {
        rateLimiter(req, res, next);
    }
};

/**
 * Get rate limit status for a user/IP
 */
const getRateLimitStatus = async (key, windowMs, max) => {
    if (!redisClient) {
        return null; // Cannot get status without Redis
    }

    try {
        const current = await redisClient.get(`rl:${key}`);
        const remaining = Math.max(0, max - (parseInt(current) || 0));
        const resetTime = Date.now() + windowMs;

        return {
            limit: max,
            current: parseInt(current) || 0,
            remaining,
            resetTime
        };
    } catch (error) {
        console.error('Error getting rate limit status:', error);
        return null;
    }
};

module.exports = {
    rateLimiter,
    strictRateLimiter,
    authRateLimiter,
    searchRateLimiter,
    gameCompletionRateLimiter,
    leaderboardRateLimiter,
    profileUpdateRateLimiter,
    adminRateLimiter,
    dynamicRateLimiter,
    customRateLimiter,
    bypassRateLimit,
    getRateLimitStatus
};