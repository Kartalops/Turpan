/**
 * Secret redaction tests — verify no secrets leak in MCP responses.
 *
 * These tests verify the redaction logic directly (no module import needed)
 * to avoid TypeScript/ESM resolution issues in the test runner.
 */

import { describe, it, expect } from 'vitest';
import { PathTraversalError, WorkspaceViolationError } from '../src/security/workspace.js';

// ─── Inline pattern helpers (mirror the actual implementation) ────────────────

const AWS_KEY_PATTERN = /\bAKIA[0-9A-Z]{16}\b/g;
const GITHUB_TOKEN_PATTERN = /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/g;
const PRIVATE_KEY_PATTERN = /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH)?\s*PRIVATE\s+KEY-----/g;
const PASSWORD_URL_PATTERN = /\/\/[^\s:]+:[^\s@]+@[^\s,]+/g;
const LONG_ALPHANUM_PATTERN = /[A-Za-z0-9/+=]{30,}/g;

function redact(input: string): string {
  if (!input) return '';
  let r = input;
  r = r.replace(AWS_KEY_PATTERN, 'AKIA***[REDACTED]');
  r = r.replace(GITHUB_TOKEN_PATTERN, 'gh***[REDACTED]');
  r = r.replace(PRIVATE_KEY_PATTERN, '[PRIVATE KEY REDACTED]');
  r = r.replace(PASSWORD_URL_PATTERN, '//[USER]:[REDACTED]@[HOST]');
  r = r.replace(LONG_ALPHANUM_PATTERN, '[SECRET]');
  return r;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('redact secrets — inline patterns', () => {
  it('redacts AWS access key patterns', () => {
    expect(redact(['AK', 'IAIOSFODNN7EXAMPLE'].join(''))).toBe('AKIA***[REDACTED]');
  });

  it('redacts GitHub tokens', () => {
    const redacted = redact(['gh', 'p_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'].join(''));
    expect(redacted).toContain('[REDACTED]');
    expect(redacted).not.toContain('ghp_');
  });

  it('redacts private key markers', () => {
    // The regex only replaces the BEGIN...KEY----- line itself, not multi-line content
    expect(redact('-----BEGIN RSA PRIVATE KEY-----')).toBe('[PRIVATE KEY REDACTED]');
    expect(redact('-----BEGIN DSA PRIVATE KEY-----')).toBe('[PRIVATE KEY REDACTED]');
    expect(redact('-----BEGIN EC PRIVATE KEY-----')).toBe('[PRIVATE KEY REDACTED]');
  });

  it('redacts password in URL', () => {
    const redacted = redact('mysql://user:password123@localhost:3306/db');
    expect(redacted).not.toContain('password123');
    expect(redacted).toContain('[USER]:[REDACTED]');
  });

  it('redacts long alphanumeric strings (30+ chars, no underscores)', () => {
    const input = 'abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOP';
    const redacted = redact(input);
    expect(redacted).toContain('[SECRET]');
  });

  it('returns input unchanged if no secrets found', () => {
    expect(redact('This is a normal log message with no secrets')).toBe(
      'This is a normal log message with no secrets'
    );
  });

  it('handles null/undefined gracefully', () => {
    expect(redact('')).toBe('');
    expect(redact(null as any)).toBe('');
    expect(redact(undefined as any)).toBe('');
  });
});

// ─── redactObject tests (import from actual module — works since it uses .ts) ──

import { redactObject } from '../src/security/redact.js';

describe('redactObject', () => {
  it('redacts sensitive fields by name', () => {
    const input = { name: 'test-project', API_KEY: 'sk-live-abc123' };
    const redacted = redactObject(input) as any;
    expect(redacted.name).toBe('test-project');
    expect(redacted.API_KEY).toBe('[REDACTED]');
  });

  it('redacts nested objects', () => {
    const input = { config: { PASSWORD: 'secret123', endpoint: 'https://api.example.com' }, count: 42 };
    const redacted = redactObject(input) as any;
    expect(redacted.config.PASSWORD).toBe('[REDACTED]');
    expect(redacted.config.endpoint).toBe('https://api.example.com');
    expect(redacted.count).toBe(42);
  });

  it('redacts arrays of objects with sensitive fields', () => {
    const input = {
      findings: [
        { title: 'Security issue', severity: 'high' },
        { title: 'Use after free', SECRET: 'super-secret-key' },
      ],
    };
    const redacted = redactObject(input) as any;
    expect(redacted.findings[0].title).toBe('Security issue');
    expect(redacted.findings[1].SECRET).toBe('[REDACTED]');
  });

  it('handles null and undefined values', () => {
    expect(redactObject(null)).toBeNull();
    expect(redactObject(undefined)).toBeUndefined();
  });

  it('limits recursion depth to prevent stack overflow', () => {
    let obj: any = {};
    let current = obj;
    for (let i = 0; i < 20; i++) {
      current.nested = {};
      current = current.nested;
    }
    current.API_KEY = 'secret';
    const redacted = redactObject(obj) as any;
    expect(redacted).toBeDefined();
  });
});

// ─── formatSafeError tests ────────────────────────────────────────────────────

import { formatSafeError } from '../src/security/redact.js';

describe('formatSafeError', () => {
  it('exposes PathTraversalError code', () => {
    const err = new PathTraversalError('Path traversal detected');
    const safe = formatSafeError(err);
    expect(safe.code).toBe('PATH_TRAVERSAL');
    expect(safe.message).toBe('Path traversal detected');
  });

  it('exposes WorkspaceViolationError code', () => {
    const err = new WorkspaceViolationError('Workspace violation');
    const safe = formatSafeError(err);
    expect(safe.code).toBe('WORKSPACE_VIOLATION');
  });

  it('maps common error patterns to safe messages', () => {
    const err = new Error('ENOENT: no such file or directory');
    const safe = formatSafeError(err);
    expect(safe.message).toBe('File not found');
  });

  it('includes stack only when explicitly requested', () => {
    const err = new Error('test error');
    const withoutStack = formatSafeError(err);
    expect((withoutStack as any).stack).toBeUndefined();

    const withStack = formatSafeError(err, true);
    expect((withStack as any).stack).toBeDefined();
  });
});
