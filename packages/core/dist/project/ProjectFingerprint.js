/**
 * Project Fingerprint Types
 * Comprehensive project detection and metadata extraction
 */
/**
 * Redacts secret-like values from strings
 * Used to prevent accidental secret exposure in logs/reports
 */
export function redactSecrets(value) {
    // Common secret patterns
    const secretPatterns = [
        /(?<![A-Z0-9])(?:api[_-]?key|apikey|api_secret|apiSecret)[=:]["']?[\w-]{20,}["']?/gi,
        /(?<![A-Z0-9])(?:secret|password|passwd|pwd|token|auth[_-]?token|access[_-]?token)["']?[:=]?["']?[\w-]{20,}["']?/gi,
        /sk-[a-zA-Z0-9]{48,}/g,
        /ghp_[a-zA-Z0-9]{36,}/g,
        /[a-zA-Z0-9._-]+(?<![A-Z0-9])@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}(?![A-Za-z0-9._-])/g, // emails
    ];
    let redacted = value;
    for (const pattern of secretPatterns) {
        redacted = redacted.replace(pattern, '[REDACTED]');
    }
    return redacted;
}
/**
 * Checks if a value looks like a secret
 */
export function looksLikeSecret(key, value) {
    const secretKeys = [
        'api_key', 'apikey', 'apiKey', 'api_secret', 'secret', 'password', 'passwd',
        'pwd', 'token', 'auth_token', 'access_token', 'refresh_token', 'bearer',
        'private_key', 'privatekey', 'secret_key', 'aws_access_key', 'aws_secret',
        'stripe_key', 'stripe_secret', 'ghp_', 'sk_', 'pk_', 'key', 'credential',
    ];
    const keyLower = key.toLowerCase();
    return secretKeys.some(sk => keyLower.includes(sk.toLowerCase())) && value.length > 8;
}
//# sourceMappingURL=ProjectFingerprint.js.map