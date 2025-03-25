const WEBSOCKET = {};

exports.install = function() {
    ROUTE('SOCKET /ws/', socket, ['authorize']);
};

function socket() {
    var $ = this;

    $.autodestroy(() => UNSUBSCRIBE('events.*', $.id));
    $.autodestroy(() => UNSUBSCRIBE('incidents.*', $.id));

    // Handle client connection
    $.on('open', function(client) {
        client.id = UID();
        client.user = $.user;
        
        // Subscribe to events and incidents
        SUBSCRIBE('events.*', client.id, function(data) {
            client.send({ type: this.event.substring(7), data: data });
        });

        SUBSCRIBE('incidents.*', client.id, function(data) {
            client.send({ type: this.event.substring(10), data: data });
        });

        // Send initial connection status
        client.send({ type: 'connected', userId: client.user.id });
    });

    // Handle client messages
    $.on('message', function(client, message) {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'ping':
                    client.send({ type: 'pong', timestamp: NOW });
                    break;

                case 'subscribe':
                    if (data.channel) {
                        // Validate channel access
                        if (data.channel.startsWith('events.') || data.channel.startsWith('incidents.')) {
                            SUBSCRIBE(data.channel, client.id, function(channelData) {
                                client.send({ 
                                    type: 'channel',
                                    channel: data.channel,
                                    data: channelData 
                                });
                            });
                            client.send({ type: 'subscribed', channel: data.channel });
                        }
                    }
                    break;

                case 'unsubscribe':
                    if (data.channel) {
                        UNSUBSCRIBE(data.channel, client.id);
                        client.send({ type: 'unsubscribed', channel: data.channel });
                    }
                    break;

                default:
                    client.send({ type: 'error', message: 'Unknown message type' });
            }
        } catch (err) {
            client.send({ type: 'error', message: 'Invalid message format' });
        }
    });

    // Handle client errors
    $.on('error', function(err, client) {
        ERROR('websocket', err);
        client.send({ type: 'error', message: DEBUG ? err.message : 'Internal error occurred' });
    });

    // Handle client close
    $.on('close', function(client) {
        UNSUBSCRIBE('events.*', client.id);
        UNSUBSCRIBE('incidents.*', client.id);
    });
}

// WebSocket manager
WEBSOCKET.broadcast = function(type, data) {
    var message = JSON.stringify({ type: type, data: data });
    SOCKET('ws/').forEach(client => client.send(message));
};

WEBSOCKET.sendTo = function(userId, type, data) {
    var message = JSON.stringify({ type: type, data: data });
    SOCKET('ws/').forEach(client => {
        if (client.user && client.user.id === userId)
            client.send(message);
    });
};

WEBSOCKET.getOnlineUsers = function() {
    var users = new Set();
    SOCKET('ws/').forEach(client => {
        if (client.user)
            users.add(client.user.id);
    });
    return Array.from(users);
};

// Event handlers for real-time updates
ON('event_created', function(data) {
    WEBSOCKET.broadcast('event_created', data);
});

ON('event_updated', function(data) {
    WEBSOCKET.broadcast('event_updated', data);
});

ON('event_removed', function(data) {
    WEBSOCKET.broadcast('event_removed', data);
});

ON('incident_created', function(data) {
    WEBSOCKET.broadcast('incident_created', data);
    
    // Send notification to assigned user if exists
    if (data.assignedTo)
        WEBSOCKET.sendTo(data.assignedTo, 'incident_assigned', data);
});

ON('incident_updated', function(data) {
    WEBSOCKET.broadcast('incident_updated', data);
});

ON('incident_removed', function(data) {
    WEBSOCKET.broadcast('incident_removed', data);
});

ON('incident_assigned', function(data) {
    WEBSOCKET.broadcast('incident_assigned', data);
    WEBSOCKET.sendTo(data.assignedTo, 'incident_assigned_to_you', data);
});

ON('incident_escalated', function(data) {
    WEBSOCKET.broadcast('incident_escalated', data);
    WEBSOCKET.sendTo(data.escalatedTo, 'incident_escalated_to_you', data);
}); 