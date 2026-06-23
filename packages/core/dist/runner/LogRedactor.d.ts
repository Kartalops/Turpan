/**
 * LogRedactor — removes secrets from command output before logging.
 *
 * Redacts:
 * - Environment variable values (e.g. SECRET_KEY=abc123 → SECRET_KEY=[REDACTED])
 * - Bearer tokens (e.g. Authorization: Bearer tok_xxx → Authorization: Bearer [REDACTED])
 * - API keys (common patterns: sk_live_, sk_test_, api_, key_, token_)
 * - AWS credentials (AKIA..., aws_secret)
 * - Private keys (-----BEGIN RSA PRIVATE KEY-----, etc.)
 * - URLs with embedded credentials (https://user:pass@host/)
 * - JWT tokens
 */
export interface RedactionConfig {
    /** Custom patterns to redact in addition to defaults */
    additionalPatterns?: Array<{
        pattern: RegExp;
        replacement: string;
    }>;
    /** Paths to env vars whose values should always be redacted */
    sensitiveEnvVars?: string[];
}
export declare class LogRedactor {
    private patterns;
    private sensitiveVars;
    constructor(config?: RedactionConfig);
    /**
     * Redact secrets from a single line of text.
     */
    redactLine(line: string): string;
    /**
     * Redact secrets from multi-line text (stdout or stderr).
     */
    redact(text: string): string;
    /**
     * Redact secrets from an object (typically a metadata/environment object).
     * Returns a new object with sensitive values redacted.
     */
    redactObject(obj: Record<string, string | undefined>): Record<string, string>;
}
export declare const defaultRedactor: LogRedactor;
//# sourceMappingURL=LogRedactor.d.ts.map