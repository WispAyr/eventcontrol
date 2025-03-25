// Load environment variables first
require('dotenv').config();

// Set Total.js environment
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Load Total.js framework
require('total4');

// Initialize configuration
CONF.name = process.env.APP_NAME || 'Event Control';
CONF.version = process.env.APP_VERSION || '1.0.0';
CONF.author = 'Event Control Team';

// Directory configuration
CONF['directory-public'] = '~/public';
CONF['directory-views'] = '~/views';
CONF['directory-controllers'] = '~/controllers';
CONF['directory-definitions'] = '~/definitions';
CONF['directory-models'] = '~/models';
CONF['directory-resources'] = '~/resources';
CONF['directory-modules'] = '~/modules';
CONF['directory-schemas'] = '~/schemas';
CONF['directory-workers'] = '~/workers';
CONF['directory-databases'] = '~/databases';

// Security configuration
CONF['security.txt'] = 'Contact: mailto:security@eventcontrol.com';
CONF['default-cors'] = process.env.CORS_ORIGIN || '*';
CONF['default-cors-credentials'] = process.env.CORS_CREDENTIALS === 'true';

// WebSocket configuration
CONF['websocket-url'] = '/';
CONF['websocket-compress'] = true;
CONF['websocket-message-length'] = 1024;

// Database configuration
CONF['default-database'] = process.env.DB_NAME || 'eventcontrol.nosql';

// Session configuration
CONF['session-timeout'] = '24 hours';
CONF['session-cookie'] = 'eventcontrol';
CONF['session-secret'] = process.env.SESSION_SECRET || 'your-secret-key-here';

// SMTP configuration
CONF['mail-smtp'] = process.env.SMTP_HOST;
CONF['mail-smtp-options'] = { secure: process.env.SMTP_SECURE === 'true' };
CONF['mail-address-from'] = process.env.SMTP_FROM;

// Static files configuration
CONF['static-accepts-custom'] = ['.css', '.js', '.jpg', '.png', '.gif', '.ico', '.svg'];
CONF['default-static-expires'] = '1 day';

// Error handling
ON('error', function(err, name, uri) {
    console.error('Error:', { error: err.toString(), name, url: uri });
});

// Ready event
ON('ready', function() {
    console.log('Application is ready to handle requests.');
    console.log('Running on port:', process.env.PORT || 8000);
});

// Start the server
const options = {
    port: parseInt(process.env.PORT || '8000'),
    directory: process.cwd(),
    debug: process.env.NODE_ENV === 'development'
};

require('total4/debug')(options); 