/**
 * Scheduled Tasks
 * Handles periodic maintenance tasks for the rating and statistics system
 */

const cron = require('node-cron');
const StatisticsService = require('../services/StatisticsService');
const GameIntegrationService = require('../services/GameIntegrationService');
const AchievementService = require('../services/AchievementService');
const DatabaseService = require('../services/DatabaseService');

class ScheduledTaskManager {
    constructor() {
        this.statisticsService = new StatisticsService();
        this.gameIntegrationService = new GameIntegrationService();
        this.achievementService = new AchievementService();
        this.db = new DatabaseService();
        this.tasks = new Map();
        this.isEnabled = process.env.ENABLE_SCHEDULED_TASKS !== 'false';
    }

    /**
     * Initialize all scheduled tasks
     */
    initialize() {
        if (!this.isEnabled) {
            console.log('Scheduled tasks are disabled');
            return;
        }

        console.log('Initializing scheduled tasks...');

        // Daily statistics snapshots - runs at 1:00 AM every day
        this.scheduleTask('daily-statistics', '0 1 * * *', () => {
            this.generateDailyStatistics();
        });

        // Rating decay check - runs at 2:00 AM every Sunday
        this.scheduleTask('rating-decay', '0 2 * * 0', () => {
            this.applyRatingDecay();
        });

        // Ranking percentile updates - runs at 3:00 AM every day
        this.scheduleTask('ranking-update', '0 3 * * *', () => {
            this.updateRankingPercentiles();
        });

        // Database cleanup - runs at 4:00 AM every Sunday
        this.scheduleTask('database-cleanup', '0 4 * * 0', () => {
            this.cleanupOldData();
        });

        // Achievement system maintenance - runs at 5:00 AM every day
        this.scheduleTask('achievement-maintenance', '0 5 * * *', () => {
            this.achievementMaintenance();
        });

        // Performance analytics - runs every hour
        this.scheduleTask('performance-analytics', '0 * * * *', () => {
            this.generatePerformanceAnalytics();
        });

        // Health check - runs every 15 minutes
        this.scheduleTask('health-check', '*/15 * * * *', () => {
            this.systemHealthCheck();
        });

        console.log(`Scheduled ${this.tasks.size} tasks`);
    }

    /**
     * Schedule a task with cron
     * @param {string} name - Task name
     * @param {string} schedule - Cron schedule
     * @param {Function} task - Task function
     */
    scheduleTask(name, schedule, task) {
        try {
            const cronTask = cron.schedule(schedule, async () => {
                const startTime = Date.now();
                console.log(`[${new Date().toISOString()}] Starting task: ${name}`);
                
                try {
                    await task();
                    const duration = Date.now() - startTime;
                    console.log(`[${new Date().toISOString()}] Completed task: ${name} (${duration}ms)`);
                } catch (error) {
                    console.error(`[${new Date().toISOString()}] Error in task ${name}:`, error);
                }
            }, {
                scheduled: false
            });

            this.tasks.set(name, {
                cron: cronTask,
                schedule,
                lastRun: null,
                status: 'scheduled'
            });

            cronTask.start();
        } catch (error) {
            console.error(`Failed to schedule task ${name}:`, error);
        }
    }

    /**
     * Generate daily statistics snapshots
     */
    async generateDailyStatistics() {
        console.log('Generating daily statistics snapshots...');
        
        try {
            await this.statisticsService.generateDailySnapshots();
            
            // Update task status
            this.updateTaskStatus('daily-statistics', 'completed');
            
            console.log('Daily statistics snapshots generated successfully');
        } catch (error) {
            this.updateTaskStatus('daily-statistics', 'error');
            throw error;
        }
    }

    /**
     * Apply rating decay for inactive players
     */
    async applyRatingDecay() {
        console.log('Applying rating decay for inactive players...');
        
        try {
            const decayResult = await this.gameIntegrationService.applyRatingDecay(90);
            
            console.log(`Rating decay applied to ${decayResult.ratingsDecayed} players`);
            
            // Log decay results
            if (decayResult.decayResults.length > 0) {
                console.log('Players affected by rating decay:', 
                    decayResult.decayResults.map(p => 
                        `${p.username}: ${p.oldRating} → ${p.newRating} (${p.change})`
                    ).slice(0, 10) // Log first 10
                );
            }
            
            this.updateTaskStatus('rating-decay', 'completed');
        } catch (error) {
            this.updateTaskStatus('rating-decay', 'error');
            throw error;
        }
    }

