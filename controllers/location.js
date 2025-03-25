exports.install = function() {
    ROUTE('GET /api/location/what3words/{words}/', fromWhat3Words, ['authorize']);
    ROUTE('GET /api/location/coordinates/{lat}/{lng}/', toWhat3Words, ['authorize']);
    ROUTE('GET /api/location/geocode/', geocode, ['authorize']);
    ROUTE('GET /api/location/reverse/{lat}/{lng}/', reverseGeocode, ['authorize']);
    ROUTE('GET /api/location/map/{lat}/{lng}/', staticMap, ['authorize']);
};

// Convert what3words to coordinates
function fromWhat3Words() {
    var $ = this;
    var words = $.params.words;

    if (!words)
        return $.invalid('Words parameter is required');

    LOCATION.fromWhat3Words(words, function(err, result) {
        if (err)
            return $.invalid(err);
        $.json(result);
    });
}

// Convert coordinates to what3words
function toWhat3Words() {
    var $ = this;
    var lat = parseFloat($.params.lat);
    var lng = parseFloat($.params.lng);

    if (isNaN(lat) || isNaN(lng))
        return $.invalid('Invalid coordinates');

    LOCATION.toWhat3Words(lat, lng, function(err, result) {
        if (err)
            return $.invalid(err);
        $.json(result);
    });
}

// Geocode address to coordinates
function geocode() {
    var $ = this;
    var address = $.query.address;

    if (!address)
        return $.invalid('Address parameter is required');

    LOCATION.geocode(address, function(err, result) {
        if (err)
            return $.invalid(err);
        $.json(result);
    });
}

// Reverse geocode coordinates to address
function reverseGeocode() {
    var $ = this;
    var lat = parseFloat($.params.lat);
    var lng = parseFloat($.params.lng);

    if (isNaN(lat) || isNaN(lng))
        return $.invalid('Invalid coordinates');

    LOCATION.reverseGeocode(lat, lng, function(err, result) {
        if (err)
            return $.invalid(err);
        $.json(result);
    });
}

// Get static map URL
function staticMap() {
    var $ = this;
    var lat = parseFloat($.params.lat);
    var lng = parseFloat($.params.lng);
    var zoom = parseInt($.query.zoom) || 15;
    var width = parseInt($.query.width) || 600;
    var height = parseInt($.query.height) || 400;

    if (isNaN(lat) || isNaN(lng))
        return $.invalid('Invalid coordinates');

    var url = LOCATION.getStaticMap(lat, lng, zoom, width, height);
    $.json({ url: url });
} 