const config = require('../config');
const logger = require('../utils/logger');

class AppError extends Error {
    constructor(statusCode, message, details = null) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

// Custom error responses based on status code
const errorResponses = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    413: 'Payload Too Large',
    415: 'Unsupported Media Type',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    503: 'Service Unavailable'
};

module.exports = {
    AppError,

    // Global error handling middleware
    errorHandler: function(err, req, res) {
        // Get status code from error or default to 500
        const statusCode = err.statusCode || 500;
        const isDev = config.app.env === 'development';

        // Log the error
        if (statusCode >= 500) {
            logger.error('Server error occurred', err, {
                url: req.url,
                method: req.method,
                params: req.params,
                query: req.query,
                body: req.body,
                headers: req.headers
            });
        } else {
            logger.warn('Client error occurred', {
                statusCode,
                message: err.message,
                url: req.url,
                method: req.method
            });
        }

        // Prepare error response
        const errorResponse = {
            status: 'error',
            code: statusCode,
            message: err.message || errorResponses[statusCode] || 'An unexpected error occurred'
        };

        // Add details in development or if error is operational
        if (isDev || err.isOperational) {
            if (err.details) {
                errorResponse.details = err.details;
            }
            if (isDev) {
                errorResponse.stack = err.stack;
            }
        }

        // Send error response
        res.status(statusCode).json(errorResponse);
    },

    // Not found middleware
    notFound: function(req, res) {
        throw new AppError(404, `Route ${req.method} ${req.url} not found`);
    },

    // Async error wrapper
    asyncHandler: function(fn) {
        return function(req, res, next) {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    }
}; 