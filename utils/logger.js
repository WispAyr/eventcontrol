const config = require('../config');
const Fs = require('fs');
const Path = require('path');

// Create logs directory if it doesn't exist
const logsDir = Path.join(process.cwd(), 'logs');
if (!Fs.existsSync(logsDir)) {
    Fs.mkdirSync(logsDir, { recursive: true });
}

// Log levels with corresponding colors and severity
const LOG_LEVELS = {
    debug: { value: 0, color: '\x1b[36m', label: 'DEBUG' },    // Cyan
    info: { value: 1, color: '\x1b[32m', label: 'INFO' },      // Green
    warn: { value: 2, color: '\x1b[33m', label: 'WARN' },      // Yellow
    error: { value: 3, color: '\x1b[31m', label: 'ERROR' },    // Red
    fatal: { value: 4, color: '\x1b[35m', label: 'FATAL' }     // Magenta
};

// Reset color code
const RESET = '\x1b[0m';

class Logger {
    constructor() {
        this.level = LOG_LEVELS[config.monitoring.logLevel] || LOG_LEVELS.info;
        this.logToFile = config.app.env === 'production';
        this.logStream = null;

        if (this.logToFile) {
            const date = new Date().toISOString().split('T')[0];
            const logFile = Path.join(logsDir, `${date}.log`);
            this.logStream = Fs.createWriteStream(logFile, { flags: 'a' });
        }
    }

    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const logLevel = LOG_LEVELS[level];
        
        // Format meta data
        const metaStr = Object.keys(meta).length ? 
            ' ' + JSON.stringify(meta) : '';

        // Console format (with colors)
        const consoleMessage = `${logLevel.color}[${timestamp}] [${logLevel.label}]${RESET} ${message}${metaStr}`;
        
        // File format (without colors)
        const fileMessage = `[${timestamp}] [${logLevel.label}] ${message}${metaStr}`;

        return { consoleMessage, fileMessage };
    }

    log(level, message, meta = {}) {
        if (LOG_LEVELS[level].value >= this.level.value) {
            const { consoleMessage, fileMessage } = this.formatMessage(level, message, meta);
            
            // Log to console
            console.log(consoleMessage);
            
            // Log to file in production
            if (this.logToFile && this.logStream) {
                this.logStream.write(fileMessage + '\n');
            }

            // Special handling for errors
            if (level === 'error' || level === 'fatal') {
                if (meta.error instanceof Error) {
                    console.error(meta.error);
                    if (this.logToFile && this.logStream) {
                        this.logStream.write(`${meta.error.stack}\n`);
                    }
                }
            }
        }
    }

    debug(message, meta = {}) {
        this.log('debug', message, meta);
    }

    info(message, meta = {}) {
        this.log('info', message, meta);
    }

    warn(message, meta = {}) {
        this.log('warn', message, meta);
    }

    error(message, error = null, meta = {}) {
        this.log('error', message, { ...meta, error });
    }

    fatal(message, error = null, meta = {}) {
        this.log('fatal', message, { ...meta, error });
    }

    // Request logging middleware
    requestLogger(req, res, next) {
        const start = Date.now();
        const requestId = req.headers['x-request-id'] || Math.random().toString(36).substring(7);

        // Log request
        this.info(`${req.method} ${req.url}`, {
            requestId,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        // Log response
        res.on('finish', () => {
            const duration = Date.now() - start;
            const level = res.statusCode >= 400 ? 'error' : 'info';
            
            this.log(level, `${req.method} ${req.url} ${res.statusCode}`, {
                requestId,
                duration: `${duration}ms`,
                contentLength: res.getHeader('content-length')
            });
        });

        next();
    }

    // Clean up old log files (keep last 30 days)
    async cleanOldLogs() {
        try {
            const files = await Fs.promises.readdir(logsDir);
            const now = new Date();
            const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));

            for (const file of files) {
                if (file.endsWith('.log')) {
                    const filePath = Path.join(logsDir, file);
                    const fileDate = new Date(file.split('.')[0]);

                    if (fileDate < thirtyDaysAgo) {
                        await Fs.promises.unlink(filePath);
                        this.debug(`Deleted old log file: ${file}`);
                    }
                }
            }
        } catch (error) {
            this.error('Error cleaning old log files', error);
        }
    }
}

// Create singleton instance
const logger = new Logger();

// Clean old logs daily
setInterval(() => logger.cleanOldLogs(), 24 * 60 * 60 * 1000);

module.exports = logger; 