const { Event, EventStatus } = require('../models/event');
const { AppError } = require('../middleware/error-handler');
const logger = require('../utils/logger');
const sentry = require('../utils/sentry');
const db = require('../services/database');

NEWSCHEMA('Event', function(schema) {
    // Schema definition
    schema.define('id', 'UID');
    schema.define('name', 'String(100)', true);
    schema.define('description', 'String(1000)');
    schema.define('type', ['CONFERENCE', 'MEETING', 'WORKSHOP', 'OTHER'], true);
    schema.define('priority', ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], true);
    schema.define('status', ['DRAFT', 'PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'], true);
    schema.define('location', 'Object');
    schema.define('startDate', Date);
    schema.define('endDate', Date);
    schema.define('venue', 'String(200)');
    schema.define('participants', '[Object]');
    schema.define('tags', '[String]');
    schema.define('metadata', 'Object');
    schema.define('createdBy', 'UID');
    schema.define('createdAt', Date);
    schema.define('updatedAt', Date);

    // Query action
    schema.action('query', {
        name: 'List events',
        action: async function($) {
            try {
                const result = await db.findEvents($.query);
                $.callback(result);
            } catch (error) {
                $.invalid(error);
            }
        }
    });

    // Read action
    schema.action('read', {
        name: 'Get event by ID',
        params: '*id:UID',
        action: async function($) {
            try {
                const event = await db.findEventById($.params.id);
                if (!event) {
                    $.invalid(404, 'Event not found');
                    return;
                }
                $.callback(event);
            } catch (error) {
                $.invalid(error);
            }
        }
    });

    // Insert action
    schema.action('insert', {
        name: 'Create new event',
        action: async function($) {
            try {
                const data = {
                    ...$.model,
                    createdBy: $.user.id,
                    createdAt: NOW,
                    updatedAt: NOW
                };

                const id = await db.createEvent(data);
                $.callback(id);
            } catch (error) {
                $.invalid(error);
            }
        }
    });

    // Update action
    schema.action('update', {
        name: 'Update event',
        params: '*id:UID',
        action: async function($) {
            try {
                const event = await db.findEventById($.params.id);
                if (!event) {
                    $.invalid(404, 'Event not found');
                    return;
                }

                if (!event.canEdit) {
                    $.invalid(403, 'Event cannot be edited in its current status');
                    return;
                }

                const data = {
                    ...$.model,
                    updatedAt: NOW
                };

                await db.updateEvent($.params.id, data);
                $.success();
            } catch (error) {
                $.invalid(error);
            }
        }
    });

    // Remove action
    schema.action('remove', {
        name: 'Delete event',
        params: '*id:UID',
        action: async function($) {
            try {
                const event = await db.findEventById($.params.id);
                if (!event) {
                    $.invalid(404, 'Event not found');
                    return;
                }

                if (event.status === 'ACTIVE') {
                    $.invalid(400, 'Cannot delete an active event');
                    return;
                }

                await db.deleteEvent($.params.id);
                $.success();
            } catch (error) {
                $.invalid(error);
            }
        }
    });

    // Update status action
    schema.action('status', {
        name: 'Update event status',
        params: '*id:UID,*status',
        action: async function($) {
            try {
                const event = await db.findEventById($.params.id);
                if (!event) {
                    $.invalid(404, 'Event not found');
                    return;
                }

                if (!['DRAFT', 'PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'].includes($.params.status)) {
                    $.invalid(400, 'Invalid status');
                    return;
                }

                await db.updateEvent($.params.id, { 
                    status: $.params.status,
                    updatedAt: NOW
                });
                
                $.success();
            } catch (error) {
                $.invalid(error);
            }
        }
    });
}); 