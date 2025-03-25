exports.install = function() {
    ROUTE('POST /api/files/upload/', upload, ['upload', 'authorize']);
    ROUTE('POST /api/files/upload/image/', uploadImage, ['upload', 'authorize']);
    ROUTE('DELETE /api/files/{filename}/', remove, ['authorize']);
    ROUTE('GET /api/files/download/{filename}/', download, ['authorize']);
};

// File upload handler
function upload() {
    var $ = this;
    var options = $.body;
    STORAGE.upload($, options);
}

// Image upload handler with processing
function uploadImage() {
    var $ = this;
    var options = $.body;
    
    // Set image processing options
    options.isImage = true;
    options.width = parseInt(options.width) || 800;
    options.height = parseInt(options.height) || 600;
    options.quality = parseInt(options.quality) || 90;
    options.format = options.format || 'jpg';

    STORAGE.upload($, options);
}

// File removal handler
function remove() {
    var $ = this;
    var filename = $.params.filename;

    STORAGE.remove(filename, function(err) {
        if (err)
            return $.invalid(err);
        $.success();
    });
}

// File download handler
function download() {
    var $ = this;
    var filename = $.params.filename;
    var type = filename.startsWith('images/') ? 'images' : 'uploads';
    var path = PATH.public(type + '/' + filename);

    if (CONF.storage_type === 's3') {
        // Stream from S3
        var AWS = require('aws-sdk');
        var s3 = new AWS.S3({
            accessKeyId: CONF.s3_key,
            secretAccessKey: CONF.s3_secret,
            region: CONF.s3_region
        });

        var params = {
            Bucket: CONF.s3_bucket,
            Key: filename
        };

        s3.getObject(params, function(err, data) {
            if (err)
                return $.invalid(err);

            $.stream(data.Body, data.ContentType);
        });
    } else {
        // Stream from local file
        $.file(path);
    }
} 