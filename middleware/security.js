const config = require('../config');

module.exports = {
    // Security headers middleware
    securityHeaders: function(req, res) {
        // HSTS - Force HTTPS in production
        if (config.app.env === 'production') {
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        }

        // Content Security Policy
        res.setHeader('Content-Security-Policy', [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Adjust based on your needs
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            "font-src 'self'",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "form-action 'self'"
        ].join('; '));

        // XSS Protection
        res.setHeader('X-XSS-Protection', '1; mode=block');

        // Content Type Options
        res.setHeader('X-Content-Type-Options', 'nosniff');

        // Frame Options
        res.setHeader('X-Frame-Options', 'DENY');

        // Referrer Policy
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

        // Remove X-Powered-By header
        res.removeHeader('X-Powered-By');
    },

    // CORS middleware
    cors: function(req, res) {
        const origin = req.headers.origin;
        
        // Check if origin is allowed
        if (config.cors.origin === '*' || (Array.isArray(config.cors.origin) && config.cors.origin.includes(origin))) {
            res.setHeader('Access-Control-Allow-Origin', origin || '*');
            
            if (config.cors.credentials) {
                res.setHeader('Access-Control-Allow-Credentials', 'true');
            }
            
            // Allow common headers
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
            
            // Allow common methods
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            
            // Cache preflight requests
            res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
        }
    },

    // Rate limiting middleware
    rateLimit: function(req, res) {
        const ip = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        
        // Initialize or get rate limit data for this IP
        if (!global.RATE_LIMIT) global.RATE_LIMIT = {};
        if (!global.RATE_LIMIT[ip]) {
            global.RATE_LIMIT[ip] = {
                count: 0,
                resetTime: now + config.rateLimit.window
            };
        }
        
        const limit = global.RATE_LIMIT[ip];
        
        // Reset if window has expired
        if (now > limit.resetTime) {
            limit.count = 0;
            limit.resetTime = now + config.rateLimit.window;
        }
        
        // Increment request count
        limit.count++;
        
        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', config.rateLimit.max);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, config.rateLimit.max - limit.count));
        res.setHeader('X-RateLimit-Reset', Math.ceil(limit.resetTime / 1000));
        
        // Check if rate limit exceeded
        if (limit.count > config.rateLimit.max) {
            res.throw429();
            return false;
        }
        
        return true;
    },

    // Request validation middleware
    validateRequest: function(req) {
        // Validate content length
        const contentLength = parseInt(req.headers['content-length']) || 0;
        if (contentLength > config.storage.maxFileSize) {
            req.throw413();
            return false;
        }
        
        // Validate content type for file uploads
        if (req.files && req.files.length > 0) {
            const invalidFiles = req.files.filter(file => {
                const ext = file.filename.split('.').pop().toLowerCase();
                return !config.storage.allowedFileTypes.includes(ext);
            });
            
            if (invalidFiles.length > 0) {
                req.throw415();
                return false;
            }
        }
        
        return true;
    }
}; 