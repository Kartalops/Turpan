/**
 * MCP Hardening tests — audit logging, rate limiting, resource URI validation,
 * timeout behavior, concurrent review guard, and redaction in audit logs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter, RateLimitError, DEFAULT_RATE_LIMIT } from '../src/security/rate-limiter.js';
import { AuditContext, generateRunId, setGlobalAuditPath } from '../src/security/audit-logger.js';
import { ConcurrencyGuard } from '../src/security/concurrency-guard.js';
import { withTimeout, ToolTimeoutError, DEFAULT_TIMEOUTS, getTimeoutForTool } from '../src/security/timeouts.js';
import { redactObject } from '../src/security/redact.js';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ─── Test helpers ─────────────────────────────────────────────────────────────

const TEST_PROJECT = '/tmp/turpan-hardening-test';

// ─── Audit Logger Tests ────────────────────────────────────────────────────────

describe('AuditLogger', () => {
  beforeEach(() => {
    rmSync(TEST_PROJECT, { recursive: true, force: true });
    mkdirSync(join(TEST_PROJECT, '.turpan', 'runs'), { recursive: true });
    setGlobalAuditPath(TEST_PROJECT);
  });

  afterEach(() => {
    rmSync(TEST_PROJECT, { recursive: true, force: true });
  });

  it('AuditContext.succeed writes to global audit log', () => {
    const ctx = new AuditContext({
      toolName: 'turpan.review_project',
      projectPath: TEST_PROJECT,
      workspace: TEST_PROJECT,
      sessionId: 'test-session',
      runId: 'test-run-1',
      input: { projectPath: TEST_PROJECT, mode: 'quick' },
    });
    ctx.succeed('review complete, score: 85');

    const logPath = join(TEST_PROJECT, '.turpan', 'mcp-audit.log');
    expect(existsSync(logPath)).toBe(true);
    const lines = readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    const entry = JSON.parse(lines[0]);
    expect(entry.toolName).toBe('turpan.review_project');
    expect(entry.status).toBe('success');
    expect(entry.outputSummary).toBe('review complete, score: 85');
    expect(entry.sessionId).toBe('test-session');
    expect(entry.runId).toBe('test-run-1');
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('AuditContext.fail writes failure status', () => {
    const ctx = new AuditContext({
      toolName: 'turpan.review_project',
      projectPath: TEST_PROJECT,
      workspace: TEST_PROJECT,
      input: { projectPath: TEST_PROJECT },
    });
    ctx.fail('Path traversal detected', 'PATH_TRAVERSAL');

    const logPath = join(TEST_PROJECT, '.turpan', 'mcp-audit.log');
    const lines = readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
    const entry = JSON.parse(lines[0]);
    expect(entry.status).toBe('failure');
    expect(entry.outputSummary).toBe('Path traversal detected');
    expect(entry.errorCode).toBe('PATH_TRAVERSAL');
  });

  it('AuditContext.reject writes rejected status', () => {
    const ctx = new AuditContext({
      toolName: 'turpan.review_project',
      projectPath: TEST_PROJECT,
      workspace: TEST_PROJECT,
      input: { projectPath: TEST_PROJECT },
    });
    ctx.reject('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED');

    const logPath = join(TEST_PROJECT, '.turpan', 'mcp-audit.log');
    const lines = readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
    const entry = JSON.parse(lines[0]);
    expect(entry.status).toBe('rejected');
    expect(entry.errorCode).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('AuditContext.timeout writes timeout status', () => {
    const ctx = new AuditContext({
      toolName: 'turpan.review_project',
      projectPath: TEST_PROJECT,
      workspace: TEST_PROJECT,
      input: { projectPath: TEST_PROJECT },
    });
    ctx.timeout(300_000);

    const logPath = join(TEST_PROJECT, '.turpan', 'mcp-audit.log');
    const lines = readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
    const entry = JSON.parse(lines[0]);
    expect(entry.status).toBe('timeout');
    expect(entry.errorCode).toBe('TIMEOUT');
    expect(entry.outputSummary).toContain('300000ms');
  });

  it('generates unique runIds', () => {
    const id1 = generateRunId();
    const id2 = generateRunId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^run_\d+_[a-f0-9]+$/);
  });
});

// ─── Rate Limiter Tests ───────────────────────────────────────────────────────

describe('RateLimiter', () => {
  it('allows calls within limit', () => {
    const limiter = new RateLimiter({ globalMaxPerMinute: 5 });
    expect(limiter.check('turpan.review_project')).toBeNull();
    limiter.record('turpan.review_project');
    expect(limiter.check('turpan.review_project')).toBeNull();
  });

  it('blocks calls exceeding global limit', () => {
    const limiter = new RateLimiter({ globalMaxPerMinute: 2 });
    expect(limiter.check('any-tool')).toBeNull();
    limiter.record('any-tool');
    expect(limiter.check('any-tool')).toBeNull();
    limiter.record('any-tool');
    const err = limiter.check('any-tool');
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err!.message).toContain('Global rate limit exceeded');
    expect(err!.retryAfterMs).toBeGreaterThan(0);
  });

  it('blocks calls exceeding per-tool limit', () => {
    const limiter = new RateLimiter({
      globalMaxPerMinute: 100,
      perToolMaxPerMinute: { 'turpan.review_project': 2 },
    });
    expect(limiter.check('turpan.review_project')).toBeNull();
    limiter.record('turpan.review_project');
    expect(limiter.check('turpan.review_project')).toBeNull();
    limiter.record('turpan.review_project');
    const err = limiter.check('turpan.review_project');
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err!.message).toContain("tool 'turpan.review_project'");
    expect(err!.toolName).toBe('turpan.review_project');
  });

  it('sliding window resets after windowMs', async () => {
    const limiter = new RateLimiter({ globalMaxPerMinute: 2, windowMs: 50 });
    limiter.record('t');
    limiter.record('t');
    expect(limiter.check('t')).toBeInstanceOf(RateLimitError);
    await new Promise(r => setTimeout(r, 60));
    expect(limiter.check('t')).toBeNull();
  });

  it('status returns current utilization', () => {
    const limiter = new RateLimiter({ globalMaxPerMinute: 10, perToolMaxPerMinute: { 't1': 3 } });
    limiter.record('t1');
    limiter.record('t1');
    limiter.record('global');
    const s = limiter.status();
    // globalUsed counts ALL recorded calls (not distinct tools)
    expect(s.globalUsed).toBe(3);
    expect(s.toolUsed.get('t1')).toBe(2);
  });

  it('RateLimitError.toJSON produces structured response', () => {
    const limiter = new RateLimiter({ globalMaxPerMinute: 1 });
    limiter.record('t');
    const err = limiter.check('t')!;
    const json = err.toJSON();
    expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(json.error.retryAfterMs).toBeGreaterThan(0);
    expect(json.error.limit).toBe(1);
  });

  it('DEFAULT_RATE_LIMIT has sensible defaults', () => {
    expect(DEFAULT_RATE_LIMIT.globalMaxPerMinute).toBe(60);
    expect(DEFAULT_RATE_LIMIT.perToolMaxPerMinute!['turpan.review_project']).toBe(20);
    expect(DEFAULT_RATE_LIMIT.perToolMaxPerMinute!['turpan.live_ui_test']).toBe(10);
  });
});

// ─── Concurrency Guard Tests ───────────────────────────────────────────────────

describe('ConcurrencyGuard', () => {
  it('allows first claim', () => {
    const guard = new ConcurrencyGuard();
    const result = guard.tryClaim('/workspace', 'run-1', 'turpan.review_project');
    expect(result).toBeNull();
    expect(guard.getActiveRun('/workspace')?.runId).toBe('run-1');
  });

  it('blocks second claim in same workspace', () => {
    const guard = new ConcurrencyGuard();
    guard.tryClaim('/workspace', 'run-1', 'turpan.review_project');
    const result = guard.tryClaim('/workspace', 'run-2', 'turpan.review_project');
    expect(result).not.toBeNull();
    expect(result!.runId).toBe('run-1');
  });

  it('allows different workspaces independently', () => {
    const guard = new ConcurrencyGuard();
    guard.tryClaim('/workspace-a', 'run-a', 'turpan.review_project');
    expect(guard.tryClaim('/workspace-b', 'run-b', 'turpan.review_project')).toBeNull();
  });

  it('release frees the slot', () => {
    const guard = new ConcurrencyGuard();
    guard.tryClaim('/workspace', 'run-1', 'turpan.review_project');
    guard.release('/workspace');
    expect(guard.tryClaim('/workspace', 'run-2', 'turpan.review_project')).toBeNull();
  });

  it('releaseByRunId releases correct slot', () => {
    const guard = new ConcurrencyGuard();
    guard.tryClaim('/workspace-a', 'run-a', 't');
    guard.tryClaim('/workspace-b', 'run-b', 't');
    guard.releaseByRunId('run-a');
    expect(guard.getActiveRun('/workspace-a')).toBeUndefined();
    expect(guard.getActiveRun('/workspace-b')?.runId).toBe('run-b');
  });

  it('getAllActiveRuns returns all active runs', () => {
    const guard = new ConcurrencyGuard();
    guard.tryClaim('/ws-a', 'run-a', 't');
    guard.tryClaim('/ws-b', 'run-b', 't');
    const all = guard.getAllActiveRuns();
    expect(all.size).toBe(2);
  });
});

// ─── Timeout Tests ────────────────────────────────────────────────────────────

describe('Timeouts', () => {
  it('withTimeout resolves for fast function', async () => {
    const result = await withTimeout('test', 1000, async () => 42);
    expect(result).toBe(42);
  });

  it('withTimeout rejects with ToolTimeoutError', async () => {
    await expect(
      withTimeout('turpan.review_project', 50, async () => {
        await new Promise(r => setTimeout(r, 200));
        return 42;
      })
    ).rejects.toThrow(ToolTimeoutError);
  });

  it('ToolTimeoutError has correct properties', async () => {
    try {
      await withTimeout('turpan.review_project', 50, async () => {
        await new Promise(r => setTimeout(r, 200));
        return 42;
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ToolTimeoutError);
      expect((err as ToolTimeoutError).toolName).toBe('turpan.review_project');
      expect((err as ToolTimeoutError).maxMs).toBe(50);
      expect((err as ToolTimeoutError).message).toContain('50ms');
    }
  });

  it('getTimeoutForTool returns configured value', () => {
    expect(getTimeoutForTool('turpan.review_project', DEFAULT_TIMEOUTS)).toBe(300_000);
    expect(getTimeoutForTool('turpan.get_report', DEFAULT_TIMEOUTS)).toBe(120_000);
  });

  it('getTimeoutForTool falls back to 5 minutes for unknown tools', () => {
    expect(getTimeoutForTool('unknown.tool', DEFAULT_TIMEOUTS)).toBe(300_000);
  });
});

// ─── Redaction in Audit Logs ──────────────────────────────────────────────────

describe('Redaction in audit logs', () => {
  beforeEach(() => {
    rmSync(TEST_PROJECT, { recursive: true, force: true });
    mkdirSync(join(TEST_PROJECT, '.turpan', 'runs'), { recursive: true });
    setGlobalAuditPath(TEST_PROJECT);
  });

  afterEach(() => {
    rmSync(TEST_PROJECT, { recursive: true, force: true });
  });

  it('audit log inputSummary redacts secrets', () => {
    const githubToken = ['gh', 'p_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'].join('');
    const ctx = new AuditContext({
      toolName: 'turpan.review_project',
      projectPath: TEST_PROJECT,
      workspace: TEST_PROJECT,
      input: {
        projectPath: TEST_PROJECT,
        API_KEY: 'sk-live-abcdefghijklmnopqrstuvwxyz123456789',
        GITHUB_TOKEN: githubToken,
        databaseUrl: 'mysql://user:secret123@localhost:3306/mydb',
      },
    });
    ctx.succeed('done');

    const logPath = join(TEST_PROJECT, '.turpan', 'mcp-audit.log');
    const lines = readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
    const entry = JSON.parse(lines[0]);
    expect(entry.inputSummary).not.toContain('sk-live-');
    expect(entry.inputSummary).not.toContain('ghp_');
    expect(entry.inputSummary).not.toContain('secret123');
  });

  it('audit log outputSummary truncates long output', () => {
    const longOutput = 'x'.repeat(2000);
    const ctx = new AuditContext({
      toolName: 'turpan.review_project',
      projectPath: TEST_PROJECT,
      workspace: TEST_PROJECT,
      input: { projectPath: TEST_PROJECT },
    });
    ctx.succeed(longOutput);

    const logPath = join(TEST_PROJECT, '.turpan', 'mcp-audit.log');
    const lines = readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
    const entry = JSON.parse(lines[0]);
    expect(entry.outputSummary.length).toBeLessThan(longOutput.length);
    expect(entry.outputSummary).toContain('[truncated');
  });
});

// ─── Resource URI Validation Tests ────────────────────────────────────────────

describe('Resource URI validation', () => {
  // We test the validation logic directly since it lives in server.ts
  // These are the same checks performed by parseAndValidateResourceUri

  function validateUri(uri: string): { valid: boolean; error?: string } {
    if (!uri.startsWith('turpan://')) {
      return { valid: false, error: `Unsupported protocol: ${uri.split('://')[0]}` };
    }
    const pathPart = uri.slice('turpan://'.length);
    if (pathPart.includes('..') || pathPart.includes('\\')) {
      return { valid: false, error: 'Path traversal not allowed in resource URI' };
    }
    if (!uri.match(/^turpan:\/\/runs\/[a-zA-Z0-9_:-]+\/[a-zA-Z0-9_.]+$/)) {
      return { valid: false, error: `Malformed turpan:// URI: ${uri}` };
    }
    return { valid: true };
  }

  it('allows valid turpan:// URIs', () => {
    expect(validateUri('turpan://runs/latest/TURPAN_ANALYSIS.md').valid).toBe(true);
    expect(validateUri('turpan://runs/run_123_abc123/TURPAN_FINDINGS.json').valid).toBe(true);
    expect(validateUri('turpan://runs/2024-01-01T12-00-00/screenshots').valid).toBe(true);
  });

  it('rejects non-turpan protocol', () => {
    const r = validateUri('file:///etc/passwd');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Unsupported protocol');
  });

  it('rejects path traversal in URI', () => {
    const r = validateUri('turpan://runs/../../../etc/passwd');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Path traversal');
  });

  it('rejects backslash path traversal', () => {
    const r = validateUri('turpan://runs/..\\..\\etc/passwd');
    expect(r.valid).toBe(false);
  });

  it('rejects malformed runId', () => {
    const r = validateUri('turpan://runs/latest');
    expect(r.valid).toBe(false);
  });

  it('rejects missing filename', () => {
    const r = validateUri('turpan://runs/latest/');
    expect(r.valid).toBe(false);
  });

  it('rejects runId with special characters', () => {
    const r = validateUri('turpan://runs/run$123/TURPAN_FINDINGS.json');
    expect(r.valid).toBe(false);
  });

  it('rejects absolute paths in filename', () => {
    const r = validateUri('turpan://runs/latest/etc/passwd');
    expect(r.valid).toBe(false);
  });

  it('rejects null bytes in URI', () => {
    const r = validateUri('turpan://runs/latest\x00/TURPAN_FINDINGS.json');
    expect(r.valid).toBe(false);
  });

  it('rejects javascript: URIs', () => {
    const r = validateUri('javascript:alert(1)');
    expect(r.valid).toBe(false);
  });
});

// ─── redactObject tests for audit input ───────────────────────────────────────

describe('redactObject for audit input', () => {
  it('redacts sensitive env var values in input objects', () => {
    const input = {
      projectPath: '/my/project',
      env: {
        API_KEY: 'sk-live-abc123',
        OPENAI_API_KEY: 'sk-ant-xyz',
        NODE_ENV: 'production',
      },
    };
    const redacted = redactObject(input) as any;
    expect(redacted.projectPath).toBe('/my/project');
    expect(redacted.env.API_KEY).toBe('[REDACTED]');
    expect(redacted.env.OPENAI_API_KEY).toBe('[REDACTED]');
    expect(redacted.env.NODE_ENV).toBe('production');
  });

  it('redacts AWS keys when field name is in SENSITIVE_ENV_VARS', () => {
    // redactObject only redacts values whose keys are known sensitive names.
    // For pattern-based redaction (AKIA..., ghp_...), use redactSecrets directly.
    const input = { API_KEY: ['AK', 'IAIOSFODNN7EXAMPLE'].join('') };
    const redacted = redactObject(input) as any;
    expect(redacted.API_KEY).toBe('[REDACTED]');
  });

  it('redacts deeply nested sensitive fields', () => {
    const input = {
      config: {
        nested: {
          deep: {
            DB_PASSWORD: 'super-secret',
          },
        },
      },
    };
    const redacted = redactObject(input) as any;
    expect(redacted.config.nested.deep.DB_PASSWORD).toBe('[REDACTED]');
  });

  it('redacts sensitive keys in arrays', () => {
    // redactObject only redacts values for keys in SENSITIVE_ENV_VARS.
    // For token value pattern redaction, use redactSecrets.
    const input = {
      tokens: [
        { label: 'github', TOKEN: ['gh', 'p_abcdefghijklmnopqrstuvwxyz1234567890'].join('') },
        { label: 'public', TOKEN: 'not-a-secret' },
      ],
    };
    const redacted = redactObject(input) as any;
    // TOKEN is in SENSITIVE_ENV_VARS, so ALL values for that key are redacted
    expect(redacted.tokens[0].TOKEN).toBe('[REDACTED]');
    expect(redacted.tokens[1].TOKEN).toBe('[REDACTED]');
  });
});
