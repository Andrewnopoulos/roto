/**
 * Matchmaking Controller
 * 
 * Handles matchmaking queue operations, game creation, and queue status.
 * Integrates with MatchmakingService for skill-based player matching.
 */

const { createError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const MatchmakingService = require('../services/matchmakingService');

/**
 * Join the matchmaking queue
 */
async function joinQueue(req, res) {
    const userId = req.user.id;
    const { ranked = false, gameMode = 'standard', allowSpectators = true } = req.body;

    try {
        const queueEntry = await MatchmakingService.joinQueue(userId, {
            ranked,
            gameMode,
            allowSpectators
        });

        logger.info('Player joined matchmaking queue', {
            userId,
            ranked,
            gameMode
        });

        res.json({
            success: true,
            message: 'Successfully joined matchmaking queue',
            queueEntry: {
                joinedAt: queueEntry.joinedAt,
                preferences: queueEntry.preferences,
                estimatedWaitTime: MatchmakingService.estimateWaitTime(queueEntry)
            }
        });

    } catch (error) {
        logger.error('Failed to join matchmaking queue', {
            userId,
            error: error.message
        });
        
        if (error.message.includes('already in')) {
            throw createError('Already in matchmaking queue', 409);
        }
        
        if (error.message.includes('Need at least')) {
            throw createError(error.message, 400);
        }
        
        throw createError('Failed to join matchmaking queue', 500);
    }
}

/**
 * Leave the matchmaking queue
 */
async function leaveQueue(req, res) {
    const userId = req.user.id;

    try {
        const wasInQueue = await MatchmakingService.leaveQueue(userId);

        if (!wasInQueue) {
            throw createError('Not currently in matchmaking queue', 400);
        }

        logger.info('Player left matchmaking queue', { userId });

        res.json({
            success: true,
            message: 'Successfully left matchmaking queue'
        });

    } catch (error) {
        logger.error('Failed to leave matchmaking queue', {
            userId,
            error: error.message
        });
        throw error;
    }
}

/**
 * Get current queue status for the user
 */
async function getQueueStatus(req, res) {
    const userId = req.user.id;

    try {
        const playerStatus = MatchmakingService.getPlayerQueueStatus(userId);
        const globalStatus = MatchmakingService.getQueueStatus();

        res.json({
            success: true,
            playerStatus: playerStatus,
            globalStatus: {
                totalInQueue: globalStatus.totalInQueue,
                rankedQueue: globalStatus.rankedQueue,
                casualQueue: globalStatus.casualQueue,
                averageQueueTime: globalStatus.averageQueueTime
            }
        });

    } catch (error) {
        logger.error('Failed to get queue status', {
            userId,
            error: error.message
        });
        throw createError('Failed to get queue status', 500);
    }
}

/**
 * Get detailed global queue information (admin/debug)
 */
async function getGlobalQueueStatus(req, res) {
    const userId = req.user.id;

    try {
        // Check if user has permission to view detailed queue data
        if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
            throw createError('Insufficient permissions', 403);
        }

        const globalStatus = MatchmakingService.getQueueStatus();

        logger.info('Global queue status requested', { userId });

        res.json({
            success: true,
            globalStatus: globalStatus
        });

    } catch (error) {
        logger.error('Failed to get global queue status', {
            userId,
            error: error.message
        });
        throw error;
    }
}

/**
 * Force match creation (admin only)
 */
async function forceMatch(req, res) {
    const userId = req.user.id;
    const { player1Id, player2Id } = req.body;

    try {
        // Check admin permissions
        if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
            throw createError('Insufficient permissions', 403);
        }

        // Get player data from queue
        const player1 = MatchmakingService.matchmakingQueue.get(player1Id);
        const player2 = MatchmakingService.matchmakingQueue.get(player2Id);

        if (!player1 || !player2) {
            throw createError('One or both players not in queue', 400);
        }

        const matchData = await MatchmakingService.createMatch(player1, player2);

        logger.info('Force match created', {
            adminUserId: userId,
            gameId: matchData.gameId,
            player1Id,
            player2Id
        });

        res.json({
            success: true,
            message: 'Match created successfully',
            matchData: matchData
        });

    } catch (error) {
        logger.error('Failed to force match creation', {
            userId,
            error: error.message
        });
        throw error;
    }
}

