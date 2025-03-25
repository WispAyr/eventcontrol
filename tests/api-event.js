require('total.js').test(true);

const assert = require('assert');
const { Event, EventType, EventStatus, EventPriority } = require('../models/event');
const { User } = require('../models/user');
const db = require('../services/database');

// Test data
const testUser = {
    username: 'testuser',
    email: 'test@example.com',
    password: 'Test123!',
    firstName: 'Test',
    lastName: 'User',
    role: 'user'
};

const testEvent = {
    name: 'Test Event',
    description: 'Test event description',
    type: EventType.PLANNED,
    priority: EventPriority.HIGH,
    location: {
        what3words: 'filled.count.soap',
        coordinates: [-0.1276, 51.5072]
    },
    startDate: '2024-03-01T09:00:00Z',
    endDate: '2024-03-01T17:00:00Z',
    venue: 'Test Venue',
    participants: ['user1', 'user2'],
    tags: ['test', 'event'],
    metadata: {
        maxParticipants: 100,
        requiresRegistration: true
    }
};

// Helper functions
async function createTestUser() {
    const user = new User(testUser);
    await user.hashPassword();
    return await db.createUser(user.toDatabase());
}

async function getAuthToken() {
    const res = await TEST.request('/api/auth/login')
        .post({
            username: testUser.username,
            password: testUser.password
        })
        .json();
    return res.data.token;
}

async function cleanup() {
    // Clean up test user
    const user = await db.findUserByUsername(testUser.username);
    if (user) {
        // Clean up events created by test user
        const events = await db.findEvents({ createdBy: user.id });
        for (const event of events.events) {
            await db.deleteEvent(event.id);
        }
        // Delete test user
        await db.deleteUser(user.id);
    }
}

// Test suite
ASYNC('Event API Tests', function*() {
    let authToken;
    let createdEventId;

    try {
        // Setup
        yield cleanup();
        yield createTestUser();
        authToken = yield getAuthToken();

        // Test event creation
        TEST('Create Event', function*() {
            const res = yield TEST.request('/api/events')
                .header('Authorization', `Bearer ${authToken}`)
                .post(testEvent)
                .json();

            assert.strictEqual(res.status, 'success', 'Creation should succeed');
            assert.ok(res.data.event, 'Response should include event data');
            assert.strictEqual(res.data.event.name, testEvent.name, 'Event name should match');
            assert.strictEqual(res.data.event.status, EventStatus.DRAFT, 'Initial status should be DRAFT');

            createdEventId = res.data.event.id;
        });

        // Test event retrieval
        TEST('Get Event by ID', function*() {
            const res = yield TEST.request(`/api/events/${createdEventId}`)
                .header('Authorization', `Bearer ${authToken}`)
                .get()
                .json();

            assert.strictEqual(res.status, 'success', 'Retrieval should succeed');
            assert.ok(res.data.event, 'Response should include event data');
            assert.strictEqual(res.data.event.id, createdEventId, 'Event ID should match');
        });

        // Test event list with filters
        TEST('List Events with Filters', function*() {
            // Test various filter combinations
            const filters = [
                { type: EventType.PLANNED },
                { priority: EventPriority.HIGH },
                { venue: 'Test Venue' },
                { search: 'Test Event' },
                { tags: ['test'] },
                { sort: 'createdAt:desc' },
                { page: 1, limit: 5 }
            ];

            for (const filter of filters) {
                const queryString = Object.entries(filter)
                    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
                    .join('&');

                const res = yield TEST.request(`/api/events?${queryString}`)
                    .header('Authorization', `Bearer ${authToken}`)
                    .get()
                    .json();

                assert.strictEqual(res.status, 'success', 'List retrieval should succeed');
                assert.ok(Array.isArray(res.data.events), 'Response should include events array');
                assert.ok(res.data.pagination, 'Response should include pagination data');
            }
        });

        // Test event update
        TEST('Update Event', function*() {
            const updates = {
                name: 'Updated Test Event',
                description: 'Updated description',
                priority: EventPriority.CRITICAL
            };

            const res = yield TEST.request(`/api/events/${createdEventId}`)
                .header('Authorization', `Bearer ${authToken}`)
                .put(updates)
                .json();

            assert.strictEqual(res.status, 'success', 'Update should succeed');
            assert.strictEqual(res.data.event.name, updates.name, 'Name should be updated');
            assert.strictEqual(res.data.event.description, updates.description, 'Description should be updated');
            assert.strictEqual(res.data.event.priority, updates.priority, 'Priority should be updated');
        });

        // Test event status transitions
        TEST('Event Status Transitions', function*() {
            const transitions = [
                EventStatus.PLANNED,
                EventStatus.ACTIVE,
                EventStatus.PAUSED,
                EventStatus.COMPLETED
            ];

            for (const status of transitions) {
                const res = yield TEST.request(`/api/events/${createdEventId}/status`)
                    .header('Authorization', `Bearer ${authToken}`)
                    .patch({ status })
                    .json();

                assert.strictEqual(res.status, 'success', `Transition to ${status} should succeed`);
                assert.strictEqual(res.data.event.status, status, `Status should be updated to ${status}`);
            }
        });

        // Test invalid status transition
        TEST('Invalid Status Transition', function*() {
            const res = yield TEST.request(`/api/events/${createdEventId}/status`)
                .header('Authorization', `Bearer ${authToken}`)
                .patch({ status: EventStatus.DRAFT })
                .json();

            assert.strictEqual(res.status, 'error', 'Invalid transition should fail');
            assert.ok(res.message.includes('Invalid status transition'), 'Should return appropriate error message');
        });

        // Test event deletion
        TEST('Delete Event', function*() {
            const res = yield TEST.request(`/api/events/${createdEventId}`)
                .header('Authorization', `Bearer ${authToken}`)
                .delete()
                .json();

            assert.strictEqual(res.status, 'success', 'Deletion should succeed');
            assert.strictEqual(res.message, 'Event successfully deleted', 'Should return success message');

            // Verify event is deleted
            const getRes = yield TEST.request(`/api/events/${createdEventId}`)
                .header('Authorization', `Bearer ${authToken}`)
                .get()
                .json();

            assert.strictEqual(getRes.status, 'error', 'Event should not exist');
            assert.strictEqual(getRes.message, 'Event not found', 'Should return not found message');
        });

        // Test error cases
        TEST('Error Cases', function*() {
            // Test invalid event creation
            const invalidEvent = { name: 'a' }; // Missing required fields
            const createRes = yield TEST.request('/api/events')
                .header('Authorization', `Bearer ${authToken}`)
                .post(invalidEvent)
                .json();

            assert.strictEqual(createRes.status, 'error', 'Invalid creation should fail');
            assert.ok(createRes.errors, 'Should return validation errors');

            // Test non-existent event
            const getNonExistentRes = yield TEST.request('/api/events/nonexistent')
                .header('Authorization', `Bearer ${authToken}`)
                .get()
                .json();

            assert.strictEqual(getNonExistentRes.status, 'error', 'Non-existent event should fail');
            assert.strictEqual(getNonExistentRes.message, 'Event not found', 'Should return not found message');

            // Test unauthorized access
            const unauthorizedRes = yield TEST.request('/api/events')
                .get()
                .json();

            assert.strictEqual(unauthorizedRes.status, 'error', 'Unauthorized access should fail');
            assert.ok(unauthorizedRes.message.includes('unauthorized'), 'Should return unauthorized message');
        });

    } finally {
        // Cleanup
        yield cleanup();
    }
}); 