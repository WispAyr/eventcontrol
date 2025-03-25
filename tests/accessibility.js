require('total.js').test(true);

const assert = require('assert');
const { AxePuppeteer } = require('@axe-core/puppeteer');
const puppeteer = require('puppeteer');
const logger = require('../utils/logger');
const { User } = require('../models/user');
const db = require('../services/database');

// Test data
const testUser = {
    username: 'a11y_test_user',
    email: 'a11y@test.com',
    password: 'AccessTest123!',
    firstName: 'A11y',
    lastName: 'Tester',
    role: 'user'
};

// Test pages to check
const pagesToTest = [
    { path: '/', name: 'Home Page' },
    { path: '/login', name: 'Login Page' },
    { path: '/register', name: 'Registration Page' },
    { path: '/events', name: 'Events List' },
    { path: '/events/new', name: 'Create Event' },
    { path: '/profile', name: 'User Profile' }
];

// WCAG success criteria to test
const wcagRules = {
    'wcag2a': { level: 'A', description: 'WCAG 2.0 Level A' },
    'wcag2aa': { level: 'AA', description: 'WCAG 2.0 Level AA' },
    'wcag21a': { level: 'A', description: 'WCAG 2.1 Level A' },
    'wcag21aa': { level: 'AA', description: 'WCAG 2.1 Level AA' }
};

// Helper functions
async function registerUser(userData) {
    const res = await TEST.request('/api/auth/register')
        .post(userData)
        .json();
    assert.strictEqual(res.status, 'success', 'User registration should succeed');
    return res.data;
}

async function loginUser(username, password) {
    const res = await TEST.request('/api/auth/login')
        .post({ username, password })
        .json();
    assert.strictEqual(res.status, 'success', 'User login should succeed');
    return res.data.token;
}

async function cleanup() {
    const user = await db.findUserByUsername(testUser.username);
    if (user) {
        await db.deleteUser(user.id);
    }
}

// Accessibility test suite
ASYNC('Accessibility Tests', function*() {
    let browser;
    let page;
    let userToken;
    const violations = new Map();

    try {
        // Initial cleanup
        yield cleanup();

        // Register test user
        const userData = yield registerUser(testUser);
        userToken = yield loginUser(testUser.username, testUser.password);

        // Launch browser
        browser = yield puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        page = yield browser.newPage();

        // Set viewport for consistent testing
        yield page.setViewport({
            width: 1280,
            height: 720,
            deviceScaleFactor: 1
        });

        // Test each page
        for (const { path, name } of pagesToTest) {
            TEST(`Accessibility Test: ${name}`, function*() {
                // Navigate to page
                yield page.goto(`http://localhost:${F.port}${path}`, {
                    waitUntil: 'networkidle0'
                });

                // Set auth token if needed
                if (path !== '/login' && path !== '/register') {
                    yield page.setExtraHTTPHeaders({
                        'Authorization': `Bearer ${userToken}`
                    });
                }

                // Run axe analysis
                const results = yield new AxePuppeteer(page).analyze();

                // Process violations
                if (results.violations.length > 0) {
                    violations.set(name, results.violations);
                    
                    // Log violations
                    logger.warn(`Accessibility violations found in ${name}:`, {
                        pageUrl: path,
                        violationCount: results.violations.length,
                        violations: results.violations.map(v => ({
                            impact: v.impact,
                            description: v.description,
                            helpUrl: v.helpUrl,
                            nodes: v.nodes.length
                        }))
                    });
                }

                // Check WCAG compliance levels
                for (const [standard, info] of Object.entries(wcagRules)) {
                    const standardViolations = results.violations.filter(v => 
                        v.tags.includes(standard)
                    );

                    // Assert based on severity
                    if (info.level === 'A') {
                        // Level A violations are critical and should fail the test
                        assert.strictEqual(
                            standardViolations.length,
                            0,
                            `${name} has ${standardViolations.length} WCAG ${info.description} violations`
                        );
                    } else {
                        // Level AA violations should warn but not fail
                        if (standardViolations.length > 0) {
                            logger.warn(`${name} has ${standardViolations.length} WCAG ${info.description} violations`);
                        }
                    }
                }

                // Test specific components
                yield TEST.promise('Form Accessibility', function*() {
                    const forms = yield page.$$('form');
                    for (const form of forms) {
                        // Check form labels
                        const inputs = yield form.$$('input, select, textarea');
                        for (const input of inputs) {
                            const hasLabel = yield page.evaluate(el => {
                                const id = el.id;
                                return id ? !!document.querySelector(`label[for="${id}"]`) : false;
                            }, input);
                            assert.ok(hasLabel, 'All form inputs should have associated labels');
                        }

                        // Check ARIA attributes
                        const hasValidAria = yield page.evaluate(form => {
                            const required = form.querySelectorAll('[required]');
                            return Array.from(required).every(el => 
                                el.getAttribute('aria-required') === 'true'
                            );
                        }, form);
                        assert.ok(hasValidAria, 'Required fields should have proper ARIA attributes');
                    }
                });

                // Test keyboard navigation
                yield TEST.promise('Keyboard Navigation', function*() {
                    const focusableElements = yield page.$$('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
                    
                    for (const element of focusableElements) {
                        // Check if element can receive focus
                        const canFocus = yield page.evaluate(el => {
                            el.focus();
                            return document.activeElement === el;
                        }, element);
                        
                        assert.ok(canFocus, 'All interactive elements should be focusable');
                        
                        // Check for visible focus indicators
                        const hasVisibleFocus = yield page.evaluate(el => {
                            el.focus();
                            const styles = window.getComputedStyle(el);
                            return styles.outlineStyle !== 'none' || 
                                   styles.boxShadow !== 'none' ||
                                   el.classList.contains('focus');
                        }, element);
                        
                        assert.ok(hasVisibleFocus, 'Focused elements should have visible indicators');
                    }
                });

                // Test color contrast
                yield TEST.promise('Color Contrast', function*() {
                    const contrastViolations = results.violations.filter(v => 
                        v.id === 'color-contrast'
                    );
                    
                    if (contrastViolations.length > 0) {
                        logger.warn(`${name} has ${contrastViolations.length} color contrast issues:`, {
                            elements: contrastViolations[0].nodes.map(n => ({
                                element: n.html,
                                foreground: n.target[0],
                                background: n.target[1]
                            }))
                        });
                    }
                });
            });
        }

        // Generate accessibility report
        if (violations.size > 0) {
            const reportPath = 'reports/accessibility.json';
            const report = {
                timestamp: new Date().toISOString(),
                summary: {
                    totalPages: pagesToTest.length,
                    pagesWithViolations: violations.size,
                    totalViolations: Array.from(violations.values())
                        .reduce((sum, v) => sum + v.length, 0)
                },
                details: Object.fromEntries(violations)
            };

            F.Fs.mkdir('reports', { recursive: true });
            F.Fs.writeFile(reportPath, JSON.stringify(report, null, 2));
            logger.info(`Accessibility report generated at ${reportPath}`);
        }

    } finally {
        // Cleanup
        if (browser) {
            yield browser.close();
        }
        yield cleanup();
    }
}); 