NEWSCHEMA('Incident', function(schema) {
    // Basic information
    schema.define('id', 'UID');
    schema.define('title', 'String(200)', true);
    schema.define('description', 'String(5000)');
    schema.define('type', ['SECURITY', 'SAFETY', 'MAINTENANCE', 'EMERGENCY', 'OTHER'], true);
    schema.define('priority', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], true);
    schema.define('status', ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED'], true);
    
    // Relations
    schema.define('eventId', 'UID');  // Optional - can be linked to an event
    schema.define('createdBy', 'UID', true);
    schema.define('assignedTo', 'UID');
    schema.define('escalatedTo', 'UID');
    
    // Timestamps
    schema.define('createdAt', Date);
    schema.define('updatedAt', Date);
    schema.define('resolvedAt', Date);
    schema.define('closedAt', Date);
    
    // Additional data
    schema.define('location', 'String(200)');
    schema.define('tags', '[String]');
    schema.define('attachments', '[Object]');
    schema.define('timeline', '[Object]');
    schema.define('metadata', 'Object');

    // Query action
    schema.action('query', {
        name: 'List incidents',
        query: 'search:String, type:String, priority:String, status:String, eventId:String, createdBy:String, assignedTo:String, from:String, to:String, sort:String, desc:Boolean, limit:Number, skip:Number',
        action: function($) {
            let builder = NOSQL('incidents').find();

            if ($.query.search) {
                builder.search('title', $.query.search);
                builder.search('description', $.query.search);
            }

            if ($.query.type)
                builder.where('type', $.query.type);

            if ($.query.priority)
                builder.where('priority', $.query.priority);

            if ($.query.status)
                builder.where('status', $.query.status);

            if ($.query.eventId)
                builder.where('eventId', $.query.eventId);

            if ($.query.createdBy)
                builder.where('createdBy', $.query.createdBy);

            if ($.query.assignedTo)
                builder.where('assignedTo', $.query.assignedTo);

            if ($.query.from)
                builder.where('createdAt', '>=', NOW.add('-' + $.query.from));

            if ($.query.to)
                builder.where('createdAt', '<=', NOW.add('+' + $.query.to));

            builder.sort($.query.sort || 'createdAt', $.query.desc === 'true');

            if ($.query.limit)
                builder.take($.query.limit);

            if ($.query.skip)
                builder.skip($.query.skip);

            builder.callback($.next);
        }
    });

    // Insert action
    schema.action('insert', {
        name: 'Create incident',
        action: function($) {
            let model = $.model;
            
            // Set default values
            model.id = UID();
            model.createdAt = NOW;
            model.status = 'NEW';
            model.timeline = [];

            // Add initial timeline entry
            model.timeline.push({
                type: 'CREATED',
                timestamp: NOW,
                userId: $.user.id
            });

            NOSQL('incidents').insert(model).callback(() => {
                EMIT('incident_created', model);
                $.success(model.id);
            });
        }
    });

    // Update action
    schema.action('update', {
        name: 'Update incident',
        params: '*id:UID',
        action: function($) {
            let model = $.model;
            model.updatedAt = NOW;

            // Add to timeline if status changed
            if ($.model.$dirty('status')) {
                model.timeline.push({
                    type: 'STATUS_CHANGE',
                    from: $.model.$previous.status,
                    to: model.status,
                    timestamp: NOW,
                    userId: $.user.id
                });

                // Set timestamps based on status
                if (model.status === 'RESOLVED')
                    model.resolvedAt = NOW;
                else if (model.status === 'CLOSED')
                    model.closedAt = NOW;
            }

            // Add to timeline if assigned
            if ($.model.$dirty('assignedTo')) {
                model.timeline.push({
                    type: 'ASSIGNMENT',
                    to: model.assignedTo,
                    timestamp: NOW,
                    userId: $.user.id
                });
            }

            // Add to timeline if escalated
            if ($.model.$dirty('escalatedTo')) {
                model.timeline.push({
                    type: 'ESCALATION',
                    to: model.escalatedTo,
                    timestamp: NOW,
                    userId: $.user.id
                });
            }

            NOSQL('incidents').modify(model).where('id', $.params.id).callback(() => {
                EMIT('incident_updated', model);
                $.success();
            });
        }
    });

    // Remove action
    schema.action('remove', {
        name: 'Delete incident',
        params: '*id:UID',
        action: function($) {
            NOSQL('incidents').remove().where('id', $.params.id).callback(() => {
                EMIT('incident_removed', { id: $.params.id });
                $.success();
            });
        }
    });

    // Assign action
    schema.action('assign', {
        name: 'Assign incident',
        params: '*id:UID, *userId:UID',
        action: function($) {
            NOSQL('incidents').one().where('id', $.params.id).callback((err, incident) => {
                if (err)
                    return $.invalid(err);

                if (!incident)
                    return $.invalid(404);

                incident.assignedTo = $.params.userId;
                incident.status = 'ASSIGNED';
                incident.updatedAt = NOW;
                incident.timeline.push({
                    type: 'ASSIGNMENT',
                    to: $.params.userId,
                    timestamp: NOW,
                    userId: $.user.id
                });

                NOSQL('incidents').modify(incident).where('id', $.params.id).callback(() => {
                    EMIT('incident_assigned', incident);
                    $.success();
                });
            });
        }
    });

    // Escalate action
    schema.action('escalate', {
        name: 'Escalate incident',
        params: '*id:UID, *userId:UID, *reason:String',
        action: function($) {
            NOSQL('incidents').one().where('id', $.params.id).callback((err, incident) => {
                if (err)
                    return $.invalid(err);

                if (!incident)
                    return $.invalid(404);

                incident.escalatedTo = $.params.userId;
                incident.status = 'ESCALATED';
                incident.updatedAt = NOW;
                incident.timeline.push({
                    type: 'ESCALATION',
                    to: $.params.userId,
                    reason: $.params.reason,
                    timestamp: NOW,
                    userId: $.user.id
                });

                NOSQL('incidents').modify(incident).where('id', $.params.id).callback(() => {
                    EMIT('incident_escalated', incident);
                    $.success();
                });
            });
        }
    });

    // Validation action
    schema.action('validate', {
        name: 'Validate incident',
        params: '*id:String, *status:String, *type:String, *priority:String',
        action: function($) {
            const incident = $.params;

            // Status transitions
            const validTransitions = {
                'NEW': ['ASSIGNED', 'ESCALATED'],
                'ASSIGNED': ['IN_PROGRESS', 'ESCALATED'],
                'IN_PROGRESS': ['RESOLVED', 'ESCALATED'],
                'ESCALATED': ['IN_PROGRESS', 'RESOLVED'],
                'RESOLVED': ['CLOSED'],
                'CLOSED': []
            };

            // Get current incident state
            NOSQL('incidents').one().where('id', incident.id).callback((err, currentIncident) => {
                if (err)
                    return $.invalid(err);
                
                if (!currentIncident)
                    return $.invalid('Incident not found');

                // Status transition validation
                if (incident.status !== currentIncident.status) {
                    if (!validTransitions[currentIncident.status].includes(incident.status))
                        return $.invalid('Invalid status transition');
                }

                // Priority validation
                if (incident.type === 'EMERGENCY' && incident.priority !== 'CRITICAL')
                    return $.invalid('Emergency incidents must have CRITICAL priority');

                $.success();
            });
        }
    });
}); 