const EXTERNAL = {};

// Initialize external services
EXTERNAL.init = function() {
    // Configure API keys
    CONF.openweather_key = process.env.OPENWEATHER_API_KEY;
    CONF.emergency_key = process.env.EMERGENCY_API_KEY;
    CONF.twilio_sid = process.env.TWILIO_ACCOUNT_SID;
    CONF.twilio_token = process.env.TWILIO_AUTH_TOKEN;
    CONF.twilio_phone = process.env.TWILIO_PHONE_NUMBER;
    CONF.google_calendar_key = process.env.GOOGLE_CALENDAR_API_KEY;

    // Configure caching
    CONF.weather_cache_duration = '30 minutes';
    CONF.calendar_cache_duration = '5 minutes';

    // Initialize cache
    this.cache = {};
};

// Weather service integration
EXTERNAL.getWeather = function(lat, lng, callback) {
    var self = this;
    var cacheKey = 'weather_' + lat + '_' + lng;

    // Check cache first
    if (self.cache[cacheKey] && self.cache[cacheKey].timestamp > Date.now() - 1800000) {
        callback(null, self.cache[cacheKey].data);
        return;
    }

    // Make API request using Total.js RESTBuilder
    RESTBuilder.make(function(builder) {
        builder.url('https://api.openweathermap.org/data/2.5/weather');
        builder.get();
        builder.query('lat', lat);
        builder.query('lon', lng);
        builder.query('units', 'metric');
        builder.query('appid', CONF.openweather_key);
        builder.exec(function(err, response) {
            if (err)
                return callback(err);

            var result = {
                temperature: response.main.temp,
                feels_like: response.main.feels_like,
                humidity: response.main.humidity,
                wind_speed: response.wind.speed,
                conditions: response.weather[0].main,
                description: response.weather[0].description,
                icon: response.weather[0].icon
            };

            // Cache the result
            self.cache[cacheKey] = {
                timestamp: Date.now(),
                data: result
            };

            callback(null, result);
        });
    });
};

// Emergency services integration
EXTERNAL.notifyEmergencyServices = function(incident, callback) {
    // Make API request using Total.js RESTBuilder
    RESTBuilder.make(function(builder) {
        builder.url('https://api.emergency-service.com/notify');
        builder.post();
        builder.header('Authorization', 'Bearer ' + CONF.emergency_key);
        builder.json({
            type: incident.type,
            priority: incident.priority,
            location: incident.location,
            description: incident.description,
            what3words: incident.what3words
        });
        builder.exec(function(err, response) {
            if (err)
                return callback(err);

            // Log emergency notification
            LOGGER('emergency', 'Emergency services notified for incident: ' + incident.id);
            
            callback(null, {
                reference: response.reference,
                eta: response.eta,
                status: response.status
            });
        });
    });
};

// SMS gateway integration using Twilio
EXTERNAL.sendSMS = function(to, message, callback) {
    // Make API request using Total.js RESTBuilder
    RESTBuilder.make(function(builder) {
        builder.url('https://api.twilio.com/2010-04-01/Accounts/' + CONF.twilio_sid + '/Messages.json');
        builder.post();
        builder.auth(CONF.twilio_sid + ':' + CONF.twilio_token);
        builder.urlencoded();
        builder.params({
            To: to,
            From: CONF.twilio_phone,
            Body: message
        });
        builder.exec(function(err, response) {
            if (err)
                return callback(err);

            callback(null, {
                sid: response.sid,
                status: response.status
            });
        });
    });
};

// Calendar integration with Google Calendar
EXTERNAL.syncCalendarEvents = function(calendarId, startDate, endDate, callback) {
    var self = this;
    var cacheKey = 'calendar_' + calendarId + '_' + startDate + '_' + endDate;

    // Check cache first
    if (self.cache[cacheKey] && self.cache[cacheKey].timestamp > Date.now() - 300000) {
        callback(null, self.cache[cacheKey].data);
        return;
    }

    // Make API request using Total.js RESTBuilder
    RESTBuilder.make(function(builder) {
        builder.url('https://www.googleapis.com/calendar/v3/calendars/' + calendarId + '/events');
        builder.get();
        builder.query('key', CONF.google_calendar_key);
        builder.query('timeMin', startDate);
        builder.query('timeMax', endDate);
        builder.query('singleEvents', true);
        builder.query('orderBy', 'startTime');
        builder.exec(function(err, response) {
            if (err)
                return callback(err);

            var events = response.items.map(function(item) {
                return {
                    id: item.id,
                    title: item.summary,
                    description: item.description,
                    start: item.start.dateTime || item.start.date,
                    end: item.end.dateTime || item.end.date,
                    location: item.location
                };
            });

            // Cache the result
            self.cache[cacheKey] = {
                timestamp: Date.now(),
                data: events
            };

            callback(null, events);
        });
    });
};

// Clean up old cache entries
EXTERNAL.cleanup = function() {
    var self = this;
    var now = Date.now();
    var weatherExpiry = 1800000; // 30 minutes
    var calendarExpiry = 300000; // 5 minutes

    Object.keys(self.cache).forEach(function(key) {
        var expiry = key.startsWith('weather_') ? weatherExpiry : calendarExpiry;
        if (self.cache[key].timestamp < now - expiry)
            delete self.cache[key];
    });
};

// Schedule cache cleanup
SCHEDULE('*/15 * * * *', function() {
    EXTERNAL.cleanup();
});

// Export external service
global.EXTERNAL = EXTERNAL;

// Initialize external service on app start
ON('ready', function() {
    EXTERNAL.init();
    LOGGER('external', 'External services initialized');
}); 