/**
 * Rota Game Platform - Main Server Entry Point
 * 
 * This is the main entry point for the Rota multiplayer game backend.
 * It initializes the Express server, Socket.io for real-time communication,
 * and sets up the core middleware and routing infrastructure.
 * 
 * Architecture decisions:
 * - Separation of HTTP and WebSocket concerns
 * - Centralized error handling
 * - Environment-based configuration
 * - Graceful shutdown handling
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');

// Import custom modules
const logger = require('./src/utils/logger');
const { connectDatabase } = require('./src/config/database');
const errorHandler = require('./src/middleware/errorHandler');
const securityMiddleware = require('./src/middleware/security');
const routes = require('./src/routes');
const socketManager = require('./src/sockets/socketManager');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.io with CORS configuration
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Store io instance globally for use in other modules
app.set('io', io);

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Configure Express middleware stack
 * Order matters for security and functionality
 */
function setupMiddleware() {
  // Security middleware (must be early in stack)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", process.env.CLIENT_URL || "http://localhost:3000"]
      }
    }
  }));
  
  // CORS configuration
  app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  
  // Compression for better performance
  app.use(compression());
  
  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  
  // Request logging
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    next();
  });
  
  // Custom security middleware
  app.use(securityMiddleware);
}

/**
 * Setup application routes
 */
function setupRoutes() {
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      version: process.env.npm_package_version || '1.0.0'
    });
  });
  
  // API routes
  app.use('/api', routes);
  
  // 404 handler for undefined routes
  app.use('*', (req, res) => {
    res.status(404).json({
      error: 'Route not found',
      path: req.originalUrl
    });
  });
  
  // Global error handling middleware (must be last)
  app.use(errorHandler);
}

/**
 * Initialize database connection
 */
async function initializeDatabase() {
  try {
    await connectDatabase();
    logger.info('Database connection established successfully');
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    process.exit(1);
  }
}

/**
 * Initialize Socket.io event handlers
 */
function initializeSocketIO() {
  socketManager.initialize(io);
  logger.info('Socket.io initialized successfully');
}

/**
 * Graceful shutdown handler
 */
function setupGracefulShutdown() {
  const shutdown = (signal) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    
    server.close(() => {
      logger.info('HTTP server closed');
      
      // Close database connections
      // This will be implemented when we add the database module
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
    });
    
    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Start the server
 */
async function startServer() {
  try {
    // Setup middleware and routes
    setupMiddleware();
    setupRoutes();
    
    // Initialize database
    await initializeDatabase();
    
    // Initialize Socket.io
    initializeSocketIO();
    
    // Setup graceful shutdown
    setupGracefulShutdown();
    
    // Start listening
    server.listen(PORT, () => {
      logger.info(`Rota game server running on port ${PORT}`, {
        environment: NODE_ENV,
        port: PORT
      });
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer();