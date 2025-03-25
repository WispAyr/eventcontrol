const Fs = require('fs');
const Path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const sentry = require('../utils/sentry');

const DBSERVICE = {};

// Initialize database service
DBSERVICE.init = function() {
    // Configure NoSQL databases
    CONF.database_events = PATH.databases('events.nosql');
    CONF.database_incidents = PATH.databases('incidents.nosql');
    CONF.database_notifications = PATH.databases('notifications.nosql');
    CONF.database_users = PATH.databases('users.nosql');
    CONF.database_history = PATH.databases('history.nosql');

    // Set up data retention policies
    this.setupRetentionPolicies();

    // Set up backup schedule
    this.setupBackupSchedule();

    // Set up query optimization
    this.setupQueryOptimization();
};

// Configure data retention policies
DBSERVICE.setupRetentionPolicies = function() {
    // Clean up old notifications (older than 30 days and archived)
    SCHEDULE('0 0 * * *', function() {
        var thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        NOSQL('notifications')
            .remove()
            .where('status', 'archived')
            .where('createdAt', '<', thirtyDaysAgo)
            .callback(() => LOGGER('database', 'Cleaned up old notifications'));
    });

    // Clean up old history records (older than 90 days)
    SCHEDULE('0 1 * * *', function() {
        var ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        NOSQL('history')
            .remove()
            .where('createdAt', '<', ninetyDaysAgo)
            .callback(() => LOGGER('database', 'Cleaned up old history records'));
    });

    // Archive old events (completed and older than 60 days)
    SCHEDULE('0 2 * * *', function() {
        var sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        NOSQL('events')
            .modify({ status: 'archived' })
            .where('status', 'completed')
            .where('endDate', '<', sixtyDaysAgo)
            .callback(() => LOGGER('database', 'Archived old events'));
    });
};

// Configure database backup
DBSERVICE.setupBackupSchedule = function() {
    // Daily backup at 3 AM
    SCHEDULE('0 3 * * *', function() {
        var date = new Date().format('yyyy-MM-dd');
        var backupDir = PATH.databases('backups/' + date);

        // Ensure backup directory exists
        F.path.mkdir(backupDir);

        // Backup each database
        ['events', 'incidents', 'notifications', 'users', 'history'].forEach(function(dbName) {
            var source = PATH.databases(dbName + '.nosql');
            var target = PATH.join(backupDir, dbName + '.nosql');
            
            // Copy database file
            F.copy(source, target, function(err) {
                if (err)
                    ERROR('backup', err);
                else
                    LOGGER('backup', `Database ${dbName} backed up successfully`);
            });
        });

        // Clean up old backups (keep last 7 days)
        F.path.ls(PATH.databases('backups'), function(files) {
            var sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            files.forEach(function(file) {
                var fileDate = new Date(file.substring(0, 10));
                if (fileDate < sevenDaysAgo) {
                    F.path.rm(PATH.join(PATH.databases('backups'), file));
                    LOGGER('backup', `Removed old backup: ${file}`);
                }
            });
        });
    });
};

// Configure query optimization
DBSERVICE.setupQueryOptimization = function() {
    // Configure NoSQL cache
    CONF.nosql_cache = true;
    CONF.nosql_cache_count = 1000;
    CONF.nosql_cache_duration = '5 minutes';

    // Set up query timeout
    CONF.default_request_timeout = '30 seconds';

    // Configure worker
    if (F.isWorker) {
        // Handle heavy queries in worker
        NEWOPERATION('heavyQuery', function($) {
            var options = $.options;
            NOSQL(options.collection)
                .find()
                .where(options.query)
                .callback($.done());
        });
    }
};

// Query helper for optimized searches
DBSERVICE.optimizedQuery = function(collection, query, callback) {
    if (query.complex) {
        // Run complex queries in worker
        OPERATION('heavyQuery', { collection: collection, query: query }, callback);
    } else {
        // Simple queries run directly
        NOSQL(collection)
            .find()
            .where(query)
            .callback(callback);
    }
};

