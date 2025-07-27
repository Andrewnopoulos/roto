const redis = require('redis');
require('dotenv').config();

const client = redis.createClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0,
    retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
            // End reconnecting on a specific error and flush all commands with an error
            return new Error('The Redis server refused the connection');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
            // End reconnecting after a specific timeout and flush all commands with an error
            return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
            // End reconnecting with built in error
            return undefined;
        }
        // Reconnect after
        return Math.min(options.attempt * 100, 3000);
    }
});

client.on('connect', () => {
    console.log('Connected to Redis server');
});

client.on('error', (err) => {
    console.error('Redis connection error:', err);
});

// Connect to Redis
(async () => {
    try {
        await client.connect();
    } catch (error) {
        console.error('Failed to connect to Redis:', error);
    }
})();

module.exports = client;