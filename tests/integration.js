require('total.js').test(true);

const assert = require('assert');
const { Event, EventType, EventStatus, EventPriority } = require('../models/event');
const { User } = require('../models/user');
const db = require('../services/database');
const email = require('../services/email');

// Test data
const testUsers = [
    {
        username: 'eventmanager',
        email: 'manager@example.com',
        password: 'Manager123!',
        firstName: 'Event',
        lastName: 'Manager',
        role: 'manager'
    },
    {
        username: 'participant',
        email: 'participant@example.com',
        password: 'Part123!',
        firstName: 'Test',
        lastName: 'Participant',
        role: 'user'
    }
];

const testEvent = {
    name: 'Integration Test Event',
    description: 'Test event for integration testing',
    type: EventType.PLANNED,
    priority: EventPriority.HIGH,
    location: {
        what3words: 'filled.count.soap',
        coordinates: [-0.1276, 51.5072]
    },
    startDate: '2024-03-01T09:00:00Z',
    endDate: '2024-03-01T17:00:00Z',
    venue: 'Test Venue',
    tags: ['integration', 'test'],
    metadata: {
        maxParticipants: 10,
        requiresRegistration: true
    }
};

// Track email notifications
const emailNotifications = [];
email.sendWelcome = (user) => {
    emailNotifications.push({ type: 'welcome', user: user.email });
    return Promise.resolve();
};
email.sendPasswordReset = (user, token) => {
    emailNotifications.push({ type: 'reset', user: user.email, token });
    return Promise.resolve();
};

// Helper functions
async function createTestUsers() {
    const users = [];
    for (const userData of testUsers) {
        const user = new User(userData);
        await user.hashPassword();
        users.push(await db.createUser(user.toDatabase()));
    }
    return users;
}

async function getAuthToken(username, password) {
    const res = await TEST.request('/api/auth/login')
        .post({ username, password })
        .json();
    return res.data.token;
}

async function cleanup() {
    for (const userData of testUsers) {
        const user = await db.findUserByUsername(userData.username);
        if (user) {
            const events = await db.findEvents({ createdBy: user.id });
            for (const event of events.events) {
                await db.deleteEvent(event.id);
            }
            await db.deleteUser(user.id);
        }
    }
    emailNotifications.length = 0;
}

// Test suite
ASYNC('Integration Tests', function*() {
    let managerToken;
    let participantToken;
    let eventId;
    let users;

    try {
        // Setup
        yield cleanup();
        users = yield createTestUsers();
        managerToken = yield getAuthToken(testUsers[0].username, testUsers[0].password);
        participantToken = yield getAuthToken(testUsers[1].username, testUsers[1].password);

        // Test user registration flow
        TEST('User Registration Flow', function*() {
            const newUser = {
                username: 'newuser',
                email: 'new@example.com',
                password: 'NewUser123!',
                firstName: 'New',
                lastName: 'User'
            };

            // Register user
            const registerRes = yield TEST.request('/api/auth/register')
                .post(newUser)
                .json();

            assert.strictEqual(registerRes.status, 'success', 'Registration should succeed');
            assert.ok(registerRes.data.token, 'Should receive auth token');

            // Verify welcome email
            const welcomeEmail = emailNotifications.find(n => n.type === 'welcome' && n.user === newUser.email);
            assert.ok(welcomeEmail, 'Welcome email should be sent');

            // Clean up new user
            const user = yield db.findUserByUsername(newUser.username);
            if (user) yield db.deleteUser(user.id);
        });

        // Test event creation and participant management
        TEST('Event Creation and Participant Management', function*() {
            // Create event as manager
            const createRes = yield TEST.request('/api/events')
                .header('Authorization', `Bearer ${managerToken}`)
                .post(testEvent)
                .json();

            assert.strictEqual(createRes.status, 'success', 'Event creation should succeed');
            eventId = createRes.data.event.id;

            // Add participant
            const addParticipantRes = yield TEST.request(`/api/events/${eventId}`)
                .header('Authorization', `Bearer ${managerToken}`)
                .put({
                    ...createRes.data.event,
                    participants: [testUsers[1].username]
                })
                .json();

            assert.strictEqual(addParticipantRes.status, 'success', 'Adding participant should succeed');
            assert.ok(addParticipantRes.data.event.participants.includes(testUsers[1].username), 'Participant should be added');

            // Verify participant can view event
            const participantViewRes = yield TEST.request(`/api/events/${eventId}`)
                .header('Authorization', `Bearer ${participantToken}`)
                .get()
                .json();

            assert.strictEqual(participantViewRes.status, 'success', 'Participant should be able to view event');
        });

        // Test event status workflow
        TEST('Event Status Workflow', function*() {
            // Manager activates event
            const activateRes = yield TEST.request(`/api/events/${eventId}/status`)
                .header('Authorization', `Bearer ${managerToken}`)
                .patch({ status: EventStatus.ACTIVE })
                .json();

            assert.strictEqual(activateRes.status, 'success', 'Event activation should succeed');
            assert.strictEqual(activateRes.data.event.status, EventStatus.ACTIVE, 'Event should be active');

            // Participant cannot change event status
            const participantUpdateRes = yield TEST.request(`/api/events/${eventId}/status`)
                .header('Authorization', `Bearer ${participantToken}`)
                .patch({ status: EventStatus.COMPLETED })
                .json();

            assert.strictEqual(participantUpdateRes.status, 'error', 'Participant should not be able to change status');
        });

        // Test password reset flow
        TEST('Password Reset Flow', function*() {
            // Request password reset
            const resetReq = yield TEST.request('/api/auth/forgot-password')
                .post({ email: testUsers[1].email })
                .json();

            assert.strictEqual(resetReq.status, 'success', 'Password reset request should succeed');

            // Verify reset email
            const resetEmail = emailNotifications.find(n => n.type === 'reset' && n.user === testUsers[1].email);
            assert.ok(resetEmail, 'Reset email should be sent');
            assert.ok(resetEmail.token, 'Reset email should contain token');

            // Reset password
            const resetRes = yield TEST.request('/api/auth/reset-password')
                .post({
                    token: resetEmail.token,
                    password: 'NewPass123!'
                })
                .json();

            assert.strictEqual(resetRes.status, 'success', 'Password reset should succeed');

            // Login with new password
            const loginRes = yield TEST.request('/api/auth/login')
                .post({
                    username: testUsers[1].username,
                    password: 'NewPass123!'
                })
                .json();

            assert.strictEqual(loginRes.status, 'success', 'Login with new password should succeed');
        });

        // Test concurrent operations
        TEST('Concurrent Operations', function*() {
            // Create multiple events concurrently
            const createPromises = Array(5).fill().map((_, i) => 
                TEST.request('/api/events')
                    .header('Authorization', `Bearer ${managerToken}`)
                    .post({
                        ...testEvent,
                        name: `Concurrent Event ${i + 1}`
                    })
                    .json()
            );

            const results = yield Promise.all(createPromises);
            assert.strictEqual(results.length, 5, 'All concurrent creations should complete');
            assert.ok(results.every(r => r.status === 'success'), 'All creations should succeed');

            // Clean up concurrent events
            for (const result of results) {
                yield db.deleteEvent(result.data.event.id);
            }
        });

    } finally {
        // Cleanup
        yield cleanup();
    }
}); 