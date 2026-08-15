/**
 * Secret redaction — sanitize log output and error messages.
 *
 * Rules:
 * - Never expose full .env values
 * - Redact API keys, tokens, passwords, private keys
 * - Show only prefix+suffix for secrets longer than 8 chars
 * - Do not expose raw env values in MCP tool responses
 */

import { PathTraversalError, WorkspaceViolationError, InvalidPathError } from './workspace.js';

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // AWS access key (AKIA + 16 chars)
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA***[REDACTED]'],
  // GitHub token (ghp_ / gho_ / ghs_ / ghr_ prefix)
  [/\bgh[pousr]_[A-Za-z0-9_]{36,}\b/g, 'gh***[REDACTED]'],
  // Bearer tokens in headers/logs
  [/\bbearer\s+[A-Za-z0-9_.-]{20,}/gi, 'bearer [REDACTED]'],
  // Password in URL (proto://user:pass@host)
  [/\/\/[^\s:]+:[^\s@]+@[^\s,]+/g, '//[USER]:[REDACTED]@[HOST]'],
  // Private key PEM markers
  [/-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH)?\s*PRIVATE\s+KEY-----/g, '[PRIVATE KEY REDACTED]'],
  // Long alphanumeric strings that look like API keys (30+ chars)
  [/[A-Za-z0-9/+=]{30,}/g, '[SECRET]'],
];

// Environment variable names that are considered sensitive
const SENSITIVE_ENV_VARS = new Set([
  'API_KEY', 'APIKEY', 'AUTH_TOKEN', 'ACCESS_TOKEN', 'SECRET', 'SECRET_KEY',
  'PRIVATE_KEY', 'PASSWORD', 'PASS', 'TOKEN', 'API_TOKEN', 'GITHUB_TOKEN',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'DATABASE_URL', 'DATABASE_PASSWORD',
  'DB_PASSWORD', 'DB_PASS', 'DB_USER', 'DB_NAME', 'DB_HOST', 'DB_PORT', 'DB_URL',
  'REDIS_URL', 'REDIS_PASSWORD', 'SENTRY_DSN', 'STRIPE_KEY', 'STRIPE_SECRET', 'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY', 'OPENAI_KEY', 'ANTHROPIC_KEY',
  'SECRET_KEY', 'JWT_SECRET', 'SESSION_SECRET',
]);

/**
 * Redact secrets from a string. Returns the redacted string.
 */
export function redactSecrets(input: string): string {
  if (!input || typeof input !== 'string') return input ?? '';
  let result = input;
  for (const [pattern, label] of SECRET_PATTERNS) {
    result = result.replace(pattern, label);
  }
  // Redact env var values for sensitive names
  result = result.replace(
    new RegExp(
      `^(${Array.from(SENSITIVE_ENV_VARS).join('|')})=(.+)$`,
      'gim'
    ),
    '$1=[REDACTED]'
  );
  return result;
}

/**
 * Redact secrets from an object (deep, handles nested objects/arrays).
 * Returns a new object — does not mutate the input.
 */
export function redactObject<T>(obj: T, depth = 0): T {
  if (depth > 10) return obj as T;
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return redactSecrets(obj) as T;
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => redactObject(item, depth + 1)) as T;
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // For sensitive keys, always redact the value
      if (SENSITIVE_ENV_VARS.has(key.toUpperCase())) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactObject(value, depth + 1);
      }
    }
    return result as T;
  }
  return obj;
}

/**
 * Redact a error message for safe display to MCP clients.
 */
export function redactError(error: unknown): string {
  if (error instanceof Error) {
    return redactSecrets(error.message);
  }
  if (typeof error === 'string') {
    return redactSecrets(error);
  }
  return redactSecrets(String(error));
}

/**
 * Format a safe error response for MCP — never expose internals.
 */
export function formatSafeError(error: unknown, includeStack = false): {
  message: string;
  code?: string;
  stack?: string;
} {
  if (error instanceof PathTraversalError ||
      error instanceof WorkspaceViolationError ||
      error instanceof InvalidPathError) {
    return {
      message: error.message,
      code: (error as any).code,
    };
  }

  const message = redactError(error);

  // Don't expose file paths, env values, or internals
  const safe: { message: string; code?: string; stack?: string } = {
    message: message.includes('ENOENT') ? 'File not found' :
             message.includes('permission') ? 'Permission denied' :
             message.includes('timeout') ? 'Operation timed out' :
             message.includes('ENOENT') || message.includes('not exist') ? 'Path not found' :
             message,
    code: 'INTERNAL_ERROR',
  };

  if (includeStack) {
    safe.stack = redactSecrets(new Error().stack ?? '').split('\n').slice(0, 5).join('\n');
  }

  return safe;
}