// Export database service
global.DBSERVICE = DBSERVICE;

// Initialize database service on app start
ON('ready', function() {
    DBSERVICE.init();
    LOGGER('database', 'Database service initialized');
});

class DatabaseService {
    constructor() {
        this.db = null;
        this.collections = {};
        this.initialized = false;
    }

    // Initialize database
    async init() {
        if (this.initialized) return;

        try {
            // Ensure database directory exists
            const dbPath = Path.resolve(process.cwd(), config.database.path);
            if (!Fs.existsSync(dbPath)) {
                Fs.mkdirSync(dbPath, { recursive: true });
            }

            // Initialize NoSQL database
            this.db = NOSQL(config.database.name);
            
            // Initialize collections
            this.collections = {
                users: this.db.collection('users'),
                events: this.db.collection('events')
            };

            // Create indexes
            await this.createIndexes();

            this.initialized = true;
            logger.info('Database initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize database', error);
            sentry.captureException(error);
            throw error;
        }
    }

    // Create database indexes
    async createIndexes() {
        try {
            // User indexes
            await this.collections.users.index('id');
            await this.collections.users.index('username', true); // unique
            await this.collections.users.index('email', true);   // unique
            await this.collections.users.index('passwordResetToken');

            // Event indexes
            await this.collections.events.index('id');
            await this.collections.events.index('name');
            await this.collections.events.index('type');
            await this.collections.events.index('status');
            await this.collections.events.index('priority');
            await this.collections.events.index('startDate');
            await this.collections.events.index('createdBy');
            await this.collections.events.index('venue');
            await this.collections.events.index('tags');

            logger.info('Database indexes created successfully');
        } catch (error) {
            logger.error('Failed to create database indexes', error);
            sentry.captureException(error);
            throw error;
        }
    }

    // Event operations
    async createEvent(eventData) {
        try {
            await this.collections.events.insert(eventData);
            return eventData;
        } catch (error) {
            logger.error('Failed to create event', error);
            sentry.captureException(error);
            throw error;
        }
    }

    async findEventById(id) {
        try {
            return await this.collections.events.find()
                .where('id', id)
                .first();
        } catch (error) {
            logger.error('Failed to find event by ID', error);
            sentry.captureException(error);
            throw error;
        }
    }

