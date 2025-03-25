exports.install = function() {
    ROUTE('GET /api/weather/{lat}/{lng}/', getWeather, ['authorize']);
    ROUTE('POST /api/emergency/notify/', notifyEmergency, ['authorize']);
    ROUTE('POST /api/sms/send/', sendSMS, ['authorize']);
    ROUTE('GET /api/calendar/{calendarId}/', getCalendarEvents, ['authorize']);
};

// Get weather information for location
function getWeather() {
    var $ = this;
    var lat = parseFloat($.params.lat);
    var lng = parseFloat($.params.lng);

    if (isNaN(lat) || isNaN(lng))
        return $.invalid('Invalid coordinates');

    EXTERNAL.getWeather(lat, lng, function(err, result) {
        if (err)
            return $.invalid(err);
        $.json(result);
    });
}

// Notify emergency services
function notifyEmergency() {
    var $ = this;
    var incident = $.body;

    if (!incident || !incident.type || !incident.location)
        return $.invalid('Invalid incident data');

    EXTERNAL.notifyEmergencyServices(incident, function(err, result) {
        if (err)
            return $.invalid(err);
        $.json(result);
    });
}

// Send SMS
function sendSMS() {
    var $ = this;
    var data = $.body;

    if (!data || !data.to || !data.message)
        return $.invalid('Phone number and message are required');

    // Validate phone number format
    if (!/^\+\d{10,15}$/.test(data.to))
        return $.invalid('Invalid phone number format');

    EXTERNAL.sendSMS(data.to, data.message, function(err, result) {
        if (err)
            return $.invalid(err);
        $.json(result);
    });
}

// Get calendar events
function getCalendarEvents() {
    var $ = this;
    var calendarId = $.params.calendarId;
    var startDate = $.query.start || new Date().toISOString();
    var endDate = $.query.end || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    if (!calendarId)
        return $.invalid('Calendar ID is required');

    EXTERNAL.syncCalendarEvents(calendarId, startDate, endDate, function(err, result) {
        if (err)
            return $.invalid(err);
        $.json(result);
    });
} 