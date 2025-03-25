const { User } = require('../models/user');
const { AppError } = require('../middleware/error-handler');
const logger = require('../utils/logger');
const sentry = require('../utils/sentry');
const db = require('../services/database');
const email = require('../services/email');

// Authentication controller using Total.js features
NEWSCHEMA('Auth', function(schema) {
    // Login schema
    schema.define('username', String, true);
    schema.define('password', String, true);
    
    // Registration schema
    schema.define('email', String, true);
    schema.define('username', String, true);
    schema.define('password', String, true);
    schema.define('firstName', String, true);
    schema.define('lastName', String, true);

    // Login action
    schema.action('login', {
        name: 'User login',
        params: '*username:String, *password:String',
        action: function($) {
            // Find user and verify password
            NOSQL('users').one()
                .where('username', $.params.username)
                .callback((err, user) => {
                    if (err)
                        return $.invalid(err);
                    
                    if (!user)
                        return $.invalid('User not found');
                    
                    // Verify password using Total.js password hash
                    if (!user.password || !PASSWORD.verify($.params.password, user.password))
                        return $.invalid('Invalid password');
                    
                    // Generate JWT token
                    const token = JWT.sign({
                        id: user.id,
                        role: user.role
                    }, CONF.secret, { expiry: '1 day' });
                    
                    // Set cookie and return response
                    $.cookie(CONF.cookie, token, '1 day');
                    $.success({ token: token, user: CLEAN(user, ['password']) });
                });
        }
    });

    // Register action
    schema.action('register', {
        name: 'User registration',
        params: '*email:String, *username:String, *password:String, *firstName:String, *lastName:String',
        action: function($) {
            // Check if user exists
            NOSQL('users').one()
                .where('username', $.params.username)
                .where('email', $.params.email)
                .callback((err, exists) => {
                    if (err)
                        return $.invalid(err);
                    
                    if (exists)
                        return $.invalid('User already exists');
                    
                    // Create new user
                    const user = {
                        id: UID(),
                        username: $.params.username,
                        email: $.params.email,
                        password: PASSWORD.hash($.params.password),
                        firstName: $.params.firstName,
                        lastName: $.params.lastName,
                        role: 'user',
                        created: NOW
                    };
                    
                    // Insert user into database
                    NOSQL('users').insert(user)
                        .callback((err) => {
                            if (err)
                                return $.invalid(err);
                            
                            // Generate token for new user
                            const token = JWT.sign({
                                id: user.id,
                                role: user.role
                            }, CONF.secret, { expiry: '1 day' });
                            
                            // Set cookie and return response
                            $.cookie(CONF.cookie, token, '1 day');
                            $.success({ token: token, user: CLEAN(user, ['password']) });
                        });
                });
        }
    });

    // Logout action
    schema.action('logout', {
        name: 'User logout',
        action: function($) {
            $.cookie(CONF.cookie, '', '-1 day');
            $.success();
        }
    });

    // Get current user action
    schema.action('me', {
        name: 'Get current user',
        action: function($) {
            const token = $.cookie(CONF.cookie);
            
            if (!token)
                return $.invalid('Not authenticated');
            
            JWT.verify(token, CONF.secret, (err, decoded) => {
                if (err)
                    return $.invalid('Invalid token');
                
                NOSQL('users').one()
                    .where('id', decoded.id)
                    .callback((err, user) => {
                        if (err || !user)
                            return $.invalid('User not found');
                        
                        $.success(CLEAN(user, ['password']));
                    });
            });
        }
    });

    // Password reset request action
    schema.action('reset-request', {
        name: 'Request password reset',
        params: '*email:String',
        action: function($) {
            NOSQL('users').one()
                .where('email', $.params.email)
                .callback((err, user) => {
                    if (err || !user)
                        return $.success(); // Don't reveal if email exists
                    
                    // Generate reset token
                    const resetToken = UID();
                    const expiry = NOW.add('2 hours');
                    
                    // Store reset token
                    NOSQL('password_resets').insert({
                        userId: user.id,
                        token: resetToken,
                        expiry: expiry
                    });
                    
                    // Send reset email
                    MAIL.send({
                        to: user.email,
                        subject: 'Password Reset Request',
                        body: `Reset your password using this link: ${CONF.baseurl}/reset-password/${resetToken}`
                    });
                    
                    $.success();
                });
        }
    });

    // Password reset action
    schema.action('reset-password', {
        name: 'Reset password',
        params: '*token:String, *password:String',
        action: function($) {
            NOSQL('password_resets').one()
                .where('token', $.params.token)
                .where('expiry', '>', NOW)
                .callback((err, reset) => {
                    if (err || !reset)
                        return $.invalid('Invalid or expired reset token');
                    
                    // Update user password
                    NOSQL('users').modify({
                        password: PASSWORD.hash($.params.password)
                    }).where('id', reset.userId)
                        .callback((err) => {
                            if (err)
                                return $.invalid(err);
                            
                            // Remove used reset token
                            NOSQL('password_resets').remove()
                                .where('token', $.params.token);
                            
                            $.success();
                        });
                });
        }
    });
});

