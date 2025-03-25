# Event Control System - API Guide

## Overview

The Event Control System API is built using Total.js framework and provides RESTful endpoints for managing events, incidents, users, and related resources. This guide details the available endpoints, authentication methods, and best practices for API integration.

## Authentication

### Bearer Token Authentication
```http
GET /api/events
Authorization: Bearer <your_token>
```

To obtain a token:
```http
POST /api/auth/login
Content-Type: application/json

{
    "username": "user@example.com",
    "password": "your_password"
}

Response:
{
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expires": "2024-02-01T12:00:00Z"
}
```

## API Endpoints

### Events

#### List Events
```http
GET /api/events
Query Parameters:
- page (integer, default: 1)
- limit (integer, default: 20)
- sort (string, options: name, date, priority)
- order (string, options: asc, desc)
- type (string)
- status (string)
- from (ISO date)
- to (ISO date)
- search (string)

Response:
{
    "page": 1,
    "count": 20,
    "total": 100,
    "items": [
        {
            "id": "event123",
            "name": "Annual Conference",
            "type": "conference",
            "status": "active",
            "startDate": "2024-03-01T09:00:00Z",
            "endDate": "2024-03-03T17:00:00Z",
            "location": "Convention Center",
            "priority": "high"
        }
    ]
}
```

#### Create Event
```http
POST /api/events
Content-Type: application/json

{
    "name": "Annual Conference",
    "type": "conference",
    "description": "Annual tech conference",
    "startDate": "2024-03-01T09:00:00Z",
    "endDate": "2024-03-03T17:00:00Z",
    "location": "Convention Center",
    "priority": "high",
    "tags": ["tech", "annual"],
    "metadata": {
        "capacity": 500,
        "sponsors": ["TechCorp", "InnovateInc"]
    }
}

Response:
{
    "id": "event123",
    "created": "2024-01-15T10:30:00Z",
    ...
}
```

#### Get Event
```http
GET /api/events/{id}

Response:
{
    "id": "event123",
    "name": "Annual Conference",
    "type": "conference",
    "status": "active",
    "startDate": "2024-03-01T09:00:00Z",
    "endDate": "2024-03-03T17:00:00Z",
    "location": "Convention Center",
    "priority": "high",
    "tags": ["tech", "annual"],
    "metadata": {
        "capacity": 500,
        "sponsors": ["TechCorp", "InnovateInc"]
    },
    "created": "2024-01-15T10:30:00Z",
    "updated": "2024-01-15T10:30:00Z"
}
```

#### Update Event
```http
PUT /api/events/{id}
Content-Type: application/json

{
    "name": "Updated Conference Name",
    "priority": "critical"
}

Response:
{
    "id": "event123",
    "updated": "2024-01-15T11:00:00Z",
    ...
}
```

#### Delete Event
```http
DELETE /api/events/{id}

Response:
{
    "success": true,
    "message": "Event deleted successfully"
}
```

### Incidents

#### List Incidents
```http
GET /api/incidents
Query Parameters:
- page (integer, default: 1)
- limit (integer, default: 20)
- sort (string, options: date, priority, status)
- order (string, options: asc, desc)
- status (string)
- priority (string)
- eventId (string)

Response:
{
    "page": 1,
    "count": 20,
    "total": 50,
    "items": [
        {
            "id": "incident123",
            "title": "Power Outage",
            "status": "active",
            "priority": "critical",
            "eventId": "event123",
            "created": "2024-01-15T14:30:00Z"
        }
    ]
}
```

#### Create Incident
```http
POST /api/incidents
Content-Type: application/json

{
    "title": "Power Outage",
    "description": "Main hall power failure",
    "priority": "critical",
    "eventId": "event123",
    "location": "Main Hall",
    "assignedTo": "user456"
}

Response:
{
    "id": "incident123",
    "created": "2024-01-15T14:30:00Z",
    ...
}
```

### Users

#### List Users
```http
GET /api/users
Query Parameters:
- page (integer, default: 1)
- limit (integer, default: 20)
- role (string)
- status (string)

Response:
{
    "page": 1,
    "count": 20,
    "total": 100,
    "items": [
        {
            "id": "user123",
            "username": "john.doe",
            "email": "john@example.com",
            "role": "manager",
            "status": "active"
        }
    ]
}
```

