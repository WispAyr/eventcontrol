require('total.js').test(true);

const assert = require('assert');
const { Event, EventType, EventStatus, EventPriority } = require('../models/event');
const { User } = require('../models/user');
const db = require('../services/database');
const logger = require('../utils/logger');

// Test data generator
function generateTestData(count) {
    const users = [];
    const events = [];
    
    for (let i = 0; i < count; i++) {
        users.push({
            username: `load_user_${i}`,
            email: `load_user_${i}@example.com`,
            password: 'LoadTest123!',
            firstName: 'Load',
            lastName: `User ${i}`,
            role: i % 10 === 0 ? 'manager' : 'user'
        });

        events.push({
            name: `Load Test Event ${i}`,
            description: `Test event ${i} for load testing`,
            type: Object.values(EventType)[i % Object.values(EventType).length],
            priority: Object.values(EventPriority)[i % Object.values(EventPriority).length],
            location: {
                what3words: 'filled.count.soap',
                coordinates: [-0.1276 + (i * 0.001), 51.5072 + (i * 0.001)]
            },
            startDate: new Date(Date.now() + (86400000 * (i % 30))).toISOString(),
            endDate: new Date(Date.now() + (86400000 * ((i % 30) + 1))).toISOString(),
            venue: `Test Venue ${i}`,
            tags: ['load', 'test', `batch_${Math.floor(i / 10)}`],
            metadata: {
                maxParticipants: 10 + (i % 90),
                requiresRegistration: i % 2 === 0
            }
        });
    }
    return { users, events };
}

// Performance metrics tracking
const metrics = {
    operations: {},
    startTime: null,
    endTime: null,
    
    start() {
        this.startTime = Date.now();
        this.operations = {};
    },
    
    track(operation, duration) {
        if (!this.operations[operation]) {
            this.operations[operation] = {
                count: 0,
                totalDuration: 0,
                minDuration: Infinity,
                maxDuration: 0
            };
        }
        const stats = this.operations[operation];
        stats.count++;
        stats.totalDuration += duration;
        stats.minDuration = Math.min(stats.minDuration, duration);
        stats.maxDuration = Math.max(stats.maxDuration, duration);
    },
    
    end() {
        this.endTime = Date.now();
        const totalDuration = this.endTime - this.startTime;
        
        logger.info('Load Test Results', {
            totalDuration: totalDuration,
            operationsPerSecond: Object.entries(this.operations).reduce((acc, [op, stats]) => {
                acc[op] = (stats.count / (totalDuration / 1000)).toFixed(2);
                return acc;
            }, {}),
            statistics: Object.entries(this.operations).reduce((acc, [op, stats]) => {
                acc[op] = {
                    count: stats.count,
                    avgDuration: (stats.totalDuration / stats.count).toFixed(2),
                    minDuration: stats.minDuration,
                    maxDuration: stats.maxDuration
                };
                return acc;
            }, {})
        });
    }
};

// Helper functions
async function registerAndLogin(userData) {
    const start = Date.now();
    const res = await TEST.request('/api/auth/register')
        .post(userData)
        .json();
    metrics.track('register', Date.now() - start);
    
    assert.strictEqual(res.status, 'success', 'User registration should succeed');
    return res.data.token;
}

async function createEvent(token, eventData) {
    const start = Date.now();
    const res = await TEST.request('/api/events')
        .header('Authorization', `Bearer ${token}`)
        .post(eventData)
        .json();
    metrics.track('createEvent', Date.now() - start);
    
    assert.strictEqual(res.status, 'success', 'Event creation should succeed');
    return res.data.event;
}

async function cleanup() {
    const start = Date.now();
    const users = await db.findUsers({ username: /^load_user_/ });
    for (const user of users) {
        const events = await db.findEvents({ createdBy: user.id });
        for (const event of events.events) {
            await db.deleteEvent(event.id);
        }
        await db.deleteUser(user.id);
    }
    metrics.track('cleanup', Date.now() - start);
}

// Load Test Suites
ASYNC('Load Tests', function*() {
    try {
        // Initial cleanup
        yield cleanup();
        metrics.start();

        // Concurrent user registration and authentication
        TEST('Concurrent User Registration', function*() {
            const { users } = generateTestData(50);
            const registrationPromises = users.map(userData => registerAndLogin(userData));
            const tokens = yield Promise.all(registrationPromises);
            
            assert.strictEqual(tokens.length, users.length, 'All users should be registered');
            assert.ok(tokens.every(token => token), 'All users should receive tokens');
        });

        // Concurrent event creation
        TEST('Concurrent Event Creation', function*() {
            const { users, events } = generateTestData(100);
            const managerTokens = [];
            
            // Register managers
            for (const user of users.filter(u => u.role === 'manager')) {
                managerTokens.push(yield registerAndLogin(user));
            }
            
            // Create events concurrently
            const eventPromises = events.map((event, index) => 
                createEvent(managerTokens[index % managerTokens.length], event)
            );
            const createdEvents = yield Promise.all(eventPromises);
            
            assert.strictEqual(createdEvents.length, events.length, 'All events should be created');
        });

        // Search and filter performance
        TEST('Search and Filter Performance', function*() {
            const { users } = generateTestData(1);
            const token = yield registerAndLogin(users[0]);
            
            // Test search performance
            const searchStart = Date.now();
            const searchRes = yield TEST.request('/api/events')
                .header('Authorization', `Bearer ${token}`)
                .query({ search: 'Load Test', limit: 100 })
                .get()
                .json();
            metrics.track('search', Date.now() - searchStart);
            
            assert.strictEqual(searchRes.status, 'success', 'Search should succeed');
            
            // Test filter performance
            const filterStart = Date.now();
            const filterRes = yield TEST.request('/api/events')
                .header('Authorization', `Bearer ${token}`)
                .query({ 
                    priority: EventPriority.HIGH,
                    type: EventType.PLANNED,
                    limit: 100
                })
                .get()
                .json();
            metrics.track('filter', Date.now() - filterStart);
            
            assert.strictEqual(filterRes.status, 'success', 'Filter should succeed');
        });

        // Concurrent status updates
        TEST('Concurrent Status Updates', function*() {
            const { users, events } = generateTestData(20);
            const token = yield registerAndLogin(users[0]);
            
            // Create test events
            const createdEvents = [];
            for (const event of events) {
                const created = yield createEvent(token, event);
                createdEvents.push(created);
            }
            
            // Update statuses concurrently
            const updateStart = Date.now();
            const updatePromises = createdEvents.map(event => 
                TEST.request(`/api/events/${event.id}/status`)
                    .header('Authorization', `Bearer ${token}`)
                    .patch({ status: EventStatus.ACTIVE })
                    .json()
            );
            
            const results = yield Promise.all(updatePromises);
            metrics.track('statusUpdate', Date.now() - updateStart);
            
            assert.ok(results.every(r => r.status === 'success'), 'All status updates should succeed');
        });

        // Database query performance
        TEST('Database Query Performance', function*() {
            const queryStart = Date.now();
            const results = yield Promise.all([
                db.findEvents({ type: EventType.PLANNED }),
                db.findEvents({ priority: EventPriority.HIGH }),
                db.findEvents({ status: EventStatus.ACTIVE }),
                db.findUsers({ role: 'manager' }),
                db.findUsers({ role: 'user' })
            ]);
            metrics.track('dbQueries', Date.now() - queryStart);
            
            assert.ok(results.every(r => Array.isArray(r.events) || Array.isArray(r)), 'All queries should return results');
        });

    } finally {
        // Record metrics and cleanup
        metrics.end();
        yield cleanup();
    }
}); 