// Middleware for protected routes
MIDDLEWARE('auth', function($) {
    var token = $.cookie(CONF.cookie);
    
    if (!token)
        return $.invalid(401, 'Not authenticated');
    
    JWT.verify(token, CONF.secret, function(err, decoded) {
        if (err)
            return $.invalid(401, 'Invalid token');
        
        $.user = decoded;
        $.next();
    });
});

// Role-based authorization middleware
MIDDLEWARE('authorize', function(roles) {
    return function($) {
        if (!$.user || !roles.includes($.user.role))
            return $.invalid(403, 'Insufficient permissions');
        $.next();
    };
});

class AuthController {
    // Register new user
    async register(req, res) {
        try {
            // Create new user instance
            const user = new User(req.body);

            // Validate user data
            const validationErrors = user.validate();
            if (validationErrors.length > 0) {
                throw new AppError(400, 'Validation failed', validationErrors);
            }

            // Hash password
            await user.hashPassword();

            // Save user to database
            await db.createUser(user.toDatabase());
            logger.info('New user registered', { username: user.username });

            // Send welcome email
            await email.sendWelcome(user);

            // Generate auth token
            const token = user.generateToken();

            // Set cookie in production
            if (process.env.NODE_ENV === 'production') {
                res.cookie('token', token, {
                    httpOnly: true,
                    secure: true,
                    sameSite: 'strict',
                    maxAge: 24 * 60 * 60 * 1000 // 24 hours
                });
            }

            // Return user data and token
            res.json({
                status: 'success',
                data: {
                    user: user.toJSON(),
                    token
                }
            });
        } catch (error) {
            sentry.captureException(error);
            throw error;
        }
    }

    // Login user
    async login(req, res) {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                throw new AppError(400, 'Username and password are required');
            }

            // Find user in database
            const userData = await db.findUserByUsername(username);
            if (!userData) {
                throw new AppError(401, 'Invalid credentials');
            }

            const user = new User(userData);

            // Verify password
            const isValid = await user.comparePassword(password);
            if (!isValid) {
                throw new AppError(401, 'Invalid credentials');
            }

            // Update last login
            user.lastLogin = new Date();
            await db.updateUser(user.id, { lastLogin: user.lastLogin });

            // Generate auth token
            const token = user.generateToken();

            // Set cookie in production
            if (process.env.NODE_ENV === 'production') {
                res.cookie('token', token, {
                    httpOnly: true,
                    secure: true,
                    sameSite: 'strict',
                    maxAge: 24 * 60 * 60 * 1000 // 24 hours
                });
            }