    /**
     * Update ranking percentiles for all players
     */
    async updateRankingPercentiles() {
        console.log('Updating ranking percentiles...');
        
        try {
            const connection = await this.db.getConnection();
            
            try {
                // Update percentiles for all active players
                await connection.execute(`
                    UPDATE users u1 
                    SET ranking_percentile = (
                        SELECT 100.0 * (COUNT(*) - 1) / (
                            SELECT COUNT(*) - 1 
                            FROM users 
                            WHERE games_played >= 10
                        )
                        FROM users u2 
                        WHERE u2.elo_rating <= u1.elo_rating 
                        AND u2.games_played >= 10
                    )
                    WHERE u1.games_played >= 10
                `);
                
                console.log('Ranking percentiles updated successfully');
                this.updateTaskStatus('ranking-update', 'completed');
            } finally {
                connection.release();
            }
        } catch (error) {
            this.updateTaskStatus('ranking-update', 'error');
            throw error;
        }
    }

    /**
     * Clean up old data to maintain performance
     */
    async cleanupOldData() {
        console.log('Performing database cleanup...');
        
        try {
            const connection = await this.db.getConnection();
            let totalCleaned = 0;
            
            try {
                await connection.query('BEGIN');

                // Clean up old rating history (keep last 2 years)
                const ratingCleanup = await connection.query(`
                    DELETE FROM rating_history 
                    WHERE created_at < NOW() - INTERVAL '2 years'
                `);
                totalCleaned += ratingCleanup.rowCount;

                // Clean up old statistics snapshots (keep last 1 year of daily, 2 years of weekly/monthly)
                const snapshotCleanup = await connection.query(`
                    DELETE FROM statistics_snapshots 
                    WHERE (snapshot_type = 'daily' AND snapshot_date < CURRENT_DATE - INTERVAL '1 year')
                       OR (snapshot_type IN ('weekly', 'monthly') AND snapshot_date < CURRENT_DATE - INTERVAL '2 years')
                `);
                totalCleaned += snapshotCleanup.rowCount;

                // Clean up very old game statistics (keep last 3 years)
                const gameStatsCleanup = await connection.query(`
                    DELETE FROM game_statistics 
                    WHERE created_at < NOW() - INTERVAL '3 years'
                `);
                totalCleaned += gameStatsCleanup.rowCount;

                await connection.query('COMMIT');
                
                console.log(`Database cleanup completed. Removed ${totalCleaned} old records.`);
                this.updateTaskStatus('database-cleanup', 'completed');
            } catch (error) {
                await connection.query('ROLLBACK');
                throw error;
            } finally {
                connection.release();
            }
        } catch (error) {
            this.updateTaskStatus('database-cleanup', 'error');
            throw error;
        }
    }

    /**
     * Achievement system maintenance
     */
    async achievementMaintenance() {
        console.log('Performing achievement system maintenance...');
        
        try {
            // Initialize achievements if not already done
            await this.achievementService.initializeAchievements();
            
            // Could add more maintenance tasks here:
            // - Check for achievement consistency
            // - Update achievement progress for all users
            // - Clean up orphaned achievement data
            
            console.log('Achievement system maintenance completed');
            this.updateTaskStatus('achievement-maintenance', 'completed');
        } catch (error) {
            this.updateTaskStatus('achievement-maintenance', 'error');
            throw error;
        }
    }

