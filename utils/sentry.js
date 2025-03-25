const Sentry = require('@sentry/node');
const { ProfilingIntegration } = require('@sentry/profiling-node');
const { Integrations } = require('@sentry/node');
const config = require('../config');
const logger = require('./logger');

class SentryManager {
    constructor() {
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) {
            return;
        }

        try {
            if (!config.monitoring.sentryDsn) {
                logger.warn('Sentry DSN not configured. Error monitoring will be disabled.');
                return;
            }

            Sentry.init({
                dsn: config.monitoring.sentryDsn,
                environment: config.app.env,
                release: config.app.version,
                integrations: [
                    // Enable HTTP calls tracing
                    new Sentry.Integrations.Http({ tracing: true }),
                    // Enable Express middleware tracing
                    new Integrations.Express(),
                    // Enable performance monitoring
                    new ProfilingIntegration(),
                ],
                // Performance Monitoring
                tracesSampleRate: config.app.env === 'production' ? 0.1 : 1.0,
                // Set sampling rate for profiling
                profilesSampleRate: config.app.env === 'production' ? 0.1 : 1.0,
                // Capture error context
                maxBreadcrumbs: 50,
                attachStacktrace: true,
                // Don't send PII data
                sendDefaultPii: false,
                beforeSend(event) {
                    // Sanitize error events before sending
                    if (event.user) {
                        delete event.user.ip_address;
                        delete event.user.email;
                    }
                    return event;
                }
            });

            this.isInitialized = true;
            logger.info('Sentry initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Sentry', error);
        }
    }

    // Middleware to capture request data
    requestHandler() {
        return Sentry.Handlers.requestHandler({
            // Only include necessary request data
            ip: true,
            user: false,
            request: ['method', 'url', 'query_string']
        });
    }

    // Error handler middleware
    errorHandler() {
        return Sentry.Handlers.errorHandler({
            shouldHandleError(error) {
                // Only report errors with status code >= 500 and specific error types
                return error.statusCode >= 500 || error.name === 'UnauthorizedError';
            }
        });
    }

    // Capture exception with additional context
    captureException(error, context = {}) {
        if (!this.isInitialized) {
            logger.error('Sentry not initialized', error);
            return;
        }

        Sentry.withScope((scope) => {
            // Add additional context
            if (context.user) {
                scope.setUser({
                    id: context.user.id,
                    username: context.user.username,
                    role: context.user.role
                });
            }

            if (context.tags) {
                Object.entries(context.tags).forEach(([key, value]) => {
                    scope.setTag(key, value);
                });
            }

            if (context.extra) {
                Object.entries(context.extra).forEach(([key, value]) => {
                    scope.setExtra(key, value);
                });
            }

            // Set error level
            if (context.level) {
                scope.setLevel(context.level);
            }

            // Capture the error
            Sentry.captureException(error);
        });
    }

    // Start transaction for performance monitoring
    startTransaction(context) {
        return Sentry.startTransaction(context);
    }

    // Set user context for the current scope
    setUser(user) {
        if (!user || !user.id) return;

        Sentry.setUser({
            id: user.id,
            username: user.username,
            role: user.role
        });
    }

    // Clear user context
    clearUser() {
        Sentry.setUser(null);
    }

    // Add breadcrumb for debugging
    addBreadcrumb(breadcrumb) {
        Sentry.addBreadcrumb(breadcrumb);
    }

    // Flush events before shutting down
    async close(timeout = 2000) {
        if (!this.isInitialized) return;

        try {
            await Sentry.close(timeout);
            logger.info('Sentry connection closed');
        } catch (error) {
            logger.error('Error closing Sentry connection', error);
        }
    }
}

// Export singleton instance
module.exports = new SentryManager(); 