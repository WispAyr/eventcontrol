NEWSCHEMA('Event', function(schema) {

    // Basic information
    schema.define('id', String, true);
    schema.define('name', String, true);
    schema.define('status', ['planning', 'active', 'completed', 'archived'], true);
    schema.define('type', ['concert', 'sports', 'conference', 'festival', 'exhibition']);
    
    // Dates
    schema.define('dates', Object, true);
    schema.define('dates.setup_start', Date);
    schema.define('dates.event_start', Date, true);
    schema.define('dates.event_end', Date, true);
    schema.define('dates.teardown_end', Date);

    // Location
    schema.define('location', Object, true);
    schema.define('location.venue_name', String, true);
    schema.define('location.address', Object);
    schema.define('location.coordinates', Object);
    schema.define('location.what3words', String);
    schema.define('location.venue_map_url', String);

    // Capacity
    schema.define('capacity', Object);
    schema.define('capacity.max_attendance', Number);
    schema.define('capacity.current_attendance', Number);
    schema.define('capacity.staff_count', Number);

    // Zones
    schema.define('zones', '[Zone]');
    schema.define('emergency_info', Object);
    schema.define('resources', Object);
    schema.define('communication', Object);
    schema.define('statistics', Object);

    // Query action
    schema.action('query', {
        name: 'List events',
        query: 'status:String, type:String, start:Date, end:Date',
        action: function($) {
            // Basic filtering
            let filter = {};

            if ($.query.status)
                filter.status = $.query.status;
            
            if ($.query.type)
                filter.type = $.query.type;

            // Date range filtering
            if ($.query.start && $.query.end) {
                filter['dates.event_start'] = { '$gte': new Date($.query.start) };
                filter['dates.event_end'] = { '$lte': new Date($.query.end) };
            }

            // Execute query
            NOSQL('events')
                .find(filter)
                .sort('dates.event_start')
                .callback($.next);
        }
    });

    // Insert action
    schema.action('insert', {
        name: 'Create event',
        action: function($) {
            // Validate
            if ($.model.dates.event_end < $.model.dates.event_start)
                return $.invalid('dates.event_end', 'Event end must be after event start');

            if ($.model.capacity && $.model.capacity.current_attendance > $.model.capacity.max_attendance)
                return $.invalid('capacity.current_attendance', 'Current attendance cannot exceed maximum capacity');

            // Generate unique ID and timestamps
            $.model.id = UID();
            $.model.created_at = NOW;
            
            NOSQL('events').insert($.model).callback(() => {
                // Notify relevant users
                EMIT('event_created', $.model);
                $.success($.model.id);
            });
        }
    });

    // Update action
    schema.action('update', {
        name: 'Update event',
        params: '*id:String',
        action: function($) {
            // Validate
            if ($.model.dates.event_end < $.model.dates.event_start)
                return $.invalid('dates.event_end', 'Event end must be after event start');

            if ($.model.capacity && $.model.capacity.current_attendance > $.model.capacity.max_attendance)
                return $.invalid('capacity.current_attendance', 'Current attendance cannot exceed maximum capacity');

            $.model.updated_at = NOW;
            
            NOSQL('events')
                .modify($.model)
                .where('id', $.params.id)
                .callback(() => {
                    // Notify about update
                    EMIT('event_updated', $.model);
                    $.success();
                });
        }
    });

    // Remove action
    schema.action('remove', {
        name: 'Delete event',
        params: '*id:String',
        action: function($) {
            NOSQL('events')
                .remove()
                .where('id', $.params.id)
                .callback(() => {
                    // Notify about removal
                    EMIT('event_removed', $.params.id);
                    $.success();
                });
        }
    });
}); 