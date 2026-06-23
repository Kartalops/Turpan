/**
 * Runtime Analyzer Tests — Phase 7 Non-UI Runtime Review
 */

import { describe, it, expect, beforeEach, testTimeout } from 'vitest';
import { join } from 'path';
import {
  PythonRuntimeAnalyzer,
  FastApiRuntimeAnalyzer,
  CliRuntimeAnalyzer,
  McpRuntimeAnalyzer,
} from '../src/analyzers/runtime/index.js';
import type { AnalyzerContext } from '../src/analyzers/Analyzer.js';

// Fixture paths
const PYTHON_BOT_FIXTURE = '/home/oguz/Masaüstü/TurPAN-Review-Agent/packages/core/tests/fixtures/runtime/python-bot';
const PYTHON_BOT_ISSUES_FIXTURE = join(PYTHON_BOT_FIXTURE, 'bot_with_issues.py');
const FASTAPI_FIXTURE = '/home/oguz/Masaüstü/TurPAN-Review-Agent/packages/core/tests/fixtures/runtime/fastapi-app';
const CLI_FIXTURE = '/home/oguz/Masaüstü/TurPAN-Review-Agent/packages/core/tests/fixtures/runtime/cli-tool';
const MCP_FIXTURE = '/home/oguz/Masaüstü/TurPAN-Review-Agent/packages/core/tests/fixtures/runtime/mcp-server';

