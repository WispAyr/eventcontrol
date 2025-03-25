// Event history model using Total.js schema
NEWSCHEMA('EventHistory', function(schema) {
    schema.define('id', 'UID');
    schema.define('eventId', 'UID', true);
    schema.define('userId', 'UID', true);
    schema.define('action', ['CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE'], true);
    schema.define('changes', 'Object');
    schema.define('previousStatus', 'String');
    schema.define('newStatus', 'String');
    schema.define('metadata', 'Object');
    schema.define('createdAt', Date);

    // Query action
    schema.action('query', {
        name: 'List event history',
        query: 'eventId:String, userId:String, action:String, from:String, to:String, limit:Number, skip:Number',
        action: function($) {
            let builder = NOSQL('event_history').find();

            if ($.query.eventId)
                builder.where('eventId', $.query.eventId);
            
            if ($.query.userId)
                builder.where('userId', $.query.userId);
                
            if ($.query.action)
                builder.where('action', $.query.action);

            if ($.query.from)
                builder.where('createdAt', '>=', NOW.add('-' + $.query.from));

            if ($.query.to)
                builder.where('createdAt', '<=', NOW.add('+' + $.query.to));

            builder.sort('createdAt', true);  // Newest first

            if ($.query.limit)
                builder.take($.query.limit);

            if ($.query.skip)
                builder.skip($.query.skip);

            builder.callback($.next);
        }
    });

    // Insert action
    schema.action('insert', {
        name: 'Create history entry',
        action: function($) {
            $.model.id = UID();
            $.model.createdAt = NOW;
            NOSQL('event_history').insert($.model).callback(() => {
                EMIT('event_history_created', $.model);
                $.success($.model.id);
            });
        }
    });

    // Read action
    schema.action('read', {
        name: 'Get history entry',
        params: '*id:UID',
        action: function($) {
            NOSQL('event_history').one().where('id', $.params.id).callback($.next);
        }
    });

    // Record action
    schema.action('record', {
        name: 'Record event history',
        params: '*eventId:UID, *action:String, changes:Object, previousStatus:String, newStatus:String, metadata:Object',
        action: function($) {
            const history = {
                id: UID(),
                eventId: $.params.eventId,
                userId: $.user ? $.user.id : null,
                action: $.params.action,
                changes: $.params.changes || {},
                previousStatus: $.params.previousStatus,
                newStatus: $.params.newStatus,
                metadata: $.params.metadata || {},
                createdAt: NOW
            };

            NOSQL('event_history').insert(history).callback(() => {
                EMIT('event_history_recorded', history);
                $.success();
            });
        }
    });

    // Cleanup action
    schema.action('cleanup', {
        name: 'Cleanup old history entries',
        action: function($) {
            const retentionDays = CONF.event_history_retention || 365;
            const cutoffDate = NOW.add('-' + retentionDays + ' days');

            NOSQL('event_history')
                .remove()
                .where('createdAt', '<', cutoffDate)
                .callback($.success);
        }
    });
}); 