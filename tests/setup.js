// Jest setup file
// Add any global test configuration here

// Mock console methods to reduce noise during testing
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

// Mock timers if needed for time-based tests
jest.useFakeTimers();

// Global test timeout
jest.setTimeout(10000);