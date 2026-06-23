/**
 * Detect Environment
 * Detects environment files and required environment variables
 * IMPORTANT: Never exposes secret values - only detects existence and names
 */
import { fileExists } from '@turpan/shared';
import { readdirSync, readFileSync } from 'fs';
import { looksLikeSecret } from './ProjectFingerprint.js';
export function detectEnv(projectRoot) {
    const envFiles = [];
    const envRequirements = [];
    // Common env file names
    const envFilePatterns = [
        '.env',
        '.env.local',
        '.env.development',
        '.env.production',
        '.env.test',
        '.env.staging',
        '.env.example',
        '.env.sample',
        '.env.template',
        'env.txt',
        '.envrc',
    ];
    for (const pattern of envFilePatterns) {
        if (fileExists(`${projectRoot}/${pattern}`)) {
            envFiles.push(pattern);
        }
    }
    // Also check for multiple .env.* files
    try {
        const items = readdirSync(projectRoot);
        for (const item of items) {
            if (item.startsWith('.env') && !envFiles.includes(item)) {
                envFiles.push(item);
            }
        }
    }
    catch {
        // Ignore
    }
    // Detect required env vars from code patterns
    const envVars = detectEnvFromCode(projectRoot);
    envRequirements.push(...envVars);
    return { envFiles, envRequirements };
}
function detectEnvFromCode(projectRoot) {
    const requirements = [];
    const seenVars = new Set();
    // Common env var names that are often required
    const commonEnvVars = [
        { name: 'NODE_ENV', description: 'Node.js environment', isSecret: false },
        { name: 'PORT', description: 'Server port', isSecret: false },
        { name: 'HOST', description: 'Server host', isSecret: false },
        { name: 'DATABASE_URL', description: 'Database connection string', isSecret: true },
        { name: 'DATABASE_HOST', description: 'Database host', isSecret: false },
        { name: 'DATABASE_PORT', description: 'Database port', isSecret: false },
        { name: 'REDIS_URL', description: 'Redis connection string', isSecret: true },
        { name: 'REDIS_HOST', description: 'Redis host', isSecret: false },
        { name: 'API_KEY', description: 'API key for external services', isSecret: true },
        { name: 'API_SECRET', description: 'API secret for external services', isSecret: true },
        { name: 'JWT_SECRET', description: 'JWT signing secret', isSecret: true },
        { name: 'JWT_EXPIRES_IN', description: 'JWT expiration time', isSecret: false },
        { name: 'SESSION_SECRET', description: 'Session secret', isSecret: true },
        { name: 'AUTH_SECRET', description: 'Authentication secret', isSecret: true },
        { name: 'NEXTAUTH_SECRET', description: 'NextAuth.js secret', isSecret: true },
        { name: 'NEXTAUTH_URL', description: 'NextAuth.js URL', isSecret: false },
        { name: 'STRIPE_SECRET_KEY', description: 'Stripe secret key', isSecret: true },
        { name: 'STRIPE_PUBLISHABLE_KEY', description: 'Stripe publishable key', isSecret: false },
        { name: 'SENDGRID_API_KEY', description: 'SendGrid API key', isSecret: true },
        { name: 'TWILIO_ACCOUNT_SID', description: 'Twilio account SID', isSecret: true },
        { name: 'TWILIO_AUTH_TOKEN', description: 'Twilio auth token', isSecret: true },
        { name: 'AWS_ACCESS_KEY_ID', description: 'AWS access key', isSecret: true },
        { name: 'AWS_SECRET_ACCESS_KEY', description: 'AWS secret key', isSecret: true },
        { name: 'S3_BUCKET', description: 'S3 bucket name', isSecret: false },
        { name: 'SLACK_BOT_TOKEN', description: 'Slack bot token', isSecret: true },
        { name: 'SLACK_SIGNING_SECRET', description: 'Slack signing secret', isSecret: true },
        { name: 'TELEGRAM_BOT_TOKEN', description: 'Telegram bot token', isSecret: true },
        { name: 'DISCORD_BOT_TOKEN', description: 'Discord bot token', isSecret: true },
        { name: 'GITHUB_TOKEN', description: 'GitHub token', isSecret: true },
        { name: 'OPENAI_API_KEY', description: 'OpenAI API key', isSecret: true },
        { name: 'ANTHROPIC_API_KEY', description: 'Anthropic API key', isSecret: true },
        { name: 'LOG_LEVEL', description: 'Logging level', isSecret: false },
        { name: 'LOG_DIR', description: 'Log directory', isSecret: false },
        { name: 'CORS_ORIGIN', description: 'CORS origin', isSecret: false },
        { name: 'ALLOWED_HOSTS', description: 'Allowed hosts', isSecret: false },
        { name: 'SECRET_KEY', description: 'Application secret key', isSecret: true },
        { name: 'ENCRYPTION_KEY', description: 'Encryption key', isSecret: true },
        { name: 'SALT', description: 'Password salt', isSecret: true },
    ];
    // Look for common env var usage patterns in source files
    const envVarPatterns = [
        /(?:process\.env|import\.meta\.env|os\.environ)\.([A-Z_][A-Z0-9_]*)/g,
    ];
    try {
        // Check common source directories
        const sourceDirs = ['src', 'lib', 'app', 'pages', 'api'];
        for (const dir of sourceDirs) {
            const dirPath = `${projectRoot}/${dir}`;
            if (fileExists(dirPath)) {
                scanDirectoryForEnvVars(dirPath, envVarPatterns, seenVars);
            }
        }
        // Also check root level JS/TS files
        const rootFiles = ['index.ts', 'index.js', 'main.ts', 'main.js', 'server.ts', 'server.js', 'bot.ts', 'bot.js'];
        for (const file of rootFiles) {
            const filePath = `${projectRoot}/${file}`;
            if (fileExists(filePath)) {
                try {
                    const content = readFileSync(filePath, 'utf-8');
                    let match;
                    for (const pattern of envVarPatterns) {
                        pattern.lastIndex = 0;
                        while ((match = pattern.exec(content)) !== null) {
                            const varName = match[1];
                            if (!seenVars.has(varName)) {
                                seenVars.add(varName);
                                // Check if it's one of our known vars
                                const known = commonEnvVars.find(e => e.name === varName);
                                if (known) {
                                    requirements.push(known);
                                }
                                else {
                                    // Unknown env var - assume secret if it looks like one
                                    requirements.push({
                                        name: varName,
                                        isSecret: looksLikeSecret(varName, ''),
                                    });
                                }
                            }
                        }
                    }
                }
                catch {
                    // Ignore read errors
                }
            }
        }
    }
    catch {
        // Ignore directory errors
    }
    return requirements;
}
function scanDirectoryForEnvVars(dirPath, patterns, seenVars) {
    try {
        const items = readdirSync(dirPath, { withFileTypes: true });
        for (const item of items) {
            const fullPath = `${dirPath}/${item.name}`;
            if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
                scanDirectoryForEnvVars(fullPath, patterns, seenVars);
            }
            else if (item.isFile() && (item.name.endsWith('.ts') || item.name.endsWith('.js') || item.name.endsWith('.tsx') || item.name.endsWith('.jsx'))) {
                try {
                    const content = readFileSync(fullPath, 'utf-8');
                    let match;
                    for (const pattern of patterns) {
                        pattern.lastIndex = 0;
                        while ((match = pattern.exec(content)) !== null) {
                            const varName = match[1];
                            if (!seenVars.has(varName)) {
                                seenVars.add(varName);
                            }
                        }
                    }
                }
                catch {
                    // Ignore read errors
                }
            }
        }
    }
    catch {
        // Ignore directory errors
    }
}
/**
 * Get a summary of environment setup
 */
export function getEnvSummary(result) {
    const parts = [];
    if (result.envFiles.length > 0) {
        parts.push(`Files: ${result.envFiles.join(', ')}`);
    }
    const secretCount = result.envRequirements.filter(e => e.isSecret).length;
    const nonSecretCount = result.envRequirements.length - secretCount;
    if (result.envRequirements.length > 0) {
        parts.push(`Vars: ${nonSecretCount} config, ${secretCount} secrets`);
    }
    return parts.length > 0 ? parts.join(' | ') : 'No env files detected';
}
//# sourceMappingURL=detectEnv.js.map