# External Services Documentation

## Overview
The external services module provides integration with various third-party services using Total.js RESTBuilder. It includes weather information, emergency services notification, SMS messaging, and calendar synchronization.

## Service Configuration

### Environment Variables
```bash
OPENWEATHER_API_KEY=your_openweather_api_key
EMERGENCY_API_KEY=your_emergency_api_key
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_phone
GOOGLE_CALENDAR_API_KEY=your_google_calendar_key
```

### Cache Configuration
```javascript
CONF.weather_cache_duration = '30 minutes';
CONF.calendar_cache_duration = '5 minutes';
```

## Weather Service

### `EXTERNAL.getWeather(lat, lng, callback)`
Get weather information for a specific location.

#### Parameters
- `lat` (number): Latitude coordinate
- `lng` (number): Longitude coordinate
- `callback` (function): Callback function(error, result)

#### Example
```javascript
EXTERNAL.getWeather(51.5074, -0.1278, function(err, result) {
    if (err)
        return console.error(err);
    console.log('Weather:', result);
});
```

## Emergency Services

### `EXTERNAL.notifyEmergencyServices(incident, callback)`
Notify emergency services about an incident.

#### Parameters
- `incident` (object): Incident details
  - `type` (string): Incident type
  - `priority` (string): Incident priority
  - `location` (object): Location coordinates
  - `description` (string): Incident description
  - `what3words` (string): what3words location
- `callback` (function): Callback function(error, result)

#### Example
```javascript
var incident = {
    type: 'FIRE',
    priority: 'HIGH',
    location: { lat: 51.5074, lng: -0.1278 },
    description: 'Building fire reported',
    what3words: 'filled.count.soap'
};

EXTERNAL.notifyEmergencyServices(incident, function(err, result) {
    if (err)
        return console.error(err);
    console.log('Emergency notification:', result);
});
```

## SMS Gateway

### `EXTERNAL.sendSMS(to, message, callback)`
Send SMS messages using Twilio.

#### Parameters
- `to` (string): Recipient phone number
- `message` (string): Message content
- `callback` (function): Callback function(error, result)

#### Example
```javascript
EXTERNAL.sendSMS('+1234567890', 'Emergency alert!', function(err, result) {
    if (err)
        return console.error(err);
    console.log('SMS sent:', result);
});
```

## Calendar Integration

### `EXTERNAL.syncCalendarEvents(calendarId, startDate, endDate, callback)`
Synchronize events from Google Calendar.

#### Parameters
- `calendarId` (string): Google Calendar ID
- `startDate` (string): Start date in ISO format
- `endDate` (string): End date in ISO format
- `callback` (function): Callback function(error, result)

#### Example
```javascript
var startDate = new Date().toISOString();
var endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

EXTERNAL.syncCalendarEvents('primary', startDate, endDate, function(err, events) {
    if (err)
        return console.error(err);
    console.log('Calendar events:', events);
});
```

## Cache Management

### Cache Cleanup
The service automatically cleans up cached data using Total.js SCHEDULE:
```javascript
SCHEDULE('*/15 * * * *', function() {
    EXTERNAL.cleanup();
});
```

### Cache Structure
```javascript
{
    'weather_LAT_LNG': {
        timestamp: Date.now(),
        data: { ... }
    },
    'calendar_ID_START_END': {
        timestamp: Date.now(),
        data: [ ... ]
    }
}
```

## Error Handling
All methods use standard Node.js error-first callbacks. Common errors:

```javascript
// API Key errors
{ code: 'AUTH_FAILED', message: 'Invalid API key' }

// Rate limiting
{ code: 'RATE_LIMIT', message: 'Too many requests' }

// Service unavailable
{ code: 'SERVICE_DOWN', message: 'Service temporarily unavailable' }

// Invalid parameters
{ code: 'INVALID_PARAMS', message: 'Invalid parameters provided' }
```

## Dependencies
- Total.js RESTBuilder for API requests
- Total.js SCHEDULE for cache cleanup
- Total.js LOGGER for error logging
- AWS SDK for S3 operations (optional)

## Best Practices
1. Always check for errors in callbacks
2. Use try-catch blocks for error handling
3. Validate input parameters
4. Monitor API rate limits
5. Keep API keys secure in environment variables
6. Use caching for frequently accessed data
7. Clean up cached data regularly 