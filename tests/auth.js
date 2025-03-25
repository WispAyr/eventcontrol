require('total.js').test(true);

const assert = require('assert');
const User = require('../models/user').User;
const db = require('../services/database');
const email = require('../services/email');

// Mock email service to prevent actual emails during tests
email.sendWelcome = () => Promise.resolve();
email.sendPasswordReset = () => Promise.resolve();
email.sendPasswordChanged = () => Promise.resolve();

// Test data
const testUser = {
    username: 'testuser',
    email: 'test@example.com',
    password: 'Test123!',
    firstName: 'Test',
    lastName: 'User',
    role: 'user'
};

// Helper function to create test user
async function createTestUser() {
    const user = new User(testUser);
    await user.hashPassword();
    return await db.createUser(user.toDatabase());
}

// Helper function to cleanup test data
async function cleanup() {
    const user = await db.findUserByUsername(testUser.username);
    if (user) {
        await db.deleteUser(user.id);
    }
}

// Test suite
ASYNC('Authentication Tests', function*() {
    try {
        // Setup
        yield cleanup();

        // Test user registration
        TEST('User Registration', function*() {
            const res = yield TEST.request('/api/auth/register')
                .post(testUser)
                .json();

            assert.strictEqual(res.status, 'success', 'Registration should succeed');
            assert.ok(res.data.user, 'Response should include user data');
            assert.ok(res.data.token, 'Response should include auth token');
            assert.strictEqual(res.data.user.username, testUser.username, 'Username should match');
            assert.strictEqual(res.data.user.email, testUser.email, 'Email should match');
            assert.ok(!res.data.user.password, 'Password should not be included in response');
        });

        // Test user login
        TEST('User Login', function*() {
            const res = yield TEST.request('/api/auth/login')
                .post({
                    username: testUser.username,
                    password: testUser.password
                })
                .json();

            assert.strictEqual(res.status, 'success', 'Login should succeed');
            assert.ok(res.data.user, 'Response should include user data');
            assert.ok(res.data.token, 'Response should include auth token');
        });

        // Test invalid login
        TEST('Invalid Login', function*() {
            const res = yield TEST.request('/api/auth/login')
                .post({
                    username: testUser.username,
                    password: 'wrongpassword'
                })
                .json();

            assert.strictEqual(res.status, 'error', 'Login should fail');
            assert.strictEqual(res.message, 'Invalid credentials');
        });

        // Test password reset request
        TEST('Password Reset Request', function*() {
            const res = yield TEST.request('/api/auth/forgot-password')
                .post({
                    email: testUser.email
                })
                .json();

            assert.strictEqual(res.status, 'success', 'Password reset request should succeed');
            assert.strictEqual(
                res.message,
                'If the email exists, password reset instructions will be sent',
                'Should return generic message'
            );

            // Verify reset token was generated
            const user = yield db.findUserByEmail(testUser.email);
            assert.ok(user.passwordResetToken, 'Reset token should be set');
            assert.ok(user.passwordResetExpires, 'Reset token expiry should be set');
        });

        // Test password reset with invalid token
        TEST('Invalid Password Reset', function*() {
            const res = yield TEST.request('/api/auth/reset-password')
                .post({
                    token: 'invalidtoken',
                    password: 'NewTest123!'
                })
                .json();

            assert.strictEqual(res.status, 'error', 'Password reset should fail');
            assert.strictEqual(res.message, 'Invalid or expired reset token');
        });

        // Test password reset with valid token
        TEST('Valid Password Reset', function*() {
            // Get valid reset token
            const user = yield db.findUserByEmail(testUser.email);
            const token = user.passwordResetToken;

            const res = yield TEST.request('/api/auth/reset-password')
                .post({
                    token,
                    password: 'NewTest123!'
                })
                .json();

            assert.strictEqual(res.status, 'success', 'Password reset should succeed');
            assert.strictEqual(res.message, 'Password successfully reset');

            // Verify token was cleared
            const updatedUser = yield db.findUserByEmail(testUser.email);
            assert.ok(!updatedUser.passwordResetToken, 'Reset token should be cleared');
            assert.ok(!updatedUser.passwordResetExpires, 'Reset token expiry should be cleared');
        });

        // Test authenticated routes
        TEST('Protected Routes', function*() {
            // Login to get token
            const loginRes = yield TEST.request('/api/auth/login')
                .post({
                    username: testUser.username,
                    password: 'NewTest123!'
                })
                .json();

            const token = loginRes.data.token;

            // Test profile access
            const profileRes = yield TEST.request('/api/auth/profile')
                .header('Authorization', `Bearer ${token}`)
                .get()
                .json();

            assert.strictEqual(profileRes.status, 'success', 'Profile access should succeed');
            assert.ok(profileRes.data.user, 'Response should include user data');

            // Test profile update
            const updateRes = yield TEST.request('/api/auth/profile')
                .header('Authorization', `Bearer ${token}`)
                .put({
                    firstName: 'Updated',
                    lastName: 'Name'
                })
                .json();

            assert.strictEqual(updateRes.status, 'success', 'Profile update should succeed');
            assert.strictEqual(updateRes.data.user.firstName, 'Updated', 'First name should be updated');
            assert.strictEqual(updateRes.data.user.lastName, 'Name', 'Last name should be updated');
        });

        // Test logout
        TEST('User Logout', function*() {
            const res = yield TEST.request('/api/auth/logout')
                .post()
                .json();

            assert.strictEqual(res.status, 'success', 'Logout should succeed');
            assert.strictEqual(res.message, 'Successfully logged out');
        });

    } finally {
        // Cleanup
        yield cleanup();
    }
}); 