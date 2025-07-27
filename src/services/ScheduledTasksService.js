const cron = require('node-cron');
const SeasonService = require('./SeasonService');
const LeaderboardService = require('./LeaderboardService');
const PositionTrackingService = require('./PositionTrackingService');
const logger = require('../utils/logger');

class ScheduledTasksService {
    constructor() {
        this.tasks = new Map();
        this.isInitialized = false;
    }

    /**
     * Initialize all scheduled tasks
     */
    init() {
        if (this.isInitialized) {
            logger.warn('Scheduled tasks already initialized');
            return;
        }

        try {
            // Season transition check (every hour)
            this.scheduleSeasonTransitions();
            
            // Leaderboard recalculation (every 30 minutes)
            this.scheduleLeaderboardRecalculation();
            
            // Weekly leaderboard reset (every Monday at 00:00)
            this.scheduleWeeklyReset();
            
            // Monthly leaderboard reset (1st day of month at 00:00)
            this.scheduleMonthlyReset();
            
            // Cache cleanup (every 6 hours)
            this.scheduleCacheCleanup();
            
            // Position tracking cleanup (daily at 02:00)
            this.schedulePositionTrackingCleanup();
            
            // Performance metrics collection (every 15 minutes)
            this.schedulePerformanceMetrics();

            this.isInitialized = true;
            logger.info('All scheduled tasks initialized successfully');

        } catch (error) {
            logger.error('Error initializing scheduled tasks:', error);
            throw error;
        }
    }

    /**
     * Schedule season transition checks
     */
    scheduleSeasonTransitions() {
        const task = cron.schedule('0 * * * *', async () => { // Every hour
            try {
                logger.info('Running scheduled season transition check');
                await SeasonService.scheduleSeasonTransitions();
                logger.info('Season transition check completed');
            } catch (error) {
                logger.error('Error in scheduled season transitions:', error);
            }
        }, {
            scheduled: false,
            timezone: "UTC"
        });

        this.tasks.set('seasonTransitions', task);
        task.start();
        logger.info('Season transition task scheduled (every hour)');
    }

    /**
     * Schedule leaderboard recalculation
     */
    scheduleLeaderboardRecalculation() {
        const task = cron.schedule('*/30 * * * *', async () => { // Every 30 minutes
            try {
                logger.info('Running scheduled leaderboard recalculation');
                
                const categories = ['global_rating', 'global_wins', 'global_win_percentage'];
                const currentSeason = await SeasonService.getCurrentSeason();
                
                for (const category of categories) {
                    try {
                        await LeaderboardService.recalculateRankings(category, currentSeason?.id);
                        logger.debug(`Recalculated rankings for ${category}`);
                    } catch (error) {
                        logger.error(`Error recalculating ${category}:`, error);
                    }
                }
                
                logger.info('Leaderboard recalculation completed');
            } catch (error) {
                logger.error('Error in scheduled leaderboard recalculation:', error);
            }
        }, {
            scheduled: false,
            timezone: "UTC"
        });

        this.tasks.set('leaderboardRecalculation', task);
        task.start();
        logger.info('Leaderboard recalculation task scheduled (every 30 minutes)');
    }

    /**
     * Schedule weekly leaderboard reset
     */
    scheduleWeeklyReset() {
        const task = cron.schedule('0 0 * * 1', async () => { // Every Monday at 00:00 UTC
            try {
                logger.info('Running weekly leaderboard reset');
                await this._resetLeaderboardsByFrequency('weekly');
                logger.info('Weekly leaderboard reset completed');
            } catch (error) {
                logger.error('Error in weekly leaderboard reset:', error);
            }
        }, {
            scheduled: false,
            timezone: "UTC"
        });

        this.tasks.set('weeklyReset', task);
        task.start();
        logger.info('Weekly reset task scheduled (Mondays at 00:00 UTC)');
    }

    /**
     * Schedule monthly leaderboard reset
     */
    scheduleMonthlyReset() {
        const task = cron.schedule('0 0 1 * *', async () => { // 1st day of month at 00:00 UTC
            try {
                logger.info('Running monthly leaderboard reset');
                await this._resetLeaderboardsByFrequency('monthly');
                logger.info('Monthly leaderboard reset completed');
            } catch (error) {
                logger.error('Error in monthly leaderboard reset:', error);
            }
        }, {
            scheduled: false,
            timezone: "UTC"
        });

        this.tasks.set('monthlyReset', task);
        task.start();
        logger.info('Monthly reset task scheduled (1st day of month at 00:00 UTC)');
    }

    /**
     * Schedule cache cleanup
     */
    scheduleCacheCleanup() {
        const task = cron.schedule('0 */6 * * *', async () => { // Every 6 hours
            try {
                logger.info('Running cache cleanup');
                
                const redis = require('../config/redis');
                
                // Clean up expired leaderboard caches
                const leaderboardKeys = await redis.keys('leaderboard:*');
                let cleanedCount = 0;
                
                for (const key of leaderboardKeys) {
                    const ttl = await redis.ttl(key);
                    if (ttl === -1) { // Key without expiration
                        await redis.expire(key, 300); // Set 5 minute expiration
                        cleanedCount++;
                    }
                }
                
                // Clean up old notification keys
                const notificationKeys = await redis.keys('rank_notification:*');
                for (const key of notificationKeys) {
                    const ttl = await redis.ttl(key);
                    if (ttl <= 0) {
                        await redis.del(key);
                        cleanedCount++;
                    }
                }
                
                logger.info(`Cache cleanup completed, processed ${cleanedCount} keys`);
            } catch (error) {
                logger.error('Error in cache cleanup:', error);
            }
        }, {
            scheduled: false,
            timezone: "UTC"
        });

        this.tasks.set('cacheCleanup', task);
        task.start();
        logger.info('Cache cleanup task scheduled (every 6 hours)');
    }

