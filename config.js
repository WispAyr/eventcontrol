const Fs = require('fs');
const Path = require('path');

// Load environment variables from .env file
const envPath = Path.join(process.cwd(), '.env');
if (Fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

// Utility function to get environment variable with validation
function getEnvVar(key, defaultValue = undefined, required = false) {
    const value = process.env[key] || defaultValue;
    if (required && !value) {
        throw new Error(`Environment variable ${key} is required but not set`);
    }
    return value;
}

// Configuration object
const config = {
    app: {
        env: getEnvVar('NODE_ENV', 'development'),
        port: parseInt(getEnvVar('PORT', 8000)),
        url: getEnvVar('APP_URL', 'http://localhost:8000'),
        name: getEnvVar('APP_NAME', 'Event Control'),
        version: getEnvVar('APP_VERSION', '1.0.0')
    },
    security: {
        sessionSecret: getEnvVar('SESSION_SECRET', null, true),
        csrfSecret: getEnvVar('CSRF_SECRET', null, true),
        jwtSecret: getEnvVar('JWT_SECRET', null, true),
        cookieSecret: getEnvVar('COOKIE_SECRET', null, true)
    },
    cors: {
        origin: getEnvVar('CORS_ORIGIN', '*'),
        credentials: getEnvVar('CORS_CREDENTIALS', 'true') === 'true'
    },
    database: {
        name: getEnvVar('DB_NAME', 'eventcontrol.nosql'),
        path: getEnvVar('DB_PATH', '~/databases')
    },
    email: {
        host: getEnvVar('SMTP_HOST'),
        port: parseInt(getEnvVar('SMTP_PORT', '587')),
        secure: getEnvVar('SMTP_SECURE', 'true') === 'true',
        user: getEnvVar('SMTP_USER'),
        pass: getEnvVar('SMTP_PASS'),
        from: getEnvVar('SMTP_FROM')
    },
    services: {
        weatherApiKey: getEnvVar('WEATHER_API_KEY'),
        mapsApiKey: getEnvVar('MAPS_API_KEY'),
        what3wordsApiKey: getEnvVar('WHAT3WORDS_API_KEY')
    },
    monitoring: {
        sentryDsn: getEnvVar('SENTRY_DSN'),
        logLevel: getEnvVar('LOG_LEVEL', 'debug')
    },
    storage: {
        path: getEnvVar('STORAGE_PATH', '~/storage'),
        maxFileSize: parseInt(getEnvVar('MAX_FILE_SIZE', '10485760')),
        allowedFileTypes: getEnvVar('ALLOWED_FILE_TYPES', 'jpg,jpeg,png,gif,pdf,doc,docx').split(',')
    },
    cache: {
        enabled: getEnvVar('CACHE_ENABLED', 'true') === 'true',
        duration: parseInt(getEnvVar('CACHE_DURATION', '3600'))
    },
    rateLimit: {
        window: parseInt(getEnvVar('RATE_LIMIT_WINDOW', '900000')),
        max: parseInt(getEnvVar('RATE_LIMIT_MAX', '100'))
    }
};

// Validate required configuration
function validateConfig() {
    const isDev = config.app.env === 'development';
    
    // In production, ensure all security-related configs are set
    if (!isDev) {
        if (!config.security.sessionSecret || config.security.sessionSecret === 'change-this-to-a-secure-secret') {
            throw new Error('Production environment requires a secure SESSION_SECRET');
        }
        if (!config.security.csrfSecret || config.security.csrfSecret === 'change-this-to-a-secure-secret') {
            throw new Error('Production environment requires a secure CSRF_SECRET');
        }
        if (!config.security.jwtSecret || config.security.jwtSecret === 'change-this-to-a-secure-secret') {
            throw new Error('Production environment requires a secure JWT_SECRET');
        }
        if (!config.security.cookieSecret || config.security.cookieSecret === 'change-this-to-a-secure-secret') {
            throw new Error('Production environment requires a secure COOKIE_SECRET');
        }
        
        // Validate CORS in production
        if (config.cors.origin === '*') {
            throw new Error('Production environment should not use wildcard CORS origin');
        }
    }
}

// Run validation
validateConfig();

module.exports = config; 