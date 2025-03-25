const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');
const { AppError } = require('./error-handler');
const { ROLES, ROLE_HIERARCHY } = require('../models/user');

class AuthMiddleware {
    // Verify JWT token
    verifyToken(req, res, next) {
        try {
            // Get token from header or cookies
            const token = this.extractToken(req);
            
            if (!token) {
                throw new AppError(401, 'No authentication token provided');
            }

            // Verify token
            jwt.verify(token, config.security.jwtSecret, (err, decoded) => {
                if (err) {
                    if (err.name === 'TokenExpiredError') {
                        throw new AppError(401, 'Token has expired');
                    }
                    throw new AppError(401, 'Invalid token');
                }

                // Add user info to request
                req.user = decoded;
                next();
            });
        } catch (error) {
            next(error);
        }
    }

    // Extract token from request
    extractToken(req) {
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            // Get token from header
            return req.headers.authorization.split(' ')[1];
        } else if (req.cookies && req.cookies.token) {
            // Get token from cookie
            return req.cookies.token;
        }
        return null;
    }

    // Check if user has required role
    checkRole(requiredRole) {
        return (req, res, next) => {
            try {
                if (!req.user) {
                    throw new AppError(401, 'Authentication required');
                }

                const userRoleLevel = ROLE_HIERARCHY[req.user.role];
                const requiredRoleLevel = ROLE_HIERARCHY[requiredRole];

                if (userRoleLevel < requiredRoleLevel) {
                    throw new AppError(403, 'Insufficient permissions');
                }

                next();
            } catch (error) {
                next(error);
            }
        };
    }

    // Check if user has any of the required roles
    checkRoles(roles) {
        return (req, res, next) => {
            try {
                if (!req.user) {
                    throw new AppError(401, 'Authentication required');
                }

                const userRoleLevel = ROLE_HIERARCHY[req.user.role];
                const hasRequiredRole = roles.some(role => userRoleLevel >= ROLE_HIERARCHY[role]);

                if (!hasRequiredRole) {
                    throw new AppError(403, 'Insufficient permissions');
                }

                next();
            } catch (error) {
                next(error);
            }
        };
    }

    // Check if user owns the resource or has admin rights
    checkOwnership(getUserId) {
        return (req, res, next) => {
            try {
                if (!req.user) {
                    throw new AppError(401, 'Authentication required');
                }

                // Admin and system roles bypass ownership check
                if (this.isAdminOrSystem(req.user.role)) {
                    return next();
                }

                const resourceUserId = getUserId(req);
                if (req.user.id !== resourceUserId) {
                    throw new AppError(403, 'Access denied');
                }

                next();
            } catch (error) {
                next(error);
            }
        };
    }

    // Check if role is admin or system
    isAdminOrSystem(role) {
        return role === ROLES.ADMIN || role === ROLES.SYSTEM;
    }

    // Rate limiting for authentication attempts
    rateLimitAuth(req, res, next) {
        const ip = req.ip;
        const now = Date.now();

        // Initialize or get rate limit data for this IP
        if (!global.AUTH_RATE_LIMIT) global.AUTH_RATE_LIMIT = {};
        if (!global.AUTH_RATE_LIMIT[ip]) {
            global.AUTH_RATE_LIMIT[ip] = {
                count: 0,
                resetTime: now + 900000, // 15 minutes
                blocked: false,
                blockExpires: 0
            };
        }

        const limit = global.AUTH_RATE_LIMIT[ip];

        // Check if IP is blocked
        if (limit.blocked && now < limit.blockExpires) {
            throw new AppError(429, 'Too many failed attempts. Please try again later.');
        }

        // Reset if window has expired
        if (now > limit.resetTime) {
            limit.count = 0;
            limit.resetTime = now + 900000;
            limit.blocked = false;
        }

        // Increment attempt count
        limit.count++;

        // Block IP if too many attempts
        if (limit.count > 5) {
            limit.blocked = true;
            limit.blockExpires = now + 3600000; // 1 hour
            throw new AppError(429, 'Too many failed attempts. Please try again in 1 hour.');
        }

        next();
    }

    // Session management middleware
    session(req, res, next) {
        // Set secure session cookie options
        req.sessionOptions = {
            secret: config.security.sessionSecret,
            name: 'sessionId',
            cookie: {
                httpOnly: true,
                secure: config.app.env === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000 // 24 hours
            },
            resave: false,
            saveUninitialized: false
        };

        next();
    }
}

// Export singleton instance
module.exports = new AuthMiddleware(); 