    /**
     * Generate performance analytics
     */
    async generatePerformanceAnalytics() {
        try {
            const connection = await this.db.getConnection();
            
            try {
                // Get basic performance metrics
                const [metrics] = await connection.execute(`
                    SELECT 
                        COUNT(DISTINCT u.id) as active_players,
                        COUNT(DISTINCT gs.game_id) as games_today,
                        AVG(gs.game_duration_seconds) as avg_game_duration,
                        COUNT(DISTINCT CASE WHEN u.last_game_played >= NOW() - INTERVAL '24 hours' THEN u.id END) as players_last_24h
                    FROM users u
                    LEFT JOIN game_statistics gs ON (u.id = gs.player1_id OR u.id = gs.player2_id) 
                        AND DATE(gs.created_at) = CURRENT_DATE
                    WHERE u.games_played > 0
                `);

                const stats = metrics[0];
                
                // Log analytics (in production, this might go to a monitoring service)
                console.log('Performance Analytics:', {
                    activePlayers: stats.active_players,
                    gamesToday: stats.games_today,
                    avgGameDuration: Math.round(stats.avg_game_duration || 0),
                    playersLast24h: stats.players_last_24h,
                    timestamp: new Date().toISOString()
                });
                
                this.updateTaskStatus('performance-analytics', 'completed');
            } finally {
                connection.release();
            }
        } catch (error) {
            this.updateTaskStatus('performance-analytics', 'error');
            console.error('Performance analytics error:', error);
        }
    }

    /**
     * System health check
     */
    async systemHealthCheck() {
        try {
            // Check database health
            const dbHealth = await this.db.healthCheck();
            
            // Check if critical services are responsive
            const healthStatus = {
                database: dbHealth.status,
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage()
            };

            // Log health status (in production, might send to monitoring service)
            if (dbHealth.status !== 'healthy') {
                console.error('Health check failed:', healthStatus);
            }
            
            this.updateTaskStatus('health-check', 'completed');
        } catch (error) {
            this.updateTaskStatus('health-check', 'error');
            console.error('Health check error:', error);
        }
    }

    /**
     * Update task status
     * @param {string} taskName - Task name
     * @param {string} status - New status
     */
    updateTaskStatus(taskName, status) {
        const task = this.tasks.get(taskName);
        if (task) {
            task.status = status;
            task.lastRun = new Date().toISOString();
        }
    }

    /**
     * Get task status
     * @returns {Object} Task status information
     */
    getTaskStatus() {
        const status = {};
        
        for (const [name, task] of this.tasks) {
            status[name] = {
                schedule: task.schedule,
                status: task.status,
                lastRun: task.lastRun
            };
        }
        
        return status;
    }

    /**
     * Stop a specific task
     * @param {string} taskName - Task name
     */
    stopTask(taskName) {
        const task = this.tasks.get(taskName);
        if (task && task.cron) {
            task.cron.stop();
            task.status = 'stopped';
            console.log(`Stopped task: ${taskName}`);
        }
    }

    /**
     * Start a specific task
     * @param {string} taskName - Task name
     */
    startTask(taskName) {
        const task = this.tasks.get(taskName);
        if (task && task.cron) {
            task.cron.start();
            task.status = 'scheduled';
            console.log(`Started task: ${taskName}`);
        }
    }

    /**
     * Stop all tasks
     */
    stopAll() {
        for (const [name, task] of this.tasks) {
            if (task.cron) {
                task.cron.stop();
                task.status = 'stopped';
            }
        }
        console.log('All scheduled tasks stopped');
    }

    /**
     * Start all tasks
     */
    startAll() {
        for (const [name, task] of this.tasks) {
            if (task.cron) {
                task.cron.start();
                task.status = 'scheduled';
            }
        }
        console.log('All scheduled tasks started');
    }

    /**
     * Run a task immediately (for testing/debugging)
     * @param {string} taskName - Task name
     */
    async runTask(taskName) {
        const taskMap = {
            'daily-statistics': () => this.generateDailyStatistics(),
            'rating-decay': () => this.applyRatingDecay(),
            'ranking-update': () => this.updateRankingPercentiles(),
            'database-cleanup': () => this.cleanupOldData(),
            'achievement-maintenance': () => this.achievementMaintenance(),
            'performance-analytics': () => this.generatePerformanceAnalytics(),
            'health-check': () => this.systemHealthCheck()
        };

        const task = taskMap[taskName];
        if (task) {
            console.log(`Manually running task: ${taskName}`);
            await task();
        } else {
            throw new Error(`Task not found: ${taskName}`);
        }
    }
}

// Export singleton instance
const scheduledTaskManager = new ScheduledTaskManager();

module.exports = scheduledTaskManager;