const LOCATION = {};

// Initialize location service
LOCATION.init = function() {
    // Configure API keys
    CONF.what3words_key = process.env.WHAT3WORDS_API_KEY;
    CONF.geocoding_key = process.env.GEOCODING_API_KEY;
    CONF.maps_key = process.env.MAPS_API_KEY;

    // Configure caching
    CONF.location_cache = true;
    CONF.location_cache_duration = '1 hour';

    // Initialize cache
    this.cache = {};
};

// Convert what3words to coordinates
LOCATION.fromWhat3Words = function(words, callback) {
    var self = this;
    var cacheKey = 'w3w_' + words;

    // Check cache first
    if (self.cache[cacheKey] && self.cache[cacheKey].timestamp > Date.now() - 3600000) {
        callback(null, self.cache[cacheKey].data);
        return;
    }

    // Make API request using Total.js RESTBuilder
    RESTBuilder.make(function(builder) {
        builder.url('https://api.what3words.com/v3/convert-to-coordinates');
        builder.header('X-Api-Key', CONF.what3words_key);
        builder.get();
        builder.query('words', words);
        builder.exec(function(err, response) {
            if (err)
                return callback(err);

            var result = {
                lat: response.coordinates.lat,
                lng: response.coordinates.lng,
                words: words,
                nearestPlace: response.nearestPlace,
                country: response.country
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

// Convert coordinates to what3words
LOCATION.toWhat3Words = function(lat, lng, callback) {
    var self = this;
    var cacheKey = 'coords_' + lat + '_' + lng;

    // Check cache first
    if (self.cache[cacheKey] && self.cache[cacheKey].timestamp > Date.now() - 3600000) {
        callback(null, self.cache[cacheKey].data);
        return;
    }

    // Make API request using Total.js RESTBuilder
    RESTBuilder.make(function(builder) {
        builder.url('https://api.what3words.com/v3/convert-to-3wa');
        builder.header('X-Api-Key', CONF.what3words_key);
        builder.get();
        builder.query('coordinates', lat + ',' + lng);
        builder.exec(function(err, response) {
            if (err)
                return callback(err);

            var result = {
                words: response.words,
                lat: lat,
                lng: lng,
                nearestPlace: response.nearestPlace,
                country: response.country
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

// Geocode address to coordinates
LOCATION.geocode = function(address, callback) {
    var self = this;
    var cacheKey = 'geocode_' + address.replace(/\s+/g, '_').toLowerCase();

    // Check cache first
    if (self.cache[cacheKey] && self.cache[cacheKey].timestamp > Date.now() - 3600000) {
        callback(null, self.cache[cacheKey].data);
        return;
    }

    // Make API request using Total.js RESTBuilder
    RESTBuilder.make(function(builder) {
        builder.url('https://maps.googleapis.com/maps/api/geocode/json');
        builder.get();
        builder.query('address', address);
        builder.query('key', CONF.geocoding_key);
        builder.exec(function(err, response) {
            if (err)
                return callback(err);

            if (!response.results || !response.results.length)
                return callback(new Error('Address not found'));

            var location = response.results[0].geometry.location;
            var result = {
                lat: location.lat,
                lng: location.lng,
                address: response.results[0].formatted_address,
                placeId: response.results[0].place_id
            };

            // Cache the result
            self.cache[cacheKey] = {
                timestamp: Date.now(),
                data: result
            };

            // Get what3words for this location
            self.toWhat3Words(location.lat, location.lng, function(err, w3w) {
                if (!err && w3w)
                    result.what3words = w3w.words;
                callback(null, result);
            });
        });
    });
};

// Reverse geocode coordinates to address
LOCATION.reverseGeocode = function(lat, lng, callback) {
    var self = this;
    var cacheKey = 'revgeocode_' + lat + '_' + lng;

    // Check cache first
    if (self.cache[cacheKey] && self.cache[cacheKey].timestamp > Date.now() - 3600000) {
        callback(null, self.cache[cacheKey].data);
        return;
    }

    // Make API request using Total.js RESTBuilder
    RESTBuilder.make(function(builder) {
        builder.url('https://maps.googleapis.com/maps/api/geocode/json');
        builder.get();
        builder.query('latlng', lat + ',' + lng);
        builder.query('key', CONF.geocoding_key);
        builder.exec(function(err, response) {
            if (err)
                return callback(err);

            if (!response.results || !response.results.length)
                return callback(new Error('Location not found'));

            var result = {
                address: response.results[0].formatted_address,
                placeId: response.results[0].place_id,
                lat: lat,
                lng: lng
            };

            // Cache the result
            self.cache[cacheKey] = {
                timestamp: Date.now(),
                data: result
            };

            // Get what3words for this location
            self.toWhat3Words(lat, lng, function(err, w3w) {
                if (!err && w3w)
                    result.what3words = w3w.words;
                callback(null, result);
            });
        });
    });
};

// Get static map URL
LOCATION.getStaticMap = function(lat, lng, zoom, width, height) {
    return 'https://maps.googleapis.com/maps/api/staticmap?' +
        'center=' + lat + ',' + lng +
        '&zoom=' + (zoom || 15) +
        '&size=' + (width || 600) + 'x' + (height || 400) +
        '&markers=color:red%7C' + lat + ',' + lng +
        '&key=' + CONF.maps_key;
};

// Clean up old cache entries
LOCATION.cleanup = function() {
    var self = this;
    var now = Date.now();
    var oneHour = 3600000;

    Object.keys(self.cache).forEach(function(key) {
        if (self.cache[key].timestamp < now - oneHour)
            delete self.cache[key];
    });
};

// Schedule cache cleanup
SCHEDULE('30 * * * *', function() {
    LOCATION.cleanup();
});

// Export location service
global.LOCATION = LOCATION;

// Initialize location service on app start
ON('ready', function() {
    LOCATION.init();
    LOGGER('location', 'Location service initialized');
}); 