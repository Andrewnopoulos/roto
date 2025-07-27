/**
 * Main Application Entry Point
 * Integrates the comprehensive player rating and statistics system
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

// Import routes
const playerRoutes = require('./routes/playerRoutes');
const gameRoutes = require('./routes/gameRoutes');

// Import middleware
const { sanitizeInput } = require('./middleware/validation');
const { rateLimiter } = require('./middleware/rateLimiting');

// Import services
const DatabaseService = require('./services/DatabaseService');
const AchievementService = require('./services/AchievementService');

// Import scheduled tasks
const scheduledTaskManager = require('./utils/scheduledTasks');

class RotoApplication {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.db = new DatabaseService();
        this.achievementService = new AchievementService();
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    /**
     * Setup middleware
     */
    setupMiddleware() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                },
            },
            crossOriginEmbedderPolicy: false
        }));

        // CORS configuration
        this.app.use(cors({
            origin: process.env.CORS_ORIGIN || '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            credentials: true
        }));

        // Compression
        this.app.use(compression());

        // Logging
        if (process.env.NODE_ENV !== 'test') {
            this.app.use(morgan('combined'));
        }

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Input sanitization
        this.app.use(sanitizeInput);

        // Global rate limiting
        this.app.use(rateLimiter);

        // Trust proxy (for rate limiting and IP detection)
        this.app.set('trust proxy', 1);
    }

    /**
     * Setup API routes
     */
    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', async (req, res) => {
            try {
                const dbHealth = await this.db.healthCheck();
                const taskStatus = scheduledTaskManager.getTaskStatus();
                
                res.json({
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    version: process.env.npm_package_version || '1.0.0',
                    uptime: process.uptime(),
                    database: dbHealth,
                    scheduledTasks: Object.keys(taskStatus).length,
                    memory: process.memoryUsage()
                });
            } catch (error) {
                res.status(500).json({
                    status: 'error',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // API status endpoint
        this.app.get('/api/status', (req, res) => {
            res.json({
                success: true,
                message: 'Roto Player Rating and Statistics API',
                version: '1.0.0',
                features: [
                    'ELO Rating System',
                    'Comprehensive Statistics',
                    'Achievement System',
                    'Player Profiles',
                    'Leaderboards',
                    'Match Predictions'
                ],
                endpoints: {
                    players: '/api/players',
                    games: '/api/games',
                    health: '/health'
                }
            });
        });

        // API routes
        this.app.use('/api/players', playerRoutes);
        this.app.use('/api/games', gameRoutes);

        // Admin routes for scheduled tasks
        this.app.get('/api/admin/tasks', (req, res) => {
            if (!req.user?.isAdmin) {
                return res.status(403).json({
                    success: false,
                    error: 'Admin access required'
                });
            }

            res.json({
                success: true,
                data: scheduledTaskManager.getTaskStatus()
            });
        });

        this.app.post('/api/admin/tasks/:taskName/run', async (req, res) => {
            if (!req.user?.isAdmin) {
                return res.status(403).json({
                    success: false,
                    error: 'Admin access required'
                });
            }

            try {
                await scheduledTaskManager.runTask(req.params.taskName);
                res.json({
                    success: true,
                    message: `Task ${req.params.taskName} executed successfully`
                });
            } catch (error) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint not found',
                path: req.originalUrl,
                method: req.method
            });
        });
    }

    /**
     * Setup error handling
     */
    setupErrorHandling() {
        // Global error handler
        this.app.use((error, req, res, next) => {
            console.error('Global error handler:', error);

            // Handle specific error types
            if (error.type === 'entity.parse.failed') {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid JSON in request body'
                });
            }

            if (error.type === 'entity.too.large') {
                return res.status(413).json({
                    success: false,
                    error: 'Request entity too large'
                });
            }

            // Database errors
            if (error.code && error.code.startsWith('ER_')) {
                return res.status(500).json({
                    success: false,
                    error: 'Database error occurred'
                });
            }

            // Default error response
            res.status(500).json({
                success: false,
                error: process.env.NODE_ENV === 'production' 
                    ? 'Internal server error' 
                    : error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            process.exit(1);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            process.exit(1);
        });
    }

    /**
     * Initialize the application
     */
    async initialize() {
        try {
            console.log('Initializing Roto Player Rating & Statistics System...');

            // Test database connection
            await this.db.testConnection();
            console.log('✓ Database connection established');

            // Initialize achievements
            await this.achievementService.initializeAchievements();
            console.log('✓ Achievement system initialized');

            // Initialize scheduled tasks
            scheduledTaskManager.initialize();
            console.log('✓ Scheduled tasks initialized');

            console.log('✓ System initialization complete');
        } catch (error) {
            console.error('✗ System initialization failed:', error);
            throw error;
        }
    }

    /**
     * Start the server
     */
    async start() {
        try {
            await this.initialize();

            this.server = this.app.listen(this.port, () => {
                console.log(`
🚀 Roto Player Rating & Statistics System
🌐 Server running on port ${this.port}
📊 Features: ELO Rating, Statistics, Achievements, Leaderboards
🔗 API Documentation: http://localhost:${this.port}/api/status
🏥 Health Check: http://localhost:${this.port}/health
                `);
            });

            // Graceful shutdown handlers
            this.setupGracefulShutdown();

        } catch (error) {
            console.error('Failed to start server:', error);
            process.exit(1);
        }
    }

    /**
     * Setup graceful shutdown
     */
    setupGracefulShutdown() {
        const gracefulShutdown = async (signal) => {
            console.log(`\n${signal} received. Starting graceful shutdown...`);

            try {
                // Stop accepting new connections
                if (this.server) {
                    this.server.close(() => {
                        console.log('✓ HTTP server closed');
                    });
                }

                // Stop scheduled tasks
                scheduledTaskManager.stopAll();
                console.log('✓ Scheduled tasks stopped');

                // Close database connections
                await this.db.close();
                console.log('✓ Database connections closed');

                console.log('✓ Graceful shutdown complete');
                process.exit(0);
            } catch (error) {
                console.error('Error during graceful shutdown:', error);
                process.exit(1);
            }
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    }

    /**
     * Get Express app instance
     */
    getApp() {
        return this.app;
    }
}

// Create and export application instance
const app = new RotoApplication();

// Start server if this file is run directly
if (require.main === module) {
    app.start().catch(error => {
        console.error('Failed to start application:', error);
        process.exit(1);
    });
}

module.exports = app;