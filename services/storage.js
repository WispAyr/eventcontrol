const STORAGE = {};

// Initialize storage service
STORAGE.init = function() {
    // Configure file storage paths
    CONF.upload_path = PATH.public('uploads/');
    CONF.temp_path = PATH.temp();
    CONF.image_path = PATH.public('images/');

    // Configure S3 settings if enabled
    if (CONF.storage_type === 's3') {
        CONF.s3_bucket = process.env.S3_BUCKET;
        CONF.s3_region = process.env.S3_REGION;
        CONF.s3_key = process.env.S3_ACCESS_KEY;
        CONF.s3_secret = process.env.S3_SECRET_KEY;
    }

    // Ensure directories exist
    F.path.mkdir(CONF.upload_path);
    F.path.mkdir(CONF.temp_path);
    F.path.mkdir(CONF.image_path);

    // Configure file upload limits
    CONF.upload_limit = 10; // MB
    CONF.upload_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx', '.xls', '.xlsx'];
};

// File upload handler with optimization
STORAGE.upload = function($, options) {
    var self = this;
    var file = $.files[0];
    
    if (!file)
        return $.invalid('No file uploaded');

    // Validate file
    if (!self.validateFile(file))
        return $.invalid('Invalid file type or size');

    // Process file based on type
    if (file.isImage()) {
        self.processImage($, file, options, function(err, result) {
            if (err)
                return $.invalid(err);
            $.json(result);
        });
    } else {
        self.processFile($, file, options, function(err, result) {
            if (err)
                return $.invalid(err);
            $.json(result);
        });
    }
};

// Image processing with optimization
STORAGE.processImage = function($, file, options, callback) {
    var filename = UID() + '_' + file.filename;
    var path = PATH.public('images/' + filename);

    // Image processing options
    var opt = {
        width: options.width || 800,
        height: options.height || 600,
        quality: options.quality || 90,
        format: options.format || 'jpg'
    };

    // Process image using Total.js Image
    IMAGE(file.path, function(err, image) {
        if (err)
            return callback(err);

        image.resize(opt.width, opt.height);
        image.quality(opt.quality);
        image.minify();

        if (CONF.storage_type === 's3') {
            // Upload to S3
            image.save(path, function(err) {
                if (err)
                    return callback(err);

                self.uploadToS3(path, filename, file.type, function(err, url) {
                    if (err)
                        return callback(err);

                    // Clean up local file
                    F.unlink(path, F.error());

                    callback(null, {
                        filename: filename,
                        url: url,
                        size: file.size,
                        type: file.type,
                        width: image.width,
                        height: image.height
                    });
                });
            });
        } else {
            // Save locally
            image.save(path, function(err) {
                if (err)
                    return callback(err);

                callback(null, {
                    filename: filename,
                    url: '/images/' + filename,
                    size: file.size,
                    type: file.type,
                    width: image.width,
                    height: image.height
                });
            });
        }
    });
};

// File processing
STORAGE.processFile = function($, file, options, callback) {
    var filename = UID() + '_' + file.filename;
    var path = PATH.public('uploads/' + filename);

    if (CONF.storage_type === 's3') {
        // Upload to S3
        self.uploadToS3(file.path, filename, file.type, function(err, url) {
            if (err)
                return callback(err);

            callback(null, {
                filename: filename,
                url: url,
                size: file.size,
                type: file.type
            });
        });
    } else {
        // Save locally
        file.copy(path, function(err) {
            if (err)
                return callback(err);

            callback(null, {
                filename: filename,
                url: '/uploads/' + filename,
                size: file.size,
                type: file.type
            });
        });
    }
};

// S3 upload handler
STORAGE.uploadToS3 = function(filepath, filename, contentType, callback) {
    if (!CONF.storage_type === 's3')
        return callback(new Error('S3 storage not configured'));

    var AWS = require('aws-sdk');
    var s3 = new AWS.S3({
        accessKeyId: CONF.s3_key,
        secretAccessKey: CONF.s3_secret,
        region: CONF.s3_region
    });

    var stream = Fs.createReadStream(filepath);
    var params = {
        Bucket: CONF.s3_bucket,
        Key: filename,
        Body: stream,
        ContentType: contentType,
        ACL: 'public-read'
    };

    s3.upload(params, function(err, data) {
        if (err)
            return callback(err);
        callback(null, data.Location);
    });
};

// File validation
STORAGE.validateFile = function(file) {
    // Check file size
    if (file.size > (CONF.upload_limit * 1024 * 1024))
        return false;

    // Check file extension
    var ext = Path.extname(file.filename).toLowerCase();
    if (!CONF.upload_extensions.includes(ext))
        return false;

    return true;
};

// File removal
STORAGE.remove = function(filename, callback) {
    if (CONF.storage_type === 's3') {
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

        s3.deleteObject(params, callback);
    } else {
        var path = PATH.public(filename.startsWith('images/') ? filename : 'uploads/' + filename);
        F.unlink(path, callback || F.error());
    }
};

// Storage cleanup
STORAGE.cleanup = function() {
    // Clean up temporary files older than 1 day
    var yesterday = Date.now() - (24 * 60 * 60 * 1000);
    
    F.path.ls(CONF.temp_path, function(files) {
        files.forEach(function(file) {
            if (file.stats.mtime.getTime() < yesterday) {
                F.unlink(PATH.join(CONF.temp_path, file.name), F.error());
            }
        });
    });
};

// Schedule cleanup
SCHEDULE('2 0 * * *', function() {
    STORAGE.cleanup();
});

// Export storage service
global.STORAGE = STORAGE;

// Initialize storage service on app start
ON('ready', function() {
    STORAGE.init();
    LOGGER('storage', 'Storage service initialized');
}); 