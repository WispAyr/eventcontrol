const NOTIFICATION = {};

exports.install = function() {
    ROUTE('GET /api/notifications/', list, ['authorize']);
    ROUTE('GET /api/notifications/unread/', unread, ['authorize']);
    ROUTE('GET /api/notifications/{id}/', get, ['authorize']);
    ROUTE('PUT /api/notifications/{id}/read/', markAsRead, ['authorize']);
    ROUTE('PUT /api/notifications/{id}/archive/', archive, ['authorize']);
    ROUTE('DELETE /api/notifications/{id}/', remove, ['authorize']);
    ROUTE('PUT /api/notifications/preferences/', updatePreferences, ['authorize']);
};

// List notifications with filtering and pagination
function list() {
    var $ = this;
    var options = $.query;
    options.userId = $.user.id;

    EXEC('Notification', 'query', options, $.callback);
}

// Get unread notifications count
function unread() {
    var $ = this;
    var options = {
        userId: $.user.id,
        status: 'unread'
    };

    EXEC('Notification', 'query', options, function(err, notifications) {
        if (err)
            return $.invalid(err);
        $.json({ count: notifications.length });
    });
}

// Get single notification
function get() {
    var $ = this;
    var id = $.params.id;

    EXEC('Notification', 'query', { id: id }, function(err, notifications) {
        if (err)
            return $.invalid(err);
        
        var notification = notifications[0];
        if (!notification)
            return $.invalid(404);
            
        if (notification.userId !== $.user.id)
            return $.invalid(401);
            
        $.json(notification);
    });
}

// Mark notification as read
function markAsRead() {
    var $ = this;
    var id = $.params.id;

    EXEC('Notification', 'query', { id: id }, function(err, notifications) {
        if (err)
            return $.invalid(err);
        
        var notification = notifications[0];
        if (!notification)
            return $.invalid(404);
            
        if (notification.userId !== $.user.id)
            return $.invalid(401);
        
        notification.status = 'read';
        notification.readAt = new Date();
        
        EXEC('Notification', 'update', notification, $.done());
    });
}

// Archive notification
function archive() {
    var $ = this;
    var id = $.params.id;

    EXEC('Notification', 'query', { id: id }, function(err, notifications) {
        if (err)
            return $.invalid(err);
        
        var notification = notifications[0];
        if (!notification)
            return $.invalid(404);
            
        if (notification.userId !== $.user.id)
            return $.invalid(401);
        
        notification.status = 'archived';
        
        EXEC('Notification', 'update', notification, $.done());
    });
}

// Delete notification
function remove() {
    var $ = this;
    var id = $.params.id;

    EXEC('Notification', 'query', { id: id }, function(err, notifications) {
        if (err)
            return $.invalid(err);
        
        var notification = notifications[0];
        if (!notification)
            return $.invalid(404);
            
        if (notification.userId !== $.user.id)
            return $.invalid(401);
        
        EXEC('Notification', 'remove', { id: id }, $.done());
    });
}

// Update notification preferences
function updatePreferences() {
    var $ = this;
    var preferences = $.body;
    var userId = $.user.id;

    // Save preferences to user settings
    NOSQL('users').modify({ 
        notificationPreferences: preferences 
    }).where('id', userId).callback($.done());
}

// Notification manager
NOTIFICATION.create = function(userId, type, title, message, data, priority) {
    var notification = {
        userId: userId,
        type: type,
        title: title,
        message: message,
        data: data,
        priority: priority || 'medium'
    };

    EXEC('Notification', 'create', notification, function(err, notification) {
        if (!err) {
            // Send real-time notification via WebSocket
            WEBSOCKET.sendTo(userId, 'notification', notification);
            
            // Send email notification if enabled in user preferences
            EXEC('User', 'query', { id: userId }, function(err, users) {
                if (!err && users.length) {
                    var user = users[0];
                    if (user.notificationPreferences?.email) {
                        MAIL(user.email, title, message, '');
                    }
                }
            });
        }
    });
};

// Event handlers for automatic notifications
ON('event_created', function(data) {
    var notification = {
        type: 'event',
        title: 'New Event Created',
        message: `Event "${data.name}" has been created`,
        data: data,
        priority: data.priority
    };

    // Notify all users with appropriate permissions
    EXEC('User', 'query', { role: ['admin', 'manager'] }, function(err, users) {
        if (!err) {
            users.forEach(user => {
                NOTIFICATION.create(user.id, notification.type, notification.title, 
                    notification.message, notification.data, notification.priority);
            });
        }
    });
});

ON('incident_created', function(data) {
    var notification = {
        type: 'incident',
        title: 'New Incident Reported',
        message: `Incident "${data.title}" has been reported`,
        data: data,
        priority: data.priority || 'high'
    };

    // Notify assigned user and admins
    if (data.assignedTo) {
        NOTIFICATION.create(data.assignedTo, notification.type, notification.title, 
            notification.message, notification.data, notification.priority);
    }

    EXEC('User', 'query', { role: 'admin' }, function(err, users) {
        if (!err) {
            users.forEach(user => {
                NOTIFICATION.create(user.id, notification.type, notification.title, 
                    notification.message, notification.data, notification.priority);
            });
        }
    });
}); 