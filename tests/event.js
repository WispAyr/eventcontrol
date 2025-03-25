require('total.js').test(true);

const assert = require('assert');
const { Event, EventStatus, EventType, EventPriority } = require('../models/event');

// Test data
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

// Test suite
TEST('Event Model Tests', function() {
    // Test event creation
    TEST('Event Creation', function() {
        const event = new Event(testEvent);

        assert.strictEqual(event.name, testEvent.name, 'Name should match');
        assert.strictEqual(event.description, testEvent.description, 'Description should match');
        assert.strictEqual(event.type, testEvent.type, 'Type should match');
        assert.strictEqual(event.status, EventStatus.DRAFT, 'Status should default to DRAFT');
        assert.strictEqual(event.priority, testEvent.priority, 'Priority should match');
        assert.deepStrictEqual(event.location, testEvent.location, 'Location should match');
        assert.ok(event.startDate instanceof Date, 'Start date should be Date object');
        assert.ok(event.endDate instanceof Date, 'End date should be Date object');
        assert.strictEqual(event.venue, testEvent.venue, 'Venue should match');
        assert.deepStrictEqual(event.participants, testEvent.participants, 'Participants should match');
        assert.deepStrictEqual(event.tags, testEvent.tags, 'Tags should match');
        assert.deepStrictEqual(event.metadata, testEvent.metadata, 'Metadata should match');
    });

    // Test validation
    TEST('Event Validation', function() {
        // Valid event
        const validEvent = new Event(testEvent);
        const validationErrors = validEvent.validate();
        assert.strictEqual(validationErrors.length, 0, 'Valid event should have no errors');

        // Invalid event
        const invalidEvent = new Event({
            name: 'a', // too short
            type: 'invalid-type',
            priority: 'invalid-priority',
            location: 'invalid-location', // should be object
            startDate: 'invalid-date',
            participants: 'invalid-participants', // should be array
            tags: 'invalid-tags' // should be array
        });

        const errors = invalidEvent.validate();
        assert.ok(errors.length > 0, 'Invalid event should have errors');
        assert.ok(errors.includes('Name must be at least 3 characters long'), 'Should validate name length');
        assert.ok(errors.includes('Description is required'), 'Should require description');
        assert.ok(errors.includes('Invalid event type'), 'Should validate event type');
        assert.ok(errors.includes('Invalid event priority'), 'Should validate priority');
        assert.ok(errors.includes('Location must be an object'), 'Should validate location type');
        assert.ok(errors.includes('Participants must be an array'), 'Should validate participants type');
        assert.ok(errors.includes('Tags must be an array'), 'Should validate tags type');
    });

    // Test status transitions
    TEST('Event Status Transitions', function() {
        const event = new Event(testEvent);

        // Test valid transitions
        assert.ok(event.canTransitionTo(EventStatus.PLANNED), 'Should allow DRAFT to PLANNED');
        assert.ok(event.canTransitionTo(EventStatus.CANCELLED), 'Should allow DRAFT to CANCELLED');
        assert.ok(!event.canTransitionTo(EventStatus.ACTIVE), 'Should not allow DRAFT to ACTIVE');

        // Test status update
        event.updateStatus(EventStatus.PLANNED);
        assert.strictEqual(event.status, EventStatus.PLANNED, 'Status should be updated to PLANNED');

        event.updateStatus(EventStatus.ACTIVE);
        assert.strictEqual(event.status, EventStatus.ACTIVE, 'Status should be updated to ACTIVE');

        // Test invalid transition
        assert.throws(() => {
            event.updateStatus(EventStatus.DRAFT);
        }, Error, 'Should throw error for invalid transition');
    });

    // Test JSON conversion
    TEST('Event JSON Conversion', function() {
        const event = new Event(testEvent);
        const json = event.toJSON();

        assert.strictEqual(typeof json, 'object', 'Should return an object');
        assert.strictEqual(json.name, testEvent.name, 'Name should match in JSON');
        assert.strictEqual(json.isActive, false, 'Should include isActive flag');
        assert.strictEqual(json.canEdit, true, 'Should include canEdit flag');
        assert.strictEqual(json.canCancel, true, 'Should include canCancel flag');
        assert.strictEqual(json.canComplete, false, 'Should include canComplete flag');
    });

    // Test database conversion
    TEST('Event Database Conversion', function() {
        const event = new Event(testEvent);
        const dbData = event.toDatabase();

        assert.strictEqual(typeof dbData, 'object', 'Should return an object');
        assert.strictEqual(dbData.name, testEvent.name, 'Name should match in database format');
        assert.strictEqual(typeof dbData.startDate, 'string', 'Start date should be string in ISO format');
        assert.strictEqual(typeof dbData.endDate, 'string', 'End date should be string in ISO format');
        assert.strictEqual(typeof dbData.createdAt, 'string', 'Created at should be string in ISO format');
        assert.strictEqual(typeof dbData.updatedAt, 'string', 'Updated at should be string in ISO format');
    });
}); 