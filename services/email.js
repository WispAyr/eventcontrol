const logger = require('../utils/logger');
const sentry = require('../utils/sentry');
const config = require('../config');

class EmailService {
    constructor() {
        this.initialized = false;
    }

    // Initialize email service
    async init() {
        if (this.initialized) return;

        try {
            // Total.js automatically configures mail settings from framework config
            this.initialized = true;
            logger.info('Email service initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize email service', error);
            sentry.captureException(error);
            throw error;
        }
    }

    // Send password reset email
    async sendPasswordReset(user, resetToken) {
        try {
            const resetUrl = `${config.app.url}/reset-password?token=${resetToken}`;

            // Using Total.js built-in mail functionality
            MAIL.send({
                to: user.email,
                subject: 'Password Reset Request - Event Control',
                template: 'password-reset',
                model: {
                    firstName: user.firstName || user.username,
                    resetUrl,
                    validHours: 1
                }
            });

            logger.info('Password reset email sent', { email: user.email });
        } catch (error) {
            logger.error('Failed to send password reset email', error);
            sentry.captureException(error);
            throw error;
        }
    }

    // Send welcome email
    async sendWelcome(user) {
        try {
            // Using Total.js built-in mail functionality
            MAIL.send({
                to: user.email,
                subject: 'Welcome to Event Control',
                template: 'welcome',
                model: {
                    firstName: user.firstName || user.username,
                    loginUrl: config.app.url
                }
            });

            logger.info('Welcome email sent', { email: user.email });
        } catch (error) {
            logger.error('Failed to send welcome email', error);
            sentry.captureException(error);
            throw error;
        }
    }

    // Send password changed notification
    async sendPasswordChanged(user) {
        try {
            // Using Total.js built-in mail functionality
            MAIL.send({
                to: user.email,
                subject: 'Password Changed - Event Control',
                template: 'password-changed',
                model: {
                    firstName: user.firstName || user.username,
                    supportEmail: config.support.email
                }
            });

            logger.info('Password changed email sent', { email: user.email });
        } catch (error) {
            logger.error('Failed to send password changed email', error);
            sentry.captureException(error);
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new EmailService(); 