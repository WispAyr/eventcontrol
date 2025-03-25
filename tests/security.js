require('total.js').test(true);

const assert = require('assert');
const crypto = require('crypto');
const { User } = require('../models/user');
const { Event } = require('../models/event');
const db = require('../services/database');
const logger = require('../utils/logger');

// Test data
const testUser = {
    username: 'security_test_user',
    email: 'security@test.com',
    password: 'SecurePass123!',
    firstName: 'Security',
    lastName: 'Tester',
    role: 'user'
};

const adminUser = {
    username: 'security_test_admin',
    email: 'security_admin@test.com',
    password: 'AdminPass123!',
    firstName: 'Security',
    lastName: 'Admin',
    role: 'admin'
};

// Security test helpers
function generateRandomString(length) {
    return crypto.randomBytes(Math.ceil(length / 2))
        .toString('hex')
        .slice(0, length);
}

function generateSQLInjectionAttempts() {
    return [
        "' OR '1'='1",
        "'; DROP TABLE users; --",
        "' UNION SELECT * FROM users; --",
        "admin'--",
        "' OR 1=1; --",
        "'; TRUNCATE TABLE events; --"
    ];
}

function generateXSSAttempts() {
    return [
        "<script>alert('xss')</script>",
        "<img src='x' onerror='alert(1)'>",
        "javascript:alert(1)",
        "<svg onload='alert(1)'>",
        "'-alert(1)-'",
        "<a href='javascript:alert(1)'>click me</a>"
    ];
}

function generateNoSQLInjectionAttempts() {
    return [
        { $gt: "" },
        { $ne: null },
        { username: { $ne: "invalid" } },
        { $where: "function() { return true; }" }
    ];
}

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
    const users = [testUser.username, adminUser.username];
    for (const username of users) {
        const user = await db.findUserByUsername(username);
        if (user) {
            const events = await db.findEvents({ createdBy: user.id });
            for (const event of events.events) {
                await db.deleteEvent(event.id);
            }
            await db.deleteUser(user.id);
        }
    }
}

