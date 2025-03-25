const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/error-handler');

// User roles and their hierarchy
const ROLES = {
    USER: 'user',
    SUPERVISOR: 'supervisor',
    ADMIN: 'admin',
    SYSTEM: 'system'
};

// Role hierarchy for permission checks
const ROLE_HIERARCHY = {
    system: 3,
    admin: 2,
    supervisor: 1,
    user: 0
};

class User {
    constructor(data = {}) {
        this.id = data.id || crypto.randomBytes(16).toString('hex');
        this.username = data.username;
        this.email = data.email;
        this.password = data.password;
        this.firstName = data.firstName;
        this.lastName = data.lastName;
        this.role = data.role || ROLES.USER;
        this.active = typeof data.active === 'boolean' ? data.active : true;
        this.lastLogin = data.lastLogin || null;
        this.createdAt = data.createdAt || new Date();
        this.updatedAt = data.updatedAt || new Date();
        this.passwordResetToken = data.passwordResetToken || null;
        this.passwordResetExpires = data.passwordResetExpires || null;
    }

    // Validate user data
    validate() {
        const errors = [];

        // Username validation
        if (!this.username || this.username.length < 3) {
            errors.push('Username must be at least 3 characters long');
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(this.username)) {
            errors.push('Username can only contain letters, numbers, underscores, and hyphens');
        }

        // Email validation
        if (!this.email || !this.validateEmail(this.email)) {
            errors.push('Invalid email address');
        }

        // Password validation (only check if password is being set/updated)
        if (this.password) {
            if (this.password.length < 8) {
                errors.push('Password must be at least 8 characters long');
            }
            if (!/[A-Z]/.test(this.password)) {
                errors.push('Password must contain at least one uppercase letter');
            }
            if (!/[a-z]/.test(this.password)) {
                errors.push('Password must contain at least one lowercase letter');
            }
            if (!/[0-9]/.test(this.password)) {
                errors.push('Password must contain at least one number');
            }
            if (!/[!@#$%^&*]/.test(this.password)) {
                errors.push('Password must contain at least one special character (!@#$%^&*)');
            }
        }

        // Role validation
        if (!Object.values(ROLES).includes(this.role)) {
            errors.push('Invalid user role');
        }

        // Name validation
        if (this.firstName && this.firstName.length < 2) {
            errors.push('First name must be at least 2 characters long');
        }
        if (this.lastName && this.lastName.length < 2) {
            errors.push('Last name must be at least 2 characters long');
        }

        return errors;
    }

    // Email validation helper
    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    // Hash password before saving
    async hashPassword() {
        if (!this.password) return;

        try {
            const salt = await bcrypt.genSalt(12);
            this.password = await bcrypt.hash(this.password, salt);
        } catch (error) {
            logger.error('Error hashing password', error);
            throw new AppError(500, 'Error processing password');
        }
    }

    // Compare password
    async comparePassword(candidatePassword) {
        try {
            return await bcrypt.compare(candidatePassword, this.password);
        } catch (error) {
            logger.error('Error comparing passwords', error);
            throw new AppError(500, 'Error verifying password');
        }
    }

    // Generate JWT token
    generateToken() {
        try {
            return jwt.sign(
                {
                    id: this.id,
                    username: this.username,
                    role: this.role
                },
                config.security.jwtSecret,
                {
                    expiresIn: '24h'
                }
            );
        } catch (error) {
            logger.error('Error generating token', error);
            throw new AppError(500, 'Error generating authentication token');
        }
    }

    // Generate password reset token
    generatePasswordResetToken() {
        try {
            const resetToken = crypto.randomBytes(32).toString('hex');
            this.passwordResetToken = crypto
                .createHash('sha256')
                .update(resetToken)
                .digest('hex');
            this.passwordResetExpires = new Date(Date.now() + 3600000); // 1 hour
            return resetToken;
        } catch (error) {
            logger.error('Error generating password reset token', error);
            throw new AppError(500, 'Error generating password reset token');
        }
    }

    // Verify password reset token
    verifyPasswordResetToken(token) {
        const hashedToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');
        
        return (
            this.passwordResetToken === hashedToken &&
            this.passwordResetExpires > new Date()
        );
    }

    // Check if user has required role
    hasRole(requiredRole) {
        return ROLE_HIERARCHY[this.role] >= ROLE_HIERARCHY[requiredRole];
    }

    // Convert to JSON for response
    toJSON() {
        return {
            id: this.id,
            username: this.username,
            email: this.email,
            firstName: this.firstName,
            lastName: this.lastName,
            role: this.role,
            active: this.active,
            lastLogin: this.lastLogin,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }

    // Convert to database format
    toDatabase() {
        return {
            id: this.id,
            username: this.username,
            email: this.email,
            password: this.password,
            firstName: this.firstName,
            lastName: this.lastName,
            role: this.role,
            active: this.active,
            lastLogin: this.lastLogin,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            passwordResetToken: this.passwordResetToken,
            passwordResetExpires: this.passwordResetExpires
        };
    }
}

// Export User model and roles
module.exports = {
    User,
    ROLES,
    ROLE_HIERARCHY
}; 