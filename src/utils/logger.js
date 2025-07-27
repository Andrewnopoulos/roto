const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

// Define level colors
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
};

// Add colors to winston
winston.addColors(colors);

// Define format for console output
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`
    )
);

// Define format for file output
const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Define which transports the logger must use
const transports = [
    // Console transport
    new winston.transports.Console({
        level: process.env.LOG_LEVEL || 'info',
        format: consoleFormat
    }),
    
    // File transport for errors
    new winston.transports.File({
        filename: path.join(__dirname, '../../logs/error.log'),
        level: 'error',
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
    }),
    
    // File transport for all logs
    new winston.transports.File({
        filename: path.join(__dirname, '../../logs/combined.log'),
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
    })
];

// Create the logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    levels,
    format: fileFormat,
    transports,
    exceptionHandlers: [
        new winston.transports.File({
            filename: path.join(__dirname, '../../logs/exceptions.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        })
    ],
    rejectionHandlers: [
        new winston.transports.File({
            filename: path.join(__dirname, '../../logs/rejections.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        })
    ]
});

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Add request logging middleware
logger.httpLogger = (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const message = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms - ${req.ip}`;
        
        if (res.statusCode >= 400) {
            logger.warn(message);
        } else {
            logger.http(message);
        }
    });
    
    next();
};

// Add performance logging utility
logger.performance = (label, fn) => {
    return async (...args) => {
        const start = Date.now();
        try {
            const result = await fn(...args);
            const duration = Date.now() - start;
            logger.debug(`Performance [${label}]: ${duration}ms`);
            return result;
        } catch (error) {
            const duration = Date.now() - start;
            logger.error(`Performance [${label}] failed after ${duration}ms: ${error.message}`);
            throw error;
        }
    };
};

// Add database query logging
logger.dbQuery = (query, params, duration) => {
    const message = `DB Query: ${query.substring(0, 100)}${query.length > 100 ? '...' : ''} - ${duration}ms`;
    
    if (duration > 1000) {
        logger.warn(`Slow query detected: ${message}`);
    } else {
        logger.debug(message);
    }
};

// Add security event logging
logger.security = (event, details) => {
    logger.warn(`Security Event [${event}]: ${JSON.stringify(details)}`);
};

// Add leaderboard specific logging
logger.leaderboard = {
    rankUpdate: (playerId, categoryName, oldRank, newRank) => {
        logger.info(`Rank Update - Player ${playerId} in ${categoryName}: ${oldRank} -> ${newRank}`);
    },
    
    cacheHit: (key) => {
        logger.debug(`Cache Hit: ${key}`);
    },
    
    cacheMiss: (key) => {
        logger.debug(`Cache Miss: ${key}`);
    },
    
    recalculation: (categoryName, duration) => {
        logger.info(`Leaderboard recalculation completed for ${categoryName} in ${duration}ms`);
    }
};

module.exports = logger;