// Security Test Suites
ASYNC('Security Tests', function*() {
    let userToken;
    let adminToken;

    try {
        // Initial cleanup
        yield cleanup();

        // Authentication Security
        TEST('Authentication Security', function*() {
            // Test password requirements
            const weakPasswords = [
                'short',
                '12345678',
                'password',
                'letmein',
                'qwerty123',
                'abcd1234'
            ];

            for (const password of weakPasswords) {
                const res = yield TEST.request('/api/auth/register')
                    .post({ ...testUser, password })
                    .json();
                assert.strictEqual(res.status, 'error', `Weak password "${password}" should be rejected`);
            }

            // Test brute force protection
            const attempts = 10;
            const bruteForcePromises = Array(attempts).fill().map(() =>
                TEST.request('/api/auth/login')
                    .post({
                        username: testUser.username,
                        password: 'wrongpassword'
                    })
                    .json()
            );

            const results = yield Promise.all(bruteForcePromises);
            const lastAttempt = yield TEST.request('/api/auth/login')
                .post({
                    username: testUser.username,
                    password: 'wrongpassword'
                })
                .json();

            assert.strictEqual(lastAttempt.status, 'error', 'Should be rate limited after multiple failed attempts');
        });

        // Register test users
        const userData = yield registerUser(testUser);
        const adminData = yield registerUser(adminUser);
        userToken = yield loginUser(testUser.username, testUser.password);
        adminToken = yield loginUser(adminUser.username, adminUser.password);

        // Authorization Security
        TEST('Authorization Security', function*() {
            // Create an event as admin
            const createRes = yield TEST.request('/api/events')
                .header('Authorization', `Bearer ${adminToken}`)
                .post({
                    name: 'Security Test Event',
                    description: 'Test event for security testing',
                    startDate: new Date().toISOString(),
                    endDate: new Date(Date.now() + 86400000).toISOString()
                })
                .json();

            const eventId = createRes.data.event.id;

            // Test unauthorized access
            const unauthorizedPromises = [
                // Try to update event without token
                TEST.request(`/api/events/${eventId}`)
                    .put({ name: 'Hacked Event' })
                    .json(),
                // Try to delete event with user token
                TEST.request(`/api/events/${eventId}`)
                    .header('Authorization', `Bearer ${userToken}`)
                    .delete()
                    .json(),
                // Try to change event status with user token
                TEST.request(`/api/events/${eventId}/status`)
                    .header('Authorization', `Bearer ${userToken}`)
                    .patch({ status: 'CANCELLED' })
                    .json()
            ];

            const results = yield Promise.all(unauthorizedPromises);
            assert.ok(results.every(r => r.status === 'error'), 'Unauthorized actions should be rejected');
        });

        // Input Validation Security
        TEST('Input Validation Security', function*() {
            // Test SQL Injection prevention
            const sqlInjections = generateSQLInjectionAttempts();
            for (const injection of sqlInjections) {
                const res = yield TEST.request('/api/auth/login')
                    .post({
                        username: injection,
                        password: injection
                    })
                    .json();
                assert.strictEqual(res.status, 'error', 'SQL injection attempt should be rejected');
            }

            // Test XSS prevention
            const xssAttempts = generateXSSAttempts();
            for (const xss of xssAttempts) {
                const res = yield TEST.request('/api/events')
                    .header('Authorization', `Bearer ${adminToken}`)
                    .post({
                        name: xss,
                        description: xss,
                        startDate: new Date().toISOString(),
                        endDate: new Date(Date.now() + 86400000).toISOString()
                    })
                    .json();
                
                if (res.status === 'success') {
                    const event = res.data.event;
                    assert.notStrictEqual(event.name, xss, 'XSS content should be sanitized');
                    assert.notStrictEqual(event.description, xss, 'XSS content should be sanitized');
                }
            }

            // Test NoSQL Injection prevention
            const noSqlInjections = generateNoSQLInjectionAttempts();
            for (const injection of noSqlInjections) {
                const res = yield TEST.request('/api/events')
                    .header('Authorization', `Bearer ${adminToken}`)
                    .query(injection)
                    .get()
                    .json();
                assert.strictEqual(res.status, 'error', 'NoSQL injection attempt should be rejected');
            }
        });

        // Session Security
        TEST('Session Security', function*() {
            // Test token expiration
            const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyIsInVzZXJuYW1lIjoidGVzdCIsImlhdCI6MTUxNjIzOTAyMiwiZXhwIjoxNTE2MjM5MDIyfQ.1234567890';
            
            const expiredRes = yield TEST.request('/api/events')
                .header('Authorization', `Bearer ${expiredToken}`)
                .get()
                .json();
            
            assert.strictEqual(expiredRes.status, 'error', 'Expired token should be rejected');

            // Test token invalidation after password change
            yield TEST.request('/api/auth/change-password')
                .header('Authorization', `Bearer ${userToken}`)
                .post({
                    currentPassword: testUser.password,
                    newPassword: 'NewSecurePass123!'
                })
                .json();

            const oldTokenRes = yield TEST.request('/api/events')
                .header('Authorization', `Bearer ${userToken}`)
                .get()
                .json();

            assert.strictEqual(oldTokenRes.status, 'error', 'Old token should be invalid after password change');
        });

        // Headers Security
        TEST('Headers Security', function*() {
            const res = yield TEST.request('/api/events')
                .header('Authorization', `Bearer ${adminToken}`)
                .get();

            // Check security headers
            const headers = res.headers;
            assert.ok(headers['x-frame-options'], 'Should have X-Frame-Options header');
            assert.ok(headers['x-xss-protection'], 'Should have X-XSS-Protection header');
            assert.ok(headers['x-content-type-options'], 'Should have X-Content-Type-Options header');
            assert.ok(headers['strict-transport-security'], 'Should have HSTS header');
            assert.ok(headers['content-security-policy'], 'Should have CSP header');
        });

    } finally {
        // Cleanup
        yield cleanup();
    }
}); 