module.exports = {
    testEnvironment: 'node',
    collectCoverage: true,
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    collectCoverageFrom: [
        'server.js',
        '**/*.js',
        '!node_modules/**',
        '!coverage/**',
        '!jest.config.js',
        '!healthcheck.js',
        '!public/**'
    ],
    testMatch: [
        '**/tests/**/*.test.js',
        '**/__tests__/**/*.js',
        '**/?(*.)+(spec|test).js'
    ],
    verbose: true,
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};