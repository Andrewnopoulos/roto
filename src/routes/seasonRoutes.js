const express = require('express');
const router = express.Router();
const SeasonController = require('../controllers/SeasonController');
const { SeasonValidation } = require('../middleware/validation');
const rateLimit = require('express-rate-limit');

// Rate limiting for season endpoints
const seasonLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
    message: {
        success: false,
        message: 'Too many requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const adminLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // 10 admin operations per minute
    message: {
        success: false,
        message: 'Too many admin requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting to all season routes
router.use(seasonLimiter);

/**
 * @route GET /api/seasons
 * @desc Get all seasons with pagination
 * @access Public
 */
router.get('/',
    SeasonValidation.validateSeasonQuery(),
    SeasonController.getSeasons
);

/**
 * @route GET /api/seasons/current
 * @desc Get current active season
 * @access Public
 */
router.get('/current', SeasonController.getCurrentSeason);

/**
 * @route GET /api/seasons/:seasonId
 * @desc Get season details by ID
 * @access Public
 */
router.get('/:seasonId',
    SeasonValidation.validateSeasonId(),
    SeasonController.getSeasonById
);

/**
 * @route GET /api/seasons/:seasonId/winners
 * @desc Get season winners
 * @access Public
 */
router.get('/:seasonId/winners',
    SeasonValidation.validateSeasonId(),
    SeasonValidation.validateSeasonWinnersQuery(),
    SeasonController.getSeasonWinners
);

/**
 * @route POST /api/seasons
 * @desc Create a new season (Admin only)
 * @access Admin
 */
router.post('/',
    adminLimiter,
    SeasonValidation.validateCreateSeason(),
    SeasonController.createSeason
);

/**
 * @route POST /api/seasons/:seasonId/start
 * @desc Start a season (Admin only)
 * @access Admin
 */
router.post('/:seasonId/start',
    adminLimiter,
    SeasonValidation.validateSeasonId(),
    SeasonController.startSeason
);

/**
 * @route POST /api/seasons/:seasonId/end
 * @desc End a season (Admin only)
 * @access Admin
 */
router.post('/:seasonId/end',
    adminLimiter,
    SeasonValidation.validateSeasonId(),
    SeasonValidation.validateEndSeason(),
    SeasonController.endSeason
);

/**
 * @route PUT /api/seasons/:seasonId
 * @desc Update season details (Admin only)
 * @access Admin
 */
router.put('/:seasonId',
    adminLimiter,
    SeasonValidation.validateSeasonId(),
    SeasonValidation.validateUpdateSeason(),
    SeasonController.updateSeason
);

/**
 * @route DELETE /api/seasons/:seasonId
 * @desc Delete a season (Admin only)
 * @access Admin
 */
router.delete('/:seasonId',
    adminLimiter,
    SeasonValidation.validateSeasonId(),
    SeasonController.deleteSeason
);

/**
 * @route POST /api/seasons/process-transitions
 * @desc Process scheduled season transitions (Internal API)
 * @access Internal
 */
router.post('/process-transitions',
    adminLimiter,
    SeasonController.processSeasonTransitions
);

module.exports = router;