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
  additionalPatterns?: Array<{ pattern: RegExp; replacement: string }>;
  /** Paths to env vars whose values should always be redacted */
  sensitiveEnvVars?: string[];
}

const DEFAULT_SENSITIVE_VARS = [
  'SECRET', 'TOKEN', 'API_KEY', 'APIKEY', 'AUTH', 'PASSWORD', 'PASSWD',
  'PRIVATE', 'CREDENTIAL', 'ACCESS_KEY', 'SECRET_KEY', 'AWS_SECRET',
  'STRIPE', 'GITHUB_TOKEN', 'NPM_TOKEN', 'CYPRESS',
];

const REDACTED = '[REDACTED]';

// ─── Built-in Patterns ───────────────────────────────────────────────────────

const REDACTION_PATTERNS: Array<{ pattern: RegExp; replacement: string; label: string }> = [
  { pattern: /\b([A-Z_][A-Z0-9_]*)=(Bearer\s+)?([A-Za-z0-9_+\/.-]{10,})/g, replacement: '$1=$2[REDACTED]', label: 'env-var' },
  { pattern: /\b(Bearer)\s+([A-Za-z0-9_.-]{10,})/g, replacement: '$1 $2[REDACTED]', label: 'bearer' },
  { pattern: /\b(sk_live_[A-Za-z0-9]{20,})/g, replacement: 'sk_live_[REDACTED]', label: 'stripe-live' },
  { pattern: /\b(sk_test_[A-Za-z0-9]{20,})/g, replacement: 'sk_test_[REDACTED]', label: 'stripe-test' },
  { pattern: /\b(rk_live_[A-Za-z0-9]{20,})/g, replacement: 'rk_live_[REDACTED]', label: 'stripe-restricted' },
  { pattern: /\b(api_key['"]?\s*[:=]\s*['"]?)([A-Za-z0-9_.-]{10,})/gi, replacement: '$1[REDACTED]', label: 'api-key' },
  { pattern: /\b(token['"]?\s*[:=]\s*['"]?)([A-Za-z0-9_.-]{10,})/gi, replacement: '$1[REDACTED]', label: 'token' },
  { pattern: /\b(password['"]?\s*[:=]\s*['"]?)([A-Za-z0-9_.-]{4,})/gi, replacement: '$1[REDACTED]', label: 'password' },
  { pattern: /\b(AKIA[A-Z0-9]{16})/g, replacement: 'AKIA[REDACTED]', label: 'aws-access-key' },
  { pattern: /\b(aws_secret_access_key\s*=\s*)([A-Za-z0-9\/+=]{40})/gi, replacement: '$1[REDACTED]', label: 'aws-secret' },
  { pattern: /-----BEGIN\s+(RSA|EC|DSA|OPENSSH)\s+PRIVATE\s+KEY-----/g, replacement: '-----BEGIN $1 PRIVATE KEY-----', label: 'private-key-start' },
  { pattern: /-----END\s+(RSA|EC|DSA|OPENSSH)\s+PRIVATE\s+KEY-----/g, replacement: '-----END $1 PRIVATE KEY-----', label: 'private-key-end' },
  { pattern: /\b(eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g, replacement: '[JWT_TOKEN_REDACTED]', label: 'jwt' },
  { pattern: /\/\/([^:]+):([^@]+)@/g, replacement: '//$1:[REDACTED]@', label: 'url-embedded-credentials' },
  { pattern: /\b(gh[pousr]_[A-Za-z0-9_]{36,})/g, replacement: '[GITHUB_TOKEN_REDACTED]', label: 'github-token' },
  { pattern: /\b(npm_[A-Za-z0-9]{36})/g, replacement: '[NPM_TOKEN_REDACTED]', label: 'npm-token' },
  { pattern: /\b([a-f0-9]{32}-[a-f0-9]{32}-[a-f0-9]{32}-[a-f0-9]{32}-[a-f0-9]{32})/g, replacement: '[CYPRESS_KEY_REDACTED]', label: 'cypress-key' },
];

// ─── Redactor Class ──────────────────────────────────────────────────────────

export class LogRedactor {
  private patterns: Array<{ pattern: RegExp; replacement: string }>;
  private sensitiveVars: Set<string>;

  constructor(config: RedactionConfig = {}) {
    this.patterns = [
      ...REDACTION_PATTERNS.map(p => {
        const replacement = p.label === 'env-var'
          ? p.replacement.replace('[REDACTED]', REDACTED)
          : p.replacement;
        return { pattern: p.pattern, replacement };
      }),
      ...(config.additionalPatterns ?? []),
    ];

    this.sensitiveVars = new Set([
      ...DEFAULT_SENSITIVE_VARS,
      ...(config.sensitiveEnvVars ?? []),
    ]);
  }

  /**
   * Redact secrets from a single line of text.
   */
  redactLine(line: string): string {
    let result = line;

    // Redact env var values for sensitive variables
    result = result.replace(
      /\b([A-Z_][A-Z0-9_]*)=([^&\s'"]+)/g,
      (match, name, value) => {
        const upper = name.toUpperCase();
        if (
          this.sensitiveVars.has(upper) ||
          DEFAULT_SENSITIVE_VARS.some(v => upper.includes(v))
        ) {
          return `${name}=[REDACTED]`;
        }
        return match;
      }
    );

    // Apply pattern-based redactions
    for (const { pattern, replacement } of this.patterns) {
      // Reset lastIndex before each use
      if (pattern.global) {
        pattern.lastIndex = 0;
      }
      result = result.replace(pattern, replacement);
    }

    return result;
  }

  /**
   * Redact secrets from multi-line text (stdout or stderr).
   */
  redact(text: string): string {
    return text
      .split('\n')
      .map(line => this.redactLine(line))
      .join('\n');
  }

  /**
   * Redact secrets from an object (typically a metadata/environment object).
   * Returns a new object with sensitive values redacted.
   */
  redactObject(obj: Record<string, string | undefined>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) continue;
      const upper = key.toUpperCase();
      if (
        this.sensitiveVars.has(upper) ||
        DEFAULT_SENSITIVE_VARS.some(v => upper.includes(v))
      ) {
        result[key] = REDACTED;
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}

// ─── Singleton for convenience ────────────────────────────────────────────────

export const defaultRedactor = new LogRedactor();
