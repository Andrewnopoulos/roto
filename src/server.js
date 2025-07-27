require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const seasonRoutes = require('./routes/seasonRoutes');
const gameRoutes = require('./routes/gameRoutes');
const ScheduledTasksService = require('./services/ScheduledTasksService');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// CORS configuration
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400 // 24 hours
}));

// Global rate limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.security('rate_limit_exceeded', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            url: req.originalUrl
        });
        res.status(429).json({
            success: false,
            message: 'Too many requests from this IP, please try again later.'
        });
    }
});

app.use(globalLimiter);

// Body parsing middleware
app.use(express.json({ 
    limit: '10mb',
    strict: true
}));
app.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb' 
}));

// Request logging middleware
app.use(logger.httpLogger);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Roto Leaderboard Service is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API routes
app.use('/api/leaderboards', leaderboardRoutes);
app.use('/api/seasons', seasonRoutes);
app.use('/api/games', gameRoutes);

// 404 handler
app.use('*', (req, res) => {
    logger.warn(`404 Not Found: ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Global error handler
app.use((error, req, res, next) => {
    logger.error(`Global Error Handler: ${error.stack}`);
    
    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
        ...(isDevelopment && { stack: error.stack })
    });
});

// Database connection test
async function testDatabaseConnection() {
    try {
        const pool = require('./config/database');
        const result = await pool.query('SELECT NOW()');
        logger.info('Database connection successful');
        return true;
    } catch (error) {
        logger.error('Database connection failed:', error);
        return false;
    }
}

// Redis connection test
async function testRedisConnection() {
    try {
        const redis = require('./config/redis');
        await redis.ping();
        logger.info('Redis connection successful');
        return true;
    } catch (error) {
        logger.error('Redis connection failed:', error);
        return false;
    }
}

// Graceful shutdown handler
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received. Starting graceful shutdown...');
    
    server.close(async () => {
        logger.info('HTTP server closed');
        
        try {
            // Stop scheduled tasks
            ScheduledTasksService.stopAll();
            
            // Close database connections
            const pool = require('./config/database');
            await pool.end();
            logger.info('Database connections closed');
            
            // Close Redis connection
            const redis = require('./config/redis');
            await redis.quit();
            logger.info('Redis connection closed');
            
            process.exit(0);
        } catch (error) {
            logger.error('Error during graceful shutdown:', error);
            process.exit(1);
        }
    });
});

process.on('SIGINT', async () => {
    logger.info('SIGINT received. Starting graceful shutdown...');
    process.emit('SIGTERM');
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Start server
const server = app.listen(PORT, async () => {
    logger.info(`Roto Leaderboard Service starting on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Test connections
    const dbConnected = await testDatabaseConnection();
    const redisConnected = await testRedisConnection();
    
    if (!dbConnected || !redisConnected) {
        logger.error('Failed to establish required connections. Shutting down...');
        process.exit(1);
    }
    
    // Initialize scheduled tasks
    try {
        ScheduledTasksService.init();
        logger.info('Scheduled tasks initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize scheduled tasks:', error);
        // Don't exit - scheduled tasks are not critical for basic operation
    }
    
    logger.info('='.repeat(50));
    logger.info('🚀 Roto Leaderboard Service is ready!');
    logger.info(`📊 API Documentation: http://localhost:${PORT}/health`);
    logger.info('='.repeat(50));
});

module.exports = app;