    /**
     * Schedule position tracking cleanup
     */
    schedulePositionTrackingCleanup() {
        const task = cron.schedule('0 2 * * *', async () => { // Daily at 02:00 UTC
            try {
                logger.info('Running position tracking cleanup');
                
                const retentionDays = parseInt(process.env.POSITION_HISTORY_RETENTION_DAYS) || 90;
                const deletedCount = await PositionTrackingService.cleanupOldRecords(retentionDays);
                
                logger.info(`Position tracking cleanup completed, deleted ${deletedCount} old records`);
            } catch (error) {
                logger.error('Error in position tracking cleanup:', error);
            }
        }, {
            scheduled: false,
            timezone: "UTC"
        });

        this.tasks.set('positionTrackingCleanup', task);
        task.start();
        logger.info('Position tracking cleanup task scheduled (daily at 02:00 UTC)');
    }

    /**
     * Schedule performance metrics collection
     */
    schedulePerformanceMetrics() {
        const task = cron.schedule('*/15 * * * *', async () => { // Every 15 minutes
            try {
                if (!process.env.ENABLE_PERFORMANCE_LOGGING || process.env.ENABLE_PERFORMANCE_LOGGING !== 'true') {
                    return;
                }
                
                logger.debug('Collecting performance metrics');
                
                const metrics = {
                    timestamp: new Date().toISOString(),
                    memory: process.memoryUsage(),
                    uptime: process.uptime(),
                    cpu: process.cpuUsage(),
                    activeHandles: process._getActiveHandles().length,
                    activeRequests: process._getActiveRequests().length
                };
                
                // Store metrics in Redis for monitoring
                const redis = require('../config/redis');
                const metricsKey = `metrics:${Date.now()}`;
                await redis.setEx(metricsKey, 86400, JSON.stringify(metrics)); // 24 hour expiry
                
                // Clean up old metrics (keep only last 100)
                const allMetricsKeys = await redis.keys('metrics:*');
                if (allMetricsKeys.length > 100) {
                    const sortedKeys = allMetricsKeys.sort();
                    const keysToDelete = sortedKeys.slice(0, allMetricsKeys.length - 100);
                    if (keysToDelete.length > 0) {
                        await redis.del(keysToDelete);
                    }
                }
                
                logger.debug('Performance metrics collected');
            } catch (error) {
                logger.error('Error collecting performance metrics:', error);
            }
        }, {
            scheduled: false,
            timezone: "UTC"
        });

        this.tasks.set('performanceMetrics', task);
        task.start();
        logger.info('Performance metrics task scheduled (every 15 minutes)');
    }

    /**
     * Stop all scheduled tasks
     */
    stopAll() {
        logger.info('Stopping all scheduled tasks');
        
        for (const [name, task] of this.tasks) {
            try {
                task.stop();
                logger.debug(`Stopped task: ${name}`);
            } catch (error) {
                logger.error(`Error stopping task ${name}:`, error);
            }
        }
        
        this.tasks.clear();
        this.isInitialized = false;
        logger.info('All scheduled tasks stopped');
    }

    /**
     * Stop a specific task
     */
    stopTask(taskName) {
        const task = this.tasks.get(taskName);
        if (task) {
            task.stop();
            this.tasks.delete(taskName);
            logger.info(`Stopped task: ${taskName}`);
        } else {
            logger.warn(`Task not found: ${taskName}`);
        }
    }

    /**
     * Get task status
     */
    getTaskStatus() {
        const status = {};
        for (const [name, task] of this.tasks) {
            status[name] = {
                running: task.running,
                scheduled: task.scheduled
            };
        }
        return status;
    }

    /**
     * Private helper methods
     */
    async _resetLeaderboardsByFrequency(frequency) {
        const pool = require('../config/database');
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Get categories with the specified frequency
            const categoriesResult = await client.query(
                'SELECT id, name FROM leaderboard_categories WHERE reset_frequency = $1 AND is_active = true',
                [frequency]
            );
            
            for (const category of categoriesResult.rows) {
                // Create snapshot before reset
                const snapshotData = await LeaderboardService.getLeaderboard(category.name, null, { limit: 1000 });
                
                await client.query(`
                    INSERT INTO leaderboard_snapshots (category_id, snapshot_date, snapshot_data, total_players)
                    VALUES ($1, CURRENT_DATE, $2, $3)
                `, [category.id, JSON.stringify(snapshotData), snapshotData.players.length]);
                
                // Reset the leaderboard
                await client.query(`
                    DELETE FROM leaderboard_entries WHERE category_id = $1
                `, [category.id]);
                
                // Clear position changes for this category
                await client.query(`
                    DELETE FROM position_changes WHERE category_id = $1
                `, [category.id]);
                
                logger.info(`Reset ${frequency} leaderboard: ${category.name}`);
            }
            
            await client.query('COMMIT');
            
            // Clear relevant caches
            const redis = require('../config/redis');
            const keysToDelete = await redis.keys(`leaderboard:*${frequency}*`);
            if (keysToDelete.length > 0) {
                await redis.del(keysToDelete);
            }
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = new ScheduledTasksService();