    async findEvents(query = {}) {
        try {
            let builder = this.collections.events.find();

            // Apply filters
            if (query.type) {
                builder = builder.where('type', query.type);
            }
            if (query.status) {
                builder = builder.where('status', query.status);
            }
            if (query.priority) {
                builder = builder.where('priority', query.priority);
            }
            if (query.venue) {
                builder = builder.where('venue', query.venue);
            }
            if (query.createdBy) {
                builder = builder.where('createdBy', query.createdBy);
            }
            if (query.tags && query.tags.length > 0) {
                builder = builder.in('tags', query.tags);
            }

            // Date range filters
            if (query.startDate) {
                builder = builder.where('startDate >=', query.startDate);
            }
            if (query.endDate) {
                builder = builder.where('endDate <=', query.endDate);
            }

            // Text search
            if (query.search) {
                builder = builder.search('name', query.search);
            }

            // Sorting
            if (query.sort) {
                const [field, order] = query.sort.split(':');
                builder = builder.sort(field, order === 'desc');
            } else {
                // Default sort by creation date, newest first
                builder = builder.sort('createdAt', true);
            }

            // Pagination
            const page = parseInt(query.page) || 1;
            const limit = parseInt(query.limit) || 10;
            const skip = (page - 1) * limit;

            builder = builder.skip(skip).take(limit);

            // Execute query
            const events = await builder.callback();
            const total = await this.collections.events.count();

            return {
                events,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            logger.error('Failed to find events', error);
            sentry.captureException(error);
            throw error;
        }
    }

    async updateEvent(id, updates) {
        try {
            await this.collections.events.modify(updates)
                .where('id', id);
            return await this.findEventById(id);
        } catch (error) {
            logger.error('Failed to update event', error);
            sentry.captureException(error);
            throw error;
        }
    }

    async deleteEvent(id) {
        try {
            await this.collections.events.remove()
                .where('id', id);
            return true;
        } catch (error) {
            logger.error('Failed to delete event', error);
            sentry.captureException(error);
            throw error;
        }
    }

    // User operations
    async createUser(userData) {
        try {
            const exists = await this.collections.users.find()
                .where('username', userData.username)
                .or()
                .where('email', userData.email)
                .first();

            if (exists) {
                throw new Error('Username or email already exists');
            }

            await this.collections.users.insert(userData);
            return userData;
        } catch (error) {
            logger.error('Failed to create user', error);
            sentry.captureException(error);
            throw error;
        }
    }

    async findUserById(id) {
        try {
            return await this.collections.users.find()
                .where('id', id)
                .first();
        } catch (error) {
            logger.error('Failed to find user by ID', error);
            sentry.captureException(error);
            throw error;
        }
    }

    async findUserByUsername(username) {
        try {
            return await this.collections.users.find()
                .where('username', username)
                .first();
        } catch (error) {
            logger.error('Failed to find user by username', error);
            sentry.captureException(error);
            throw error;
        }
    }

    async findUserByEmail(email) {
        try {
            return await this.collections.users.find()
                .where('email', email)
                .first();
        } catch (error) {
            logger.error('Failed to find user by email', error);
            sentry.captureException(error);
            throw error;
        }
    }

    async findUserByResetToken(token) {
        try {
            return await this.collections.users.find()
                .where('passwordResetToken', token)
                .where('passwordResetExpires >', new Date())
                .first();
        } catch (error) {
            logger.error('Failed to find user by reset token', error);
            sentry.captureException(error);
            throw error;
        }
    }

    async updateUser(id, updates) {
        try {
            // Check for unique constraints if updating username or email
            if (updates.username || updates.email) {
                const exists = await this.collections.users.find()
                    .where('id <>', id)
                    .and()
                    .where(function() {
                        if (updates.username) this.where('username', updates.username);
                        if (updates.email) this.or().where('email', updates.email);
                    })
                    .first();

                if (exists) {
                    throw new Error('Username or email already exists');
                }
            }

            await this.collections.users.modify(updates)
                .where('id', id);

            return await this.findUserById(id);
        } catch (error) {
            logger.error('Failed to update user', error);
            sentry.captureException(error);
            throw error;
        }
    }

    async deleteUser(id) {
        try {
            await this.collections.users.remove()
                .where('id', id);
            return true;
        } catch (error) {
            logger.error('Failed to delete user', error);
            sentry.captureException(error);
            throw error;
        }
    }

    // Database maintenance
    async backup() {
        try {
            const backupDir = Path.join(process.cwd(), 'backups');
            if (!Fs.existsSync(backupDir)) {
                Fs.mkdirSync(backupDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = Path.join(backupDir, `backup-${timestamp}.nosql`);

            await this.db.backup(backupPath);
            logger.info('Database backup created successfully', { path: backupPath });
            return backupPath;
        } catch (error) {
            logger.error('Failed to create database backup', error);
            sentry.captureException(error);
            throw error;
        }
    }

    async cleanup() {
        try {
            // Remove expired password reset tokens
            await this.collections.users.modify({
                passwordResetToken: null,
                passwordResetExpires: null
            }).where('passwordResetExpires <', new Date());

            logger.info('Database cleanup completed successfully');
        } catch (error) {
            logger.error('Failed to cleanup database', error);
            sentry.captureException(error);
            throw error;
        }
    }

    // Close database connection
    async close() {
        if (!this.initialized) return;

        try {
            await this.backup();
            await this.cleanup();
            this.db = null;
            this.collections = {};
            this.initialized = false;
            logger.info('Database connection closed successfully');
        } catch (error) {
            logger.error('Failed to close database connection', error);
            sentry.captureException(error);
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new DatabaseService(); 