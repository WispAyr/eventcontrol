const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class SecretGenerator {
    constructor() {
        this.envPath = path.join(process.cwd(), '.env');
        this.exampleEnvPath = path.join(process.cwd(), '.env.example');
    }

    generateSecret(length = 64) {
        return crypto.randomBytes(length).toString('hex');
    }

    generateSecrets() {
        const secrets = {
            SESSION_SECRET: this.generateSecret(),
            CSRF_SECRET: this.generateSecret(),
            JWT_SECRET: this.generateSecret(),
            COOKIE_SECRET: this.generateSecret()
        };

        return secrets;
    }

    async updateEnvFile(secrets) {
        try {
            // Read the current .env file if it exists, otherwise use .env.example
            let envContent = '';
            
            if (fs.existsSync(this.envPath)) {
                envContent = fs.readFileSync(this.envPath, 'utf8');
            } else if (fs.existsSync(this.exampleEnvPath)) {
                envContent = fs.readFileSync(this.exampleEnvPath, 'utf8');
            } else {
                throw new Error('No .env or .env.example file found');
            }

            // Update each secret in the env content
            Object.entries(secrets).forEach(([key, value]) => {
                const regex = new RegExp(`${key}=.*`, 'g');
                if (envContent.match(regex)) {
                    envContent = envContent.replace(regex, `${key}=${value}`);
                } else {
                    envContent += `\n${key}=${value}`;
                }
            });

            // Backup existing .env file if it exists
            if (fs.existsSync(this.envPath)) {
                const backupPath = `${this.envPath}.backup-${Date.now()}`;
                fs.copyFileSync(this.envPath, backupPath);
                logger.info(`Backed up existing .env file to ${backupPath}`);
            }

            // Write the updated content to .env file
            fs.writeFileSync(this.envPath, envContent);
            logger.info('Successfully updated .env file with new secrets');

            // Set secure permissions on .env file
            fs.chmodSync(this.envPath, 0o600);
            logger.info('Set secure permissions on .env file');

            return true;
        } catch (error) {
            logger.error('Failed to update .env file', error);
            throw error;
        }
    }

    validateSecrets(secrets) {
        const issues = [];

        Object.entries(secrets).forEach(([key, value]) => {
            if (!value || value.length < 32) {
                issues.push(`${key} is too short (minimum 32 characters)`);
            }
            if (value === 'change-this-to-a-secure-secret') {
                issues.push(`${key} is using default value`);
            }
        });

        return issues;
    }

    async rotateSecrets() {
        try {
            logger.info('Generating new secrets...');
            const secrets = this.generateSecrets();

            // Validate the generated secrets
            const issues = this.validateSecrets(secrets);
            if (issues.length > 0) {
                throw new Error(`Secret validation failed:\n${issues.join('\n')}`);
            }

            // Update the .env file with new secrets
            await this.updateEnvFile(secrets);

            logger.info('Secret rotation completed successfully');
            return true;
        } catch (error) {
            logger.error('Secret rotation failed', error);
            throw error;
        }
    }
}

// Export the secret generator
module.exports = new SecretGenerator();

// If script is run directly
if (require.main === module) {
    (async () => {
        const secretGenerator = module.exports;
        
        try {
            await secretGenerator.rotateSecrets();
            process.exit(0);
        } catch (error) {
            logger.error('Secret generation failed', error);
            process.exit(1);
        }
    })();
} 