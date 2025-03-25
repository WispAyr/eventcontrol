exports.install = function() {
    // Event routes
    ROUTE('GET     /api/events',      '@Event --> query');
    ROUTE('GET     /api/events/{id}', '@Event --> read');
    ROUTE('POST    /api/events',      '@Event --> insert');
    ROUTE('PUT     /api/events/{id}', '@Event --> update');
    ROUTE('DELETE  /api/events/{id}', '@Event --> remove');

    // WebSocket routes
    ROUTE('SOCKET /', socket, ['json']);
};

// WebSocket handler
function socket() {
    var self = this;

    self.autodestroy(() => {
        // Cleanup when socket is destroyed
        console.log('Socket destroyed');
    });

    self.on('open', function(client) {
        // Handle new connection
        console.log('New client connected:', client.id);
    });

    self.on('message', function(client, message) {
        // Handle incoming messages
        console.log('Received message from client:', client.id, message);

        // Example: Subscribe to event updates
        if (message.type === 'subscribe' && message.eventId) {
            client.eventId = message.eventId;
            client.type = 'event-subscriber';
        }
    });

    self.on('close', function(client) {
        // Handle client disconnection
        console.log('Client disconnected:', client.id);
    });

    // Broadcast updates to relevant clients
    self.on('event_updated', function(data) {
        self.all(function(client) {
            if (client.type === 'event-subscriber' && client.eventId === data.id) {
                client.send({ type: 'event_update', data: data });
            }
        });
    });
} 