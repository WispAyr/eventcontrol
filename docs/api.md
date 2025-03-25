# Event Control API Documentation

## Authentication
All API endpoints except `/api/auth/login` and `/api/auth/register` require authentication using JWT token in the Authorization header.

```http
Authorization: Bearer <token>
```

## External Services API

### Weather Service
Get weather information for a specific location.

```http
GET /api/weather/{lat}/{lng}/
```

#### Parameters
- `lat` (number, required): Latitude coordinate
- `lng` (number, required): Longitude coordinate

#### Response
```json
{
    "temperature": 20.5,
    "feels_like": 21,
    "humidity": 65,
    "wind_speed": 5.2,
    "conditions": "Clear",
    "description": "Clear sky",
    "icon": "01d"
}
```

### Emergency Services
Notify emergency services about an incident.

```http
POST /api/emergency/notify/
```

#### Request Body
```json
{
    "type": "FIRE",
    "priority": "HIGH",
    "location": {
        "lat": 51.5074,
        "lng": -0.1278
    },
    "description": "Building fire reported",
    "what3words": "filled.count.soap"
}
```

#### Response
```json
{
    "reference": "EM123456",
    "eta": "2023-04-01T15:30:00Z",
    "status": "DISPATCHED"
}
```

### SMS Gateway
Send SMS messages using Twilio integration.

```http
POST /api/sms/send/
```

#### Request Body
```json
{
    "to": "+1234567890",
    "message": "Emergency alert: Fire reported at location X"
}
```

#### Response
```json
{
    "sid": "SM123456",
    "status": "queued"
}
```

### Calendar Integration
Get events from Google Calendar.

```http
GET /api/calendar/{calendarId}/
```

#### Parameters
- `calendarId` (string, required): Google Calendar ID
- `start` (string, optional): Start date in ISO format
- `end` (string, optional): End date in ISO format

#### Response
```json
[
    {
        "id": "event123",
        "title": "Emergency Response Training",
        "description": "Annual training session",
        "start": "2023-04-01T09:00:00Z",
        "end": "2023-04-01T17:00:00Z",
        "location": "Training Center"
    }
]
```

## Error Responses

### 400 Bad Request
```json
{
    "error": "Invalid coordinates"
}
```

### 401 Unauthorized
```json
{
    "error": "Authentication required"
}
```

### 403 Forbidden
```json
{
    "error": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
    "error": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
    "error": "Internal server error",
    "code": "ERR_INTERNAL"
}
```

## Rate Limiting
API endpoints are rate-limited to:
- 100 requests per minute for authenticated users
- 20 requests per minute for unauthenticated users

## Caching
- Weather data is cached for 30 minutes
- Calendar data is cached for 5 minutes
- Location data is cached for 1 hour

## WebSocket Events
Real-time updates are available through WebSocket connection at `/ws/`.

### Event Types
- `notification`: New notification
- `event_created`: New event created
- `event_updated`: Event updated
- `incident_created`: New incident created
- `incident_updated`: Incident updated
- `emergency_alert`: Emergency notification 