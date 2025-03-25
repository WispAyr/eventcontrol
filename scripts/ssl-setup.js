const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

class SSLManager {
    constructor() {
        this.certsDir = path.join(process.cwd(), 'certs');
        this.domain = new URL(config.app.url).hostname;
        this.email = config.email.from;
    }

    async init() {
        // Create certs directory if it doesn't exist
        if (!fs.existsSync(this.certsDir)) {
            fs.mkdirSync(this.certsDir, { recursive: true });
        }

        // Check if certbot is installed
        try {
            await this.execCommand('certbot --version');
        } catch (error) {
            logger.error('Certbot is not installed. Please install it first.');
            logger.info('On Ubuntu/Debian: sudo apt-get install certbot');
            logger.info('On macOS: brew install certbot');
            process.exit(1);
        }
    }

    async obtainCertificate() {
        try {
            logger.info(`Obtaining SSL certificate for ${this.domain}`);

            const command = [
                'certbot certonly',
                '--standalone',
                `--domain ${this.domain}`,
                `--email ${this.email}`,
                '--agree-tos',
                '--non-interactive',
                '--preferred-challenges http',
                `--config-dir ${this.certsDir}`,
                `--work-dir ${this.certsDir}`,
                `--logs-dir ${this.certsDir}/logs`
            ].join(' ');

            await this.execCommand(command);
            
            logger.info('SSL certificate obtained successfully');
            
            // Copy certificates to our certs directory
            const certPath = path.join(this.certsDir, 'live', this.domain);
            const destPath = path.join(this.certsDir, 'current');
            
            if (!fs.existsSync(destPath)) {
                fs.mkdirSync(destPath, { recursive: true });
            }

            fs.copyFileSync(
                path.join(certPath, 'fullchain.pem'),
                path.join(destPath, 'fullchain.pem')
            );
            fs.copyFileSync(
                path.join(certPath, 'privkey.pem'),
                path.join(destPath, 'privkey.pem')
            );

            return {
                cert: path.join(destPath, 'fullchain.pem'),
                key: path.join(destPath, 'privkey.pem')
            };
        } catch (error) {
            logger.error('Failed to obtain SSL certificate', error);
            throw error;
        }
    }

    async renewCertificate() {
        try {
            logger.info('Renewing SSL certificate');

            const command = [
                'certbot renew',
                '--non-interactive',
                `--config-dir ${this.certsDir}`,
                `--work-dir ${this.certsDir}`,
                `--logs-dir ${this.certsDir}/logs`
            ].join(' ');

            await this.execCommand(command);
            logger.info('SSL certificate renewed successfully');
        } catch (error) {
            logger.error('Failed to renew SSL certificate', error);
            throw error;
        }
    }

    async checkCertificate() {
        const certPath = path.join(this.certsDir, 'current', 'fullchain.pem');
        
        if (!fs.existsSync(certPath)) {
            logger.warn('No SSL certificate found');
            return false;
        }

        try {
            const command = `openssl x509 -in ${certPath} -text -noout`;
            const { stdout } = await this.execCommand(command);
            
            // Parse expiry date
            const expiryMatch = stdout.match(/Not After : (.+)$/m);
            if (expiryMatch) {
                const expiryDate = new Date(expiryMatch[1]);
                const daysUntilExpiry = Math.floor((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
                
                logger.info(`SSL certificate expires in ${daysUntilExpiry} days`);
                
                // Warn if certificate is expiring soon
                if (daysUntilExpiry <= 30) {
                    logger.warn('SSL certificate is expiring soon');
                    return false;
                }
                
                return true;
            }
        } catch (error) {
            logger.error('Failed to check SSL certificate', error);
            return false;
        }
    }

    execCommand(command) {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve({ stdout, stderr });
            });
        });
    }
}

// Export the SSL manager
module.exports = new SSLManager();

// If script is run directly
if (require.main === module) {
    (async () => {
        const sslManager = module.exports;
        
        try {
            await sslManager.init();
            
            const hasValidCert = await sslManager.checkCertificate();
            if (!hasValidCert) {
                await sslManager.obtainCertificate();
            }
            
            process.exit(0);
        } catch (error) {
            logger.error('SSL setup failed', error);
            process.exit(1);
        }
    })();
} 