/**
 * Get matchmaking statistics
 */
async function getMatchmakingStats(req, res) {
    const userId = req.user.id;

    try {
        const queueStatus = MatchmakingService.getQueueStatus();
        
        // Get historical matchmaking data from database
        const statsQuery = `
            SELECT 
                COUNT(*) as total_matches_today,
                AVG(EXTRACT(EPOCH FROM (ended_at - started_at))) as avg_match_duration,
                COUNT(CASE WHEN is_ranked = true THEN 1 END) as ranked_matches_today,
                COUNT(CASE WHEN is_ranked = false THEN 1 END) as casual_matches_today
            FROM games 
            WHERE created_at >= CURRENT_DATE
                AND status = 'completed'
        `;

        const { query } = require('../config/database');
        const statsResult = await query(statsQuery);
        const stats = statsResult.rows[0];

        res.json({
            success: true,
            stats: {
                currentQueue: {
                    total: queueStatus.totalInQueue,
                    ranked: queueStatus.rankedQueue,
                    casual: queueStatus.casualQueue,
                    averageWaitTime: queueStatus.averageQueueTime
                },
                today: {
                    totalMatches: parseInt(stats.total_matches_today) || 0,
                    rankedMatches: parseInt(stats.ranked_matches_today) || 0,
                    casualMatches: parseInt(stats.casual_matches_today) || 0,
                    averageMatchDuration: parseFloat(stats.avg_match_duration) || 0
                }
            }
        });

    } catch (error) {
        logger.error('Failed to get matchmaking stats', {
            userId,
            error: error.message
        });
        throw createError('Failed to get matchmaking statistics', 500);
    }
}

/**
 * Cancel search and suggest alternatives
 */
async function cancelSearch(req, res) {
    const userId = req.user.id;

    try {
        const wasInQueue = await MatchmakingService.leaveQueue(userId);

        if (!wasInQueue) {
            throw createError('Not currently searching for a match', 400);
        }

        // Get suggestions for the user
        const suggestions = await getSuggestions(userId);

        logger.info('Player cancelled search', { userId });

        res.json({
            success: true,
            message: 'Search cancelled successfully',
            suggestions: suggestions
        });

    } catch (error) {
        logger.error('Failed to cancel search', {
            userId,
            error: error.message
        });
        throw error;
    }
}

/**
 * Get suggestions for improving matchmaking experience
 */
async function getSuggestions(userId) {
    try {
        const { query } = require('../config/database');
        
        // Get user stats
        const userStatsQuery = `
            SELECT rating, games_played, wins, losses
            FROM user_statistics
            WHERE user_id = $1
        `;
        const userStats = await query(userStatsQuery, [userId]);
        const stats = userStats.rows[0];

        const suggestions = [];

        // Suggest based on experience level
        if (stats.games_played < 10) {
            suggestions.push({
                type: 'experience',
                message: 'Play more casual games to unlock ranked matchmaking',
                action: 'play_casual'
            });
        }

        // Suggest based on current queue
        const queueStatus = MatchmakingService.getQueueStatus();
        if (queueStatus.casualQueue > queueStatus.rankedQueue) {
            suggestions.push({
                type: 'queue_optimization',
                message: 'Casual games have shorter wait times right now',
                action: 'try_casual'
            });
        }

        // Peak hours suggestion
        const currentHour = new Date().getHours();
        if (currentHour < 6 || currentHour > 23) {
            suggestions.push({
                type: 'timing',
                message: 'Peak hours (6PM-11PM) have more active players',
                action: 'try_later'
            });
        }

        return suggestions;

    } catch (error) {
        logger.error('Failed to get suggestions', { userId, error: error.message });
        return [];
    }
}

module.exports = {
    joinQueue,
    leaveQueue,
    getQueueStatus,
    getGlobalQueueStatus,
    forceMatch,
    getMatchmakingStats,
    cancelSearch
};