            // Return user data and token
            res.json({
                status: 'success',
                data: {
                    user: user.toJSON(),
                    token
                }
            });
        } catch (error) {
            sentry.captureException(error);
            throw error;
        }
    }

    // Logout user
    async logout(req, res) {
        try {
            // Clear auth cookie
            res.clearCookie('token');

            res.json({
                status: 'success',
                message: 'Successfully logged out'
            });
        } catch (error) {
            sentry.captureException(error);
            throw error;
        }
    }

    // Request password reset
    async forgotPassword(req, res) {
        try {
            const { email: userEmail } = req.body;

            if (!userEmail) {
                throw new AppError(400, 'Email is required');
            }

            // Find user by email
            const userData = await db.findUserByEmail(userEmail);
            if (!userData) {
                // Don't reveal that email doesn't exist
                res.json({
                    status: 'success',
                    message: 'If the email exists, password reset instructions will be sent'
                });
                return;
            }

            const user = new User(userData);

            // Generate reset token
            const resetToken = user.generatePasswordResetToken();
            await db.updateUser(user.id, {
                passwordResetToken: user.passwordResetToken,
                passwordResetExpires: user.passwordResetExpires
            });

            // Send reset email
            await email.sendPasswordReset(user, resetToken);

            res.json({
                status: 'success',
                message: 'If the email exists, password reset instructions will be sent'
            });
        } catch (error) {
            sentry.captureException(error);
            throw error;
        }
    }

    // Reset password
    async resetPassword(req, res) {
        try {
            const { token, password } = req.body;

            if (!token || !password) {
                throw new AppError(400, 'Token and new password are required');
            }

            // Find user by reset token
            const userData = await db.findUserByResetToken(token);
            if (!userData) {
                throw new AppError(400, 'Invalid or expired reset token');
            }

            const user = new User(userData);

            // Update password
            user.password = password;
            await user.hashPassword();

            // Clear reset token
            user.passwordResetToken = null;
            user.passwordResetExpires = null;

            // Save to database
            await db.updateUser(user.id, {
                password: user.password,
                passwordResetToken: null,
                passwordResetExpires: null
            });

            logger.info('Password reset successful');

            res.json({
                status: 'success',
                message: 'Password successfully reset'
            });
        } catch (error) {
            sentry.captureException(error);
            throw error;
        }
    }

    // Change password (authenticated)
    async changePassword(req, res) {
        try {
            const { currentPassword, newPassword } = req.body;

            if (!currentPassword || !newPassword) {
                throw new AppError(400, 'Current password and new password are required');
            }

            // Find user in database
            const userData = await db.findUserById(req.user.id);
            if (!userData) {
                throw new AppError(404, 'User not found');
            }

            const user = new User(userData);

            // Verify current password
            const isValid = await user.comparePassword(currentPassword);
            if (!isValid) {
                throw new AppError(401, 'Current password is incorrect');
            }

            // Update password
            user.password = newPassword;
            await user.hashPassword();

            // Save to database
            await db.updateUser(user.id, { password: user.password });
            logger.info('Password changed', { userId: user.id });

            // Send password changed notification
            await email.sendPasswordChanged(user);

            res.json({
                status: 'success',
                message: 'Password successfully changed'
            });
        } catch (error) {
            sentry.captureException(error);
            throw error;
        }
    }

    // Get current user profile
    async getProfile(req, res) {
        try {
            // Find user in database
            const userData = await db.findUserById(req.user.id);
            if (!userData) {
                throw new AppError(404, 'User not found');
            }

            const user = new User(userData);

            res.json({
                status: 'success',
                data: {
                    user: user.toJSON()
                }
            });
        } catch (error) {
            sentry.captureException(error);
            throw error;
        }
    }

    // Update user profile
    async updateProfile(req, res) {
        try {
            const allowedUpdates = ['firstName', 'lastName', 'email'];
            const updates = Object.keys(req.body)
                .filter(key => allowedUpdates.includes(key))
                .reduce((obj, key) => {
                    obj[key] = req.body[key];
                    return obj;
                }, {});

            if (Object.keys(updates).length === 0) {
                throw new AppError(400, 'No valid update fields provided');
            }

            // Find user in database
            const userData = await db.findUserById(req.user.id);
            if (!userData) {
                throw new AppError(404, 'User not found');
            }

            const user = new User({ ...userData, ...updates });

            // Validate updates
            const validationErrors = user.validate();
            if (validationErrors.length > 0) {
                throw new AppError(400, 'Validation failed', validationErrors);
            }

            // Save to database
            await db.updateUser(user.id, updates);
            logger.info('Profile updated', { userId: user.id });

            res.json({
                status: 'success',
                data: {
                    user: user.toJSON()
                }
            });
        } catch (error) {
            sentry.captureException(error);
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new AuthController(); 