## WebSocket API

### Connection
```javascript
const socket = new WebSocket('ws://your-domain/api/ws');

socket.onopen = () => {
    console.log('Connected to WebSocket');
    // Authenticate
    socket.send(JSON.stringify({
        type: 'auth',
        token: 'your_token'
    }));
};
```

### Event Subscriptions
```javascript
// Subscribe to event updates
socket.send(JSON.stringify({
    type: 'subscribe',
    channel: 'events'
}));

// Subscribe to specific event
socket.send(JSON.stringify({
    type: 'subscribe',
    channel: 'event',
    id: 'event123'
}));

// Handle messages
socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Received:', data);
};
```

## Error Handling

### Error Response Format
```json
{
    "error": true,
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
        {
            "field": "name",
            "message": "Name is required"
        }
    ]
}
```

### Common Error Codes
- `UNAUTHORIZED`: Authentication required or failed
- `FORBIDDEN`: Insufficient permissions
- `NOT_FOUND`: Resource not found
- `VALIDATION_ERROR`: Invalid input data
- `CONFLICT`: Resource conflict
- `INTERNAL_ERROR`: Server error

## Rate Limiting

The API implements rate limiting based on the client IP address and API token:

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1706188800

{
    "error": true,
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests"
}
```

## Best Practices

### Pagination
- Always use pagination for list endpoints
- Default page size is 20 items
- Maximum page size is 100 items
- Use cursor-based pagination for large datasets

### Caching
```http
GET /api/events/123
If-None-Match: "abc123"

HTTP/1.1 304 Not Modified
ETag: "abc123"
Cache-Control: max-age=3600
```

### Filtering
- Use query parameters for filtering
- Combine multiple filters using AND logic
- Support exact match and range filters
- Implement text search where appropriate

### Security
1. **Token Management**
   - Rotate tokens regularly
   - Use short expiration times
   - Implement token refresh mechanism

2. **Request Signing**
   ```http
   GET /api/events
   Authorization: Bearer <token>
   X-Request-Time: 2024-01-15T12:00:00Z
   X-Request-Signature: HMAC_SHA256(request_time + path + query)
   ```

## SDK Examples

### Node.js
```javascript
const EventControl = require('event-control-sdk');

const client = new EventControl({
    baseUrl: 'https://your-domain/api',
    token: 'your_token'
});

// List events
const events = await client.events.list({
    page: 1,
    limit: 20,
    type: 'conference'
});

// Create event
const event = await client.events.create({
    name: 'New Event',
    startDate: '2024-03-01T09:00:00Z'
});

// Real-time updates
client.connect();
client.subscribe('events', (event) => {
    console.log('Event update:', event);
});
```

### Python
```python
from event_control import EventControlClient

client = EventControlClient(
    base_url='https://your-domain/api',
    token='your_token'
)

# List events
events = client.events.list(
    page=1,
    limit=20,
    type='conference'
)

# Create event
event = client.events.create(
    name='New Event',
    start_date='2024-03-01T09:00:00Z'
)

# Real-time updates
client.connect()
client.subscribe('events', lambda event: print('Event update:', event))
```

## Webhooks

### Configuration
```http
POST /api/webhooks
Content-Type: application/json

{
    "url": "https://your-domain/webhook",
    "events": ["event.created", "event.updated"],
    "secret": "your_webhook_secret"
}
```

### Webhook Payload
```json
{
    "id": "webhook123",
    "type": "event.created",
    "timestamp": "2024-01-15T12:00:00Z",
    "data": {
        "id": "event123",
        "name": "New Event",
        "type": "conference"
    }
}
```

### Webhook Signature
```http
POST /webhook
X-Webhook-Signature: t=1706188800,v1=5257a869e7bcd8d3f2c1d1c4c1c2c3c4
```

## API Versioning

### Version Header
```http
GET /api/events
Accept: application/json
API-Version: 2024-01-15
```

### Version URL
```http
GET /api/v1/events
GET /api/v2/events
``` 