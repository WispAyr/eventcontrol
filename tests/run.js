require('total.js').test(true);

const logger = require('../utils/logger');
const sentry = require('../utils/sentry');
const db = require('../services/database');

// Configure test environment
process.env.NODE_ENV = 'test';

// Test statistics tracking
const stats = {
    suites: new Set(),
    tests: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
    },
    coverage: {
        files: new Set(),
        lines: {
            total: 0,
            covered: 0
        },
        branches: {
            total: 0,
            covered: 0
        },
        functions: {
            total: 0,
            covered: 0
        },
        statements: {
            total: 0,
            covered: 0
        }
    },
    startTime: null,
    endTime: null
};

// Track test execution
global.TEST = function(name, fn) {
    stats.suites.add(name);
    stats.tests.total++;
    
    try {
        fn();
        stats.tests.passed++;
    } catch (error) {
        stats.tests.failed++;
        logger.error(`Test failed: ${name}`, { error });
        throw error;
    }
};

// Skip test helper
global.TEST.skip = function(name, fn) {
    stats.tests.skipped++;
    logger.info(`Skipping test: ${name}`);
};

// Initialize services
async function init() {
    stats.startTime = Date.now();

    try {
        // Initialize database
        await db.init();
        logger.info('Test database initialized');

        // Run tests in sequence
        require('./auth');         // Authentication tests
        require('./event');        // Event model tests
        require('./api-event');    // Event API tests
        require('./integration');  // Integration tests
        require('./e2e');         // End-to-end tests
        
        // Run intensive tests last
        logger.info('Starting load tests...');
        require('./load');        // Load tests
        
        logger.info('Starting security tests...');
        require('./security');    // Security tests

        logger.info('Starting accessibility tests...');
        require('./accessibility'); // Accessibility tests

        logger.info('Starting cross-browser tests...');
        require('./cross-browser'); // Cross-browser tests

        stats.endTime = Date.now();

        // Log test completion and coverage
        process.on('exit', () => {
            const duration = stats.endTime - stats.startTime;
            const coverage = TEST.statistics.coverage || {};

            logger.info('Test Run Summary', {
                duration: `${duration}ms`,
                suites: stats.suites.size,
                tests: {
                    total: stats.tests.total,
                    passed: stats.tests.passed,
                    failed: stats.tests.failed,
                    skipped: stats.tests.skipped,
                    passRate: `${((stats.tests.passed / stats.tests.total) * 100).toFixed(2)}%`
                },
                coverage: {
                    lines: coverage.lines || 0,
                    branches: coverage.branches || 0,
                    functions: coverage.functions || 0,
                    statements: coverage.statements || 0
                }
            });

            // Check if coverage thresholds are met
            const thresholds = {
                lines: 85,
                branches: 80,
                functions: 85,
                statements: 85
            };

            const failedThresholds = Object.entries(thresholds)
                .filter(([metric, threshold]) => (coverage[metric] || 0) < threshold);

            if (failedThresholds.length > 0) {
                logger.warn('Coverage thresholds not met:', {
                    failedMetrics: failedThresholds.map(([metric, threshold]) => ({
                        metric,
                        threshold: `${threshold}%`,
                        actual: `${coverage[metric] || 0}%`
                    }))
                });
            }

            // Exit with appropriate code
            const hasFailures = stats.tests.failed > 0 || failedThresholds.length > 0;
            process.exit(hasFailures ? 1 : 0);
        });

    } catch (error) {
        logger.error('Failed to initialize test environment', error);
        sentry.captureException(error);
        process.exit(1);
    }
}

// Run tests
init(); 