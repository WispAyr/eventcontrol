const NEWSCHEMA = global.NEWSCHEMA;

const NotificationSchema = NEWSCHEMA('Notification', function(schema) {
    schema.define('id', String);
    schema.define('userId', String, true);
    schema.define('type', ['event', 'incident', 'system'], true);
    schema.define('title', String, true);
    schema.define('message', String, true);
    schema.define('data', Object);
    schema.define('priority', ['low', 'medium', 'high', 'critical'], true);
    schema.define('status', ['unread', 'read', 'archived'], true);
    schema.define('createdAt', Date);
    schema.define('readAt', Date);

    // Query action
    schema.action('query', {
        name: 'List notifications',
        query: 'userId:String, status:String, type:String, priority:String, limit:Number, skip:Number',
        action: function($) {
            let builder = NOSQL('notifications').find();

            if ($.query.userId)
                builder.where('userId', $.query.userId);
            
            if ($.query.status)
                builder.where('status', $.query.status);
            
            if ($.query.type)
                builder.where('type', $.query.type);
            
            if ($.query.priority)
                builder.where('priority', $.query.priority);

            if ($.query.limit)
                builder.take($.query.limit);

            if ($.query.skip)
                builder.skip($.query.skip);

            builder.callback($.next);
        }
    });

    // Insert action
    schema.action('insert', {
        name: 'Create notification',
        action: function($) {
            let model = $.model;
            
            // Set default values
            model.id = model.id || UID();
            model.status = model.status || 'unread';
            model.priority = model.priority || 'medium';
            model.createdAt = model.createdAt || NOW;

            // Validate
            if (!model.type || model.type.length === 0)
                return $.invalid('Type is required');

            if (model.title && model.title.length >= 100)
                return $.invalid('Title must be less than 100 characters');

            if (model.message && model.message.length >= 500)
                return $.invalid('Message must be less than 500 characters');

            NOSQL('notifications').insert(model).callback(() => {
                EMIT('notification_created', model);
                $.success(model);
            });
        }
    });

    // Update action
    schema.action('update', {
        name: 'Update notification',
        params: '*id:String',
        action: function($) {
            let model = $.model;

            // Validate
            if (model.type && model.type.length === 0)
                return $.invalid('Type is required');

            if (model.title && model.title.length >= 100)
                return $.invalid('Title must be less than 100 characters');

            if (model.message && model.message.length >= 500)
                return $.invalid('Message must be less than 500 characters');

            NOSQL('notifications').modify(model).where('id', $.params.id).callback(() => {
                EMIT('notification_updated', model);
                $.success(model);
            });
        }
    });

    // Remove action
    schema.action('remove', {
        name: 'Delete notification',
        params: '*id:String',
        action: function($) {
            NOSQL('notifications').remove().where('id', $.params.id).callback(() => {
                EMIT('notification_removed', { id: $.params.id });
                $.success();
            });
        }
    });

    // Mark as read action
    schema.action('read', {
        name: 'Mark notification as read',
        params: '*id:String',
        action: function($) {
            let update = {
                status: 'read',
                readAt: NOW
            };

            NOSQL('notifications').modify(update).where('id', $.params.id).callback(() => {
                EMIT('notification_read', { id: $.params.id });
                $.success();
            });
        }
    });

    // Archive action
    schema.action('archive', {
        name: 'Archive notification',
        params: '*id:String',
        action: function($) {
            let update = {
                status: 'archived'
            };

            NOSQL('notifications').modify(update).where('id', $.params.id).callback(() => {
                EMIT('notification_archived', { id: $.params.id });
                $.success();
            });
        }
    });
}); 