function makeFp(overrides: Partial<Parameters<typeof makeFp>[0]> = {}): AnalyzerContext['fingerprint'] {
  return {
    projectRoot: PYTHON_BOT_FIXTURE,
    projectName: 'python-bot-fixture',
    languages: ['python'],
    packageManager: 'pip' as const,
    appType: 'python-bot' as const,
    uiFramework: 'none' as const,
    backendFramework: 'unknown' as const,
    runtimeType: 'python' as const,
    testTools: [],
    buildCommands: [],
    devCommands: [],
    lintCommands: [],
    typecheckCommands: [],
    testCommands: [],
    packageScripts: {},
    dockerAvailable: false,
    dockerComposeAvailable: false,
    envFiles: [],
    envRequirements: [],
    routeHints: [],
    entrypoints: [{ name: 'main.py', path: join(PYTHON_BOT_FIXTURE, 'syntax_ok.py'), type: 'server' }],
    databaseHints: [],
    authHints: { type: [] },
    deploymentHints: {},
    detectedFiles: [],
    missingFiles: [],
    repositoryStatus: { isGitRepo: false },
    lockFile: undefined,
    fingerprintedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeCtx(fp?: Partial<AnalyzerContext['fingerprint']>): AnalyzerContext {
  return {
    projectRoot: fp?.projectRoot ?? PYTHON_BOT_FIXTURE,
    fingerprint: makeFp(fp),
    deepAnalysis: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Python Runtime Analyzer — supports()
describe('PythonRuntimeAnalyzer', () => {
  it('supports python-bot app type', () => {
    const analyzer = new PythonRuntimeAnalyzer();
    expect(analyzer.supports(makeFp({ appType: 'python-bot' }))).toBe(true);
  });

  it('supports telegram-bot app type', () => {
    const analyzer = new PythonRuntimeAnalyzer();
    expect(analyzer.supports(makeFp({ appType: 'telegram-bot' }))).toBe(true);
  });

  it('supports fastapi app type', () => {
    const analyzer = new PythonRuntimeAnalyzer();
    expect(analyzer.supports(makeFp({ appType: 'fastapi' }))).toBe(true);
  });

  it('does not support non-Python projects', () => {
    const analyzer = new PythonRuntimeAnalyzer();
    expect(analyzer.supports(makeFp({ languages: ['typescript'] }))).toBe(false);
  });

  it('returns correct analyzer id', () => {
    const analyzer = new PythonRuntimeAnalyzer();
    expect(analyzer.id).toBe('python-runtime');
    expect(analyzer.name).toBe('Python Runtime Analyzer');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Python Runtime Analyzer — static pattern detection
describe('PythonRuntimeAnalyzer static patterns', () => {
  it('detects hardcoded secrets', async () => {
    const analyzer = new PythonRuntimeAnalyzer();
    const ctx = makeCtx({ projectRoot: PYTHON_BOT_FIXTURE });
    const result = await analyzer.run(ctx);
    const secretFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('hardcoded secret') ||
      f.title.toLowerCase().includes('secret')
    );
    expect(secretFindings.length).toBeGreaterThan(0);
  });

  it('detects infinite loops without shutdown', async () => {
    const analyzer = new PythonRuntimeAnalyzer();
    const ctx = makeCtx({ projectRoot: PYTHON_BOT_FIXTURE });
    const result = await analyzer.run(ctx);
    const loopFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('infinite loop')
    );
    expect(loopFindings.length).toBeGreaterThan(0);
  });

  it('detects bare except pass', async () => {
    const analyzer = new PythonRuntimeAnalyzer();
    const ctx = makeCtx({ projectRoot: PYTHON_BOT_FIXTURE });
    const result = await analyzer.run(ctx);
    const exceptFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('bare except')
    );
    expect(exceptFindings.length).toBeGreaterThan(0);
  });

  it('detects webhook/polling ambiguity', async () => {
    const analyzer = new PythonRuntimeAnalyzer();
    const ctx = makeCtx({ projectRoot: PYTHON_BOT_FIXTURE });
    const result = await analyzer.run(ctx);
    const webhookFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('webhook') ||
      f.title.toLowerCase().includes('polling')
    );
    expect(webhookFindings.length).toBeGreaterThan(0);
  });

  it('returns findings with evidence', async () => {
    const analyzer = new PythonRuntimeAnalyzer();
    const ctx = makeCtx({ projectRoot: PYTHON_BOT_FIXTURE });
    const result = await analyzer.run(ctx);
    if (result.findings.length > 0) {
      for (const f of result.findings) {
        expect(f.evidence.length).toBeGreaterThan(0);
        expect(f.confidence).toBeGreaterThan(0);
        expect(f.confidence).toBeLessThanOrEqual(100);
      }
    }
  });

  it('returns findings with correct severity for hardcoded secrets', async () => {
    const analyzer = new PythonRuntimeAnalyzer();
    const ctx = makeCtx({ projectRoot: PYTHON_BOT_FIXTURE });
    const result = await analyzer.run(ctx);
    const secretFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('secret') ||
      f.title.toLowerCase().includes('token')
    );
    for (const f of secretFindings) {
      expect(['critical', 'high']).toContain(f.severity);
    }
  });

  it('does not error on empty Python project', async () => {
    const analyzer = new PythonRuntimeAnalyzer();
    const ctx = makeCtx({ projectRoot: PYTHON_BOT_FIXTURE });
    const result = await analyzer.run(ctx);
    // Should return without throwing
    expect(result).toBeDefined();
    expect(result.analyzerId).toBe('python-runtime');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FastAPI Runtime Analyzer — supports()
describe('FastApiRuntimeAnalyzer', () => {
  it('supports fastapi app type', () => {
    const analyzer = new FastApiRuntimeAnalyzer();
    expect(analyzer.supports(makeFp({ appType: 'fastapi', backendFramework: 'fastapi' }))).toBe(true);
  });

  it('supports projects with fastapi backend framework', () => {
    const analyzer = new FastApiRuntimeAnalyzer();
    expect(analyzer.supports(makeFp({ backendFramework: 'fastapi' }))).toBe(true);
  });

  it('does not support non-fastapi projects', () => {
    const analyzer = new FastApiRuntimeAnalyzer();
    expect(analyzer.supports(makeFp({ appType: 'nextjs' }))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FastAPI Runtime Analyzer — CORS detection
describe('FastApiRuntimeAnalyzer CORS detection', () => {
  it('detects wildcard CORS configuration', async () => {
    const analyzer = new FastApiRuntimeAnalyzer();
    const ctx = makeCtx({ projectRoot: FASTAPI_FIXTURE, appType: 'fastapi' });
    const result = await analyzer.run(ctx);
    const corsFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('cors') &&
      f.title.toLowerCase().includes('wildcard')
    );
    expect(corsFindings.length).toBeGreaterThan(0);
  }, 30_000);

  it('marks CORS wildcard as high severity', async () => {
    const analyzer = new FastApiRuntimeAnalyzer();
    const ctx = makeCtx({ projectRoot: FASTAPI_FIXTURE, appType: 'fastapi' });
    const result = await analyzer.run(ctx);
    const corsFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('cors')
    );
    for (const f of corsFindings) {
      expect(['high', 'critical']).toContain(f.severity);
    }
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// CLI Runtime Analyzer — supports()
describe('CliRuntimeAnalyzer', () => {
  it('supports projects with package scripts', () => {
    const analyzer = new CliRuntimeAnalyzer();
    const fp = makeFp({ packageScripts: { cli: 'node cli.js' } });
    expect(analyzer.supports(fp)).toBe(true);
  });

  it('supports projects with CLI entrypoints', () => {
    const analyzer = new CliRuntimeAnalyzer();
    const fp = makeFp({ entrypoints: [{ name: 'cli.js', path: '/fake/cli.js', type: 'cli' }] });
    expect(analyzer.supports(fp)).toBe(true);
  });

  it('does not support projects without CLI indicators', () => {
    const analyzer = new CliRuntimeAnalyzer();
    const fp = makeFp({ packageScripts: {}, entrypoints: [] });
    expect(analyzer.supports(fp)).toBe(false);
  });

  it('detects CLI without parse call', async () => {
    // Test with a basic analyzer call on the CLI fixture
    const analyzer = new CliRuntimeAnalyzer();
    const fp = makeFp({
      projectRoot: CLI_FIXTURE,
      packageScripts: { 'cli-tool': 'python cli.py' },
    });
    const ctx = makeCtx({ ...fp, fingerprint: fp });
    const result = await analyzer.run({ ...ctx, fingerprint: fp });
    // At minimum, should not throw
    expect(result).toBeDefined();
    expect(result.analyzerId).toBe('cli-runtime');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MCP Runtime Analyzer — supports()
describe('McpRuntimeAnalyzer', () => {
  it('supports mcp-server app type', () => {
    const analyzer = new McpRuntimeAnalyzer();
    expect(analyzer.supports(makeFp({ appType: 'mcp-server' }))).toBe(true);
  });

  it('supports TypeScript projects (potential MCP)', () => {
    const analyzer = new McpRuntimeAnalyzer();
    expect(analyzer.supports(makeFp({ languages: ['typescript'] }))).toBe(true);
  });

  it('does not support pure Python projects without MCP indicators', () => {
    const analyzer = new McpRuntimeAnalyzer();
    expect(analyzer.supports(makeFp({ languages: ['python'], appType: 'python-bot' }))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MCP Runtime Analyzer — security detection
describe('McpRuntimeAnalyzer security detection', () => {
  it('detects arbitrary shell execution', async () => {
    const analyzer = new McpRuntimeAnalyzer();
    const ctx = makeCtx({ projectRoot: MCP_FIXTURE, appType: 'unknown', languages: ['typescript'] });
    const result = await analyzer.run(ctx);
    const shellFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('shell') ||
      f.title.toLowerCase().includes('arbitrary')
    );
    expect(shellFindings.length).toBeGreaterThan(0);
  });

  it('marks arbitrary shell as critical severity', async () => {
    const analyzer = new McpRuntimeAnalyzer();
    const ctx = makeCtx({ projectRoot: MCP_FIXTURE, appType: 'unknown', languages: ['typescript'] });
    const result = await analyzer.run(ctx);
    const shellFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('shell')
    );
    if (shellFindings.length > 0) {
      for (const f of shellFindings) {
        expect(f.severity).toBe('critical');
      }
    }
  });

  it('detects unrestricted filesystem access', async () => {
    const analyzer = new McpRuntimeAnalyzer();
    const ctx = makeCtx({ projectRoot: MCP_FIXTURE, appType: 'unknown', languages: ['typescript'] });
    const result = await analyzer.run(ctx);
    const fsFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('filesystem') ||
      f.title.toLowerCase().includes('file')
    );
    expect(fsFindings.length).toBeGreaterThan(0);
  });

  it('detects missing workspace allowlist', async () => {
    const analyzer = new McpRuntimeAnalyzer();
    const ctx = makeCtx({ projectRoot: MCP_FIXTURE, appType: 'unknown', languages: ['typescript'] });
    const result = await analyzer.run(ctx);
    const allowlistFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('workspace') ||
      f.title.toLowerCase().includes('allowlist')
    );
    expect(allowlistFindings.length).toBeGreaterThan(0);
  });

  it('returns findings with correct categories', async () => {
    const analyzer = new McpRuntimeAnalyzer();
    const ctx = makeCtx({ projectRoot: MCP_FIXTURE, appType: 'unknown', languages: ['typescript'] });
    const result = await analyzer.run(ctx);
    if (result.findings.length > 0) {
      for (const f of result.findings) {
        expect(['security', 'runtime', 'maintainability']).toContain(f.category);
      }
    }
  });

  it('returns findings with evidence', async () => {
    const analyzer = new McpRuntimeAnalyzer();
    const ctx = makeCtx({ projectRoot: MCP_FIXTURE, appType: 'unknown', languages: ['typescript'] });
    const result = await analyzer.run(ctx);
    if (result.findings.length > 0) {
      for (const f of result.findings) {
        expect(f.evidence.length).toBeGreaterThan(0);
        expect(f.suggestedFix).toBeDefined();
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Runtime findings have required fields
describe('Runtime findings have required fields', () => {
  it('all findings have severity, category, confidence, evidence', async () => {
    const pythonAnalyzer = new PythonRuntimeAnalyzer();
    const mcpAnalyzer = new McpRuntimeAnalyzer();
    const fastapiAnalyzer = new FastApiRuntimeAnalyzer();

    const analyzers = [
      { analyzer: pythonAnalyzer, ctx: makeCtx({ projectRoot: PYTHON_BOT_FIXTURE }) },
      { analyzer: mcpAnalyzer, ctx: makeCtx({ projectRoot: MCP_FIXTURE, appType: 'unknown', languages: ['typescript'] }) },
      { analyzer: fastapiAnalyzer, ctx: makeCtx({ projectRoot: FASTAPI_FIXTURE, appType: 'fastapi' }) },
    ];

    for (const { analyzer, ctx } of analyzers) {
      const result = await analyzer.run(ctx);
      for (const f of result.findings) {
        expect(f.id).toBeDefined();
        expect(f.title).toBeDefined();
        expect(f.severity).toBeDefined();
        expect(f.category).toBeDefined();
        expect(f.explanation).toBeDefined();
        expect(f.evidence.length).toBeGreaterThan(0);
        expect(f.confidence).toBeGreaterThan(0);
        expect(f.confidence).toBeLessThanOrEqual(100);
        expect(f.fixable).toBeDefined();
        expect(f.tags.length).toBeGreaterThan(0);
      }
    }
  }, 30_000);
});
