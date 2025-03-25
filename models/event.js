const crypto = require('crypto');
const logger = require('../utils/logger');

// Event status enum
const EventStatus = {
    DRAFT: 'draft',
    PLANNED: 'planned',
    ACTIVE: 'active',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
};

// Event type enum
const EventType = {
    EMERGENCY: 'emergency',
    PLANNED: 'planned',
    MAINTENANCE: 'maintenance',
    TRAINING: 'training',
    OTHER: 'other'
};

// Event priority enum
const EventPriority = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
};

class Event {
    constructor(data = {}) {
        this.id = data.id || crypto.randomUUID();
        this.name = data.name;
        this.description = data.description;
        this.type = data.type || EventType.OTHER;
        this.status = data.status || EventStatus.DRAFT;
        this.priority = data.priority || EventPriority.MEDIUM;
        this.location = data.location || {};
        this.startDate = data.startDate ? new Date(data.startDate) : null;
        this.endDate = data.endDate ? new Date(data.endDate) : null;
        this.createdBy = data.createdBy;
        this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
        this.updatedAt = data.updatedAt ? new Date(data.updatedAt) : new Date();
        this.venue = data.venue;
        this.participants = data.participants || [];
        this.tags = data.tags || [];
        this.metadata = data.metadata || {};
    }

    // Validate event data
    validate() {
        const errors = [];

        // Required fields
        if (!this.name || typeof this.name !== 'string' || this.name.trim().length < 3) {
            errors.push('Name must be at least 3 characters long');
        }

        if (!this.description || typeof this.description !== 'string') {
            errors.push('Description is required');
        }

        // Type validation
        if (!Object.values(EventType).includes(this.type)) {
            errors.push('Invalid event type');
        }

        // Status validation
        if (!Object.values(EventStatus).includes(this.status)) {
            errors.push('Invalid event status');
        }

        // Priority validation
        if (!Object.values(EventPriority).includes(this.priority)) {
            errors.push('Invalid event priority');
        }

        // Date validation
        if (this.startDate && !(this.startDate instanceof Date)) {
            errors.push('Invalid start date');
        }

        if (this.endDate && !(this.endDate instanceof Date)) {
            errors.push('Invalid end date');
        }

        if (this.startDate && this.endDate && this.startDate > this.endDate) {
            errors.push('End date must be after start date');
        }

        // Location validation
        if (this.location) {
            if (typeof this.location !== 'object') {
                errors.push('Location must be an object');
            } else {
                if (this.location.what3words && typeof this.location.what3words !== 'string') {
                    errors.push('what3words must be a string');
                }
                if (this.location.coordinates) {
                    if (!Array.isArray(this.location.coordinates) || 
                        this.location.coordinates.length !== 2 ||
                        typeof this.location.coordinates[0] !== 'number' ||
                        typeof this.location.coordinates[1] !== 'number') {
                        errors.push('Coordinates must be an array of two numbers [longitude, latitude]');
                    }
                }
            }
        }

        // Venue validation
        if (this.venue && typeof this.venue !== 'string') {
            errors.push('Venue must be a string');
        }

        // Participants validation
        if (!Array.isArray(this.participants)) {
            errors.push('Participants must be an array');
        }

        // Tags validation
        if (!Array.isArray(this.tags)) {
            errors.push('Tags must be an array');
        }

        return errors;
    }

    // Check if status transition is valid
    canTransitionTo(newStatus) {
        const validTransitions = {
            [EventStatus.DRAFT]: [EventStatus.PLANNED, EventStatus.CANCELLED],
            [EventStatus.PLANNED]: [EventStatus.ACTIVE, EventStatus.CANCELLED],
            [EventStatus.ACTIVE]: [EventStatus.PAUSED, EventStatus.COMPLETED, EventStatus.CANCELLED],
            [EventStatus.PAUSED]: [EventStatus.ACTIVE, EventStatus.COMPLETED, EventStatus.CANCELLED],
            [EventStatus.COMPLETED]: [],
            [EventStatus.CANCELLED]: []
        };

        return validTransitions[this.status]?.includes(newStatus) || false;
    }

    // Update status with validation
    updateStatus(newStatus) {
        if (!this.canTransitionTo(newStatus)) {
            throw new Error(`Invalid status transition from ${this.status} to ${newStatus}`);
        }
        this.status = newStatus;
        this.updatedAt = new Date();
        logger.info('Event status updated', { eventId: this.id, oldStatus: this.status, newStatus });
    }

    // Convert to database format
    toDatabase() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            type: this.type,
            status: this.status,
            priority: this.priority,
            location: this.location,
            startDate: this.startDate?.toISOString(),
            endDate: this.endDate?.toISOString(),
            createdBy: this.createdBy,
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString(),
            venue: this.venue,
            participants: this.participants,
            tags: this.tags,
            metadata: this.metadata
        };
    }

    // Convert to JSON format (for API responses)
    toJSON() {
        return {
            ...this.toDatabase(),
            isActive: this.status === EventStatus.ACTIVE,
            canEdit: [EventStatus.DRAFT, EventStatus.PLANNED, EventStatus.PAUSED].includes(this.status),
            canCancel: this.status !== EventStatus.CANCELLED && this.status !== EventStatus.COMPLETED,
            canComplete: this.status === EventStatus.ACTIVE || this.status === EventStatus.PAUSED
        };
    }
}

// Export model and enums
module.exports = {
    Event,
    EventStatus,
    EventType,
    EventPriority
}; 