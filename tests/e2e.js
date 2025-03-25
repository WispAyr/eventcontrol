require('total.js').test(true);

const assert = require('assert');
const { Event, EventType, EventStatus, EventPriority } = require('../models/event');
const { User } = require('../models/user');
const db = require('../services/database');
const email = require('../services/email');

// Test data
const manager = {
    username: 'e2e_manager',
    email: 'e2e_manager@example.com',
    password: 'Manager123!',
    firstName: 'E2E',
    lastName: 'Manager',
    role: 'manager'
};

const participant = {
    username: 'e2e_participant',
    email: 'e2e_participant@example.com',
    password: 'Part123!',
    firstName: 'E2E',
    lastName: 'Participant',
    role: 'user'
};

const testEvent = {
    name: 'E2E Test Event',
    description: 'Test event for E2E testing',
    type: EventType.PLANNED,
    priority: EventPriority.HIGH,
    location: {
        what3words: 'filled.count.soap',
        coordinates: [-0.1276, 51.5072]
    },
    startDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    endDate: new Date(Date.now() + 172800000).toISOString(),  // Day after tomorrow
    venue: 'E2E Test Venue',
    tags: ['e2e', 'test'],
    metadata: {
        maxParticipants: 10,
        requiresRegistration: true
    }
};

// Track notifications
const notifications = {
    emails: [],
    websocket: []
};

// Mock email service
email.sendWelcome = (user) => {
    notifications.emails.push({ type: 'welcome', user: user.email });
    return Promise.resolve();
};

email.sendPasswordReset = (user, token) => {
    notifications.emails.push({ type: 'reset', user: user.email, token });
    return Promise.resolve();
};

email.sendEventInvitation = (user, event) => {
    notifications.emails.push({ type: 'invitation', user: user.email, event: event.id });
    return Promise.resolve();
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
    const users = [manager.username, participant.username];
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
    notifications.emails = [];
    notifications.websocket = [];
}

// E2E Test Suites
ASYNC('E2E Tests', function*() {
    let managerToken;
    let participantToken;
    let eventId;

    try {
        // Initial cleanup
        yield cleanup();

        // Complete user registration and authentication flow
        TEST('User Registration and Authentication Flow', function*() {
            // Register manager
            const managerData = yield registerUser(manager);
            assert.ok(managerData.token, 'Manager should receive auth token');
            
            // Verify welcome email
            const managerWelcome = notifications.emails.find(n => n.type === 'welcome' && n.user === manager.email);
            assert.ok(managerWelcome, 'Manager should receive welcome email');

            // Register participant
            const participantData = yield registerUser(participant);
            assert.ok(participantData.token, 'Participant should receive auth token');

            // Login both users
            managerToken = yield loginUser(manager.username, manager.password);
            participantToken = yield loginUser(participant.username, participant.password);
        });

        // Complete event management workflow
        TEST('Event Management Workflow', function*() {
            // Create event
            const createRes = yield TEST.request('/api/events')
                .header('Authorization', `Bearer ${managerToken}`)
                .post(testEvent)
                .json();

            assert.strictEqual(createRes.status, 'success', 'Event creation should succeed');
            eventId = createRes.data.event.id;

            // Update event details
            const updateRes = yield TEST.request(`/api/events/${eventId}`)
                .header('Authorization', `Bearer ${managerToken}`)
                .put({
                    ...createRes.data.event,
                    description: 'Updated description for E2E test',
                    metadata: {
                        ...createRes.data.event.metadata,
                        maxParticipants: 15
                    }
                })
                .json();

            assert.strictEqual(updateRes.status, 'success', 'Event update should succeed');
            assert.strictEqual(updateRes.data.event.metadata.maxParticipants, 15, 'Event update should reflect new values');

            // Add participant
            const addParticipantRes = yield TEST.request(`/api/events/${eventId}`)
                .header('Authorization', `Bearer ${managerToken}`)
                .put({
                    ...updateRes.data.event,
                    participants: [participant.username]
                })
                .json();

            assert.strictEqual(addParticipantRes.status, 'success', 'Adding participant should succeed');

            // Verify participant invitation email
            const invitationEmail = notifications.emails.find(
                n => n.type === 'invitation' && 
                n.user === participant.email && 
                n.event === eventId
            );
            assert.ok(invitationEmail, 'Participant should receive invitation email');

            // Participant views event
            const viewRes = yield TEST.request(`/api/events/${eventId}`)
                .header('Authorization', `Bearer ${participantToken}`)
                .get()
                .json();

            assert.strictEqual(viewRes.status, 'success', 'Participant should be able to view event');
            assert.ok(viewRes.data.event.participants.includes(participant.username), 'Participant should be listed');
        });

        // Complete event status workflow
        TEST('Event Status Workflow', function*() {
            const statusFlow = [
                EventStatus.DRAFT,
                EventStatus.PLANNED,
                EventStatus.ACTIVE,
                EventStatus.COMPLETED
            ];

            for (const status of statusFlow) {
                const updateRes = yield TEST.request(`/api/events/${eventId}/status`)
                    .header('Authorization', `Bearer ${managerToken}`)
                    .patch({ status })
                    .json();

                assert.strictEqual(updateRes.status, 'success', `Status update to ${status} should succeed`);
                assert.strictEqual(updateRes.data.event.status, status, `Event status should be ${status}`);

                // Verify participant cannot change status
                const participantUpdateRes = yield TEST.request(`/api/events/${eventId}/status`)
                    .header('Authorization', `Bearer ${participantToken}`)
                    .patch({ status: EventStatus.CANCELLED })
                    .json();

                assert.strictEqual(participantUpdateRes.status, 'error', 'Participant should not be able to change status');
            }
        });

        // Test search and filtering
        TEST('Event Search and Filtering', function*() {
            // Create additional events for testing search
            const additionalEvents = [
                { ...testEvent, name: 'E2E Search Test 1', priority: EventPriority.LOW },
                { ...testEvent, name: 'E2E Search Test 2', priority: EventPriority.MEDIUM },
                { ...testEvent, name: 'Different Event', priority: EventPriority.HIGH }
            ];

            for (const event of additionalEvents) {
                yield TEST.request('/api/events')
                    .header('Authorization', `Bearer ${managerToken}`)
                    .post(event)
                    .json();
            }

            // Test search by name
            const searchRes = yield TEST.request('/api/events')
                .header('Authorization', `Bearer ${managerToken}`)
                .query({ search: 'E2E Search' })
                .get()
                .json();

            assert.strictEqual(searchRes.status, 'success', 'Search should succeed');
            assert.strictEqual(searchRes.data.events.length, 2, 'Should find 2 matching events');

            // Test filtering by priority
            const filterRes = yield TEST.request('/api/events')
                .header('Authorization', `Bearer ${managerToken}`)
                .query({ priority: EventPriority.HIGH })
                .get()
                .json();

            assert.strictEqual(filterRes.status, 'success', 'Filter should succeed');
            assert.ok(filterRes.data.events.every(e => e.priority === EventPriority.HIGH), 'All events should be HIGH priority');

            // Test pagination
            const pageRes = yield TEST.request('/api/events')
                .header('Authorization', `Bearer ${managerToken}`)
                .query({ page: 1, limit: 2 })
                .get()
                .json();

            assert.strictEqual(pageRes.status, 'success', 'Pagination should succeed');
            assert.strictEqual(pageRes.data.events.length, 2, 'Should return 2 events per page');
            assert.ok(pageRes.data.pagination, 'Should include pagination info');
        });

    } finally {
        // Cleanup
        yield cleanup();
    }
}); 