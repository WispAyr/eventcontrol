exports.install = function() {
    ROUTE('POST /api/incidents', create, ['authorize']);
    ROUTE('GET /api/incidents', list, ['authorize']);
    ROUTE('GET /api/incidents/{id}', getById, ['authorize']);
    ROUTE('PUT /api/incidents/{id}', update, ['authorize']);
    ROUTE('DELETE /api/incidents/{id}', remove, ['authorize']);
    ROUTE('POST /api/incidents/{id}/assign', assign, ['authorize']);
    ROUTE('POST /api/incidents/{id}/escalate', escalate, ['authorize']);
    ROUTE('GET /api/incidents/{id}/timeline', getTimeline, ['authorize']);
};

function create($) {
    var incident = GETSCHEMA('Incident').make();
    $.copy(incident);
    
    incident.createdBy = $.user.id;

    // Validate the model
    EXEC('Incident -> validate', incident, function(err) {
        if (err)
            return $.invalid(err);

        incident.$insert().callback($.done());
    });
}

function update($) {
    var id = $.params.id;
    
    NOSQL('incidents').one().where('id', id).callback((err, existing) => {
        if (err)
            return $.invalid(err);
            
        if (!existing)
            return $.invalid(404);

        // Check permissions
        if (existing.createdBy !== $.user.id && !$.user.roles.includes('admin'))
            return $.invalid(401);

        var incident = GETSCHEMA('Incident').make();
        $.copy(incident);

        // Keep original data that shouldn't be updated
        incident.id = id;
        incident.createdBy = existing.createdBy;
        incident.createdAt = existing.createdAt;
        incident.timeline = existing.timeline;

        // Validate the model
        EXEC('Incident -> validate', incident, function(err) {
            if (err)
                return $.invalid(err);

            incident.$save().callback($.done());
        });
    });
}

function getById($) {
    var id = $.params.id;
    
    NOSQL('incidents').one().where('id', id).callback((err, incident) => {
        if (err)
            return $.invalid(err);
            
        if (!incident)
            return $.invalid(404);

        $.success(incident);
    });
}

function list($) {
    EXEC('Incident -> query', $.query, $.callback);
}

function remove($) {
    var id = $.params.id;
    
    NOSQL('incidents').one().where('id', id).callback((err, incident) => {
        if (err)
            return $.invalid(err);
            
        if (!incident)
            return $.invalid(404);

        // Check permissions
        if (incident.createdBy !== $.user.id && !$.user.roles.includes('admin'))
            return $.invalid(401);

        // Can't delete if not in terminal state
        if (!['RESOLVED', 'CLOSED'].includes(incident.status))
            return $.invalid('Can only delete resolved or closed incidents');

        EXEC('Incident -> remove', { id: id }, $.done());
    });
}

function assign($) {
    var id = $.params.id;
    
    if (!$.body.userId)
        return $.invalid('User ID is required');

    EXEC('Incident -> assign', {
        id: id,
        userId: $.body.userId
    }, $.done());
}

function escalate($) {
    var id = $.params.id;
    
    if (!$.body.userId)
        return $.invalid('User ID is required');

    if (!$.body.reason)
        return $.invalid('Escalation reason is required');

    EXEC('Incident -> escalate', {
        id: id,
        userId: $.body.userId,
        reason: $.body.reason
    }, $.done());
}

function getTimeline($) {
    var id = $.params.id;
    
    NOSQL('incidents').one().where('id', id).callback((err, incident) => {
        if (err)
            return $.invalid(err);
            
        if (!incident)
            return $.invalid(404);

        $.success(incident.timeline || []);
    });
} 