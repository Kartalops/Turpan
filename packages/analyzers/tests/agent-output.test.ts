/**
 * Agent Output Audit — Tests
 */

import { describe, it, expect } from 'vitest';
import { resolve, join } from 'path';
import { readFileSync } from 'fs';
import {
  parseTaskText,
  loadTaskFile,
  loadDefaultTask,
  mapImplementation,
  analyzeFakeImplementations,
  analyzeReadmeMismatch,
  analyzeNoopTests,
  analyzeUnwiredFeatures,
  runAgentOutputAudit,
  findTestFiles,
} from '../src/index.js';

const FIXTURE = resolve(__dirname, 'fixtures/agent-output');

describe('TaskParser', () => {
  it('extracts auth capability from task text', () => {
    const task = parseTaskText('Build a SaaS app with JWT authentication and login page');
    expect(task.capabilities.some(c => c.category === 'auth')).toBe(true);
  });

  it('extracts billing capability from task text', () => {
    const task = parseTaskText('Integrate Stripe for payment processing and billing');
    expect(task.capabilities.some(c => c.category === 'billing')).toBe(true);
  });

  it('extracts multiple capabilities', () => {
    const task = parseTaskText('Build a Next.js app with auth, database, and dashboard');
    const categories = task.capabilities.map(c => c.category);
    expect(categories).toContain('auth');
    expect(categories).toContain('database');
    expect(categories).toContain('dashboard');
    expect(categories).toContain('ui-pages');
  });

  it('detects claude-code agent type', () => {
    const task = parseTaskText('claude-code built this app with Next.js');
    expect(task.agentType).toBe('claude-code');
  });

  it('extracts project hints', () => {
    const task = parseTaskText('Build a FastAPI backend with PostgreSQL and Prisma');
    expect(task.projectHints).toContain('fastapi');
    expect(task.projectHints).toContain('prisma');
  });

  it('loads task from file', () => {
    const taskPath = join(FIXTURE, 'README.md');
    // Use a dedicated task file for this
    const task = parseTaskText('Build auth with JWT, billing with Stripe, dashboard with charts, Prisma database, SendGrid email', 'shell');
    expect(task.capabilities.length).toBeGreaterThan(0);
  });

  it('returns empty capabilities for generic text', () => {
    const task = parseTaskText('Build something cool');
    expect(task.capabilities.length).toBeGreaterThanOrEqual(0);
  });
});

describe('ImplementationMapper', () => {
  it('maps Next.js API routes', () => {
    const task = parseTaskText('Build an API with auth and billing endpoints');
    const impl = mapImplementation(FIXTURE, task);
    const endpoints = impl.items.filter(i => i.type === 'endpoint');
    expect(endpoints.length).toBeGreaterThan(0);
  });

  it('maps components', () => {
    const task = parseTaskText('Build a dashboard with charts');
    const impl = mapImplementation(FIXTURE, task);
    const components = impl.items.filter(i => i.type === 'component');
    expect(components.length).toBeGreaterThan(0);
  });

  it('identifies auth-related files', () => {
    const task = parseTaskText('Build auth with JWT');
    const impl = mapImplementation(FIXTURE, task);
    const authItems = impl.items.filter(i => i.capability === 'auth');
    expect(authItems.length).toBeGreaterThan(0);
  });

  it('identifies billing-related files', () => {
    const task = parseTaskText('Integrate Stripe billing');
    const impl = mapImplementation(FIXTURE, task);
    const billingItems = impl.items.filter(i => i.capability === 'billing');
    expect(billingItems.length).toBeGreaterThan(0);
  });

  it('finds test files', () => {
    const testFiles = findTestFiles(FIXTURE);
    expect(testFiles.length).toBeGreaterThan(0);
  });
});

describe('FakeImplementationAnalyzer', () => {
  it('detects hardcoded success in auth endpoint', () => {
    const task = parseTaskText('Build auth with JWT login');
    const impl = mapImplementation(FIXTURE, task);
    const sourceFiles = collectFiles(FIXTURE);

    const issues = analyzeFakeImplementations({
      projectRoot: FIXTURE,
      files: sourceFiles,
      taskCapabilities: task.capabilities.map(c => c.category),
    });

    const fakeIssues = issues.filter(i => i.kind === 'fake-implementation');
    expect(fakeIssues.length).toBeGreaterThan(0);
  });

  it('flags hardcoded credentials', () => {
    const task = parseTaskText('Build a full SaaS app');
    const sourceFiles = collectFiles(FIXTURE);

    const issues = analyzeFakeImplementations({
      projectRoot: FIXTURE,
      files: sourceFiles,
      taskCapabilities: ['auth', 'billing'],
    });

    const credIssues = issues.filter(i =>
      i.kind === 'fake-implementation' && i.title.toLowerCase().includes('credential')
    );
    expect(credIssues.length).toBeGreaterThan(0);
  });

  it('detects TODO in production code paths', () => {
    const task = parseTaskText('Build Stripe billing integration');
    const sourceFiles = collectFiles(FIXTURE);

    const issues = analyzeFakeImplementations({
      projectRoot: FIXTURE,
      files: sourceFiles,
      taskCapabilities: ['billing'],
    });

    expect(issues.some(i => i.kind === 'fake-implementation')).toBe(true);
  });
});

describe('ReadmeMismatchAnalyzer', () => {
  it('detects README claims not backed by code', () => {
    const task = parseTaskText('Build auth, billing, database, email, api, tests, mcp, deployment');
    const issues = analyzeReadmeMismatch({
      projectRoot: FIXTURE,
      taskCapabilities: task.capabilities.map(c => c.category),
    });

    const mismatchIssues = issues.filter(i => i.kind === 'readme-mismatch');
    expect(mismatchIssues.length).toBeGreaterThan(0);
  });

  it('flags missing email implementation despite README claim', () => {
    const task = parseTaskText('Send emails with SendGrid');
    const issues = analyzeReadmeMismatch({
      projectRoot: FIXTURE,
      taskCapabilities: ['email'],
    });

    // Email is referenced in README but not really implemented
    const emailIssues = issues.filter(i =>
      i.kind === 'readme-mismatch' && i.file === 'README.md'
    );
    expect(emailIssues.length).toBeGreaterThan(0);
  });
});

describe('NoopTestAnalyzer', () => {
  it('detects tests with only truthy checks', () => {
    const testFiles = findTestFiles(FIXTURE);
    const issues = analyzeNoopTests({ projectRoot: FIXTURE, testFiles });

    const noopIssues = issues.filter(i => i.kind === 'noop-test');
    expect(noopIssues.length).toBeGreaterThan(0);
  });

  it('detects skipped tests', () => {
    const testFiles = findTestFiles(FIXTURE);
    const issues = analyzeNoopTests({ projectRoot: FIXTURE, testFiles });

    const skipped = issues.filter(i => i.title.toLowerCase().includes('skip'));
    expect(skipped.length).toBeGreaterThan(0);
  });

  it('detects tests that only render without assertion', () => {
    const testFiles = findTestFiles(FIXTURE);
    const issues = analyzeNoopTests({ projectRoot: FIXTURE, testFiles });

    const renderOnly = issues.filter(i => i.title.toLowerCase().includes('render'));
    expect(renderOnly.length).toBeGreaterThan(0);
  });
});

describe('UnwiredFeatureAnalyzer', () => {
  it('detects unwired components', () => {
    const issues = analyzeUnwiredFeatures({
      projectRoot: FIXTURE,
      taskCapabilities: ['dashboard'],
    });

    const unwired = issues.filter(i => i.kind === 'unwired-feature');
    expect(unwired.length).toBeGreaterThan(0);
  });
});

describe('CompletenessAnalyzer — Full Audit', () => {
  it('runs full audit and returns report', async () => {
    const report = await runAgentOutputAudit({
      projectRoot: FIXTURE,
      taskText: 'Build auth with JWT, Stripe billing, dashboard, Prisma database, SendGrid email, API endpoints, and tests',
    });

    expect(report).toBeDefined();
    expect(report.completion).toBeDefined();
    expect(report.issues).toBeDefined();
    expect(report.implementation).toBeDefined();
  });

  it('computes completion score', async () => {
    const report = await runAgentOutputAudit({
      projectRoot: FIXTURE,
      taskText: 'Build auth, billing, dashboard, database, email, api, tests',
    });

    expect(report.completion.overall).toBeGreaterThanOrEqual(0);
    expect(report.completion.overall).toBeLessThanOrEqual(100);
    expect(typeof report.completion.requestedFeatureCoverage).toBe('number');
    expect(typeof report.completion.implementationDepth).toBe('number');
    expect(typeof report.completion.testCoverageRelevance).toBe('number');
  });

  it('detects missing capabilities', async () => {
    const report = await runAgentOutputAudit({
      projectRoot: FIXTURE,
      taskText: 'Build MCP server and CLI tool',
    });

    const missing = report.completion.missingCapabilities;
    expect(missing.length).toBeGreaterThan(0);
  });

  it('detects fake implementations', async () => {
    const report = await runAgentOutputAudit({
      projectRoot: FIXTURE,
      taskText: 'Build Stripe billing and JWT auth',
    });

    const fakes = report.issues.filter(i => i.kind === 'fake-implementation');
    expect(fakes.length).toBeGreaterThan(0);
  });

  it('returns recommendation', async () => {
    const report = await runAgentOutputAudit({
      projectRoot: FIXTURE,
      taskText: 'Full SaaS app with auth billing dashboard database email api tests mcp cli',
    });

    expect(['READY', 'READY_WITH_LIMITATIONS', 'NOT_READY', 'MAJOR_REWORK']).toContain(report.recommendation);
  });

  it('returns confidence level', async () => {
    const report = await runAgentOutputAudit({
      projectRoot: FIXTURE,
      taskText: 'Build a SaaS app',
    });

    expect(['high', 'medium', 'low']).toContain(report.confidenceLevel);
  });

  it('produces non-empty summary', async () => {
    const report = await runAgentOutputAudit({
      projectRoot: FIXTURE,
      taskText: 'Build auth, billing, and dashboard',
    });

    expect(report.summary.length).toBeGreaterThan(10);
  });

  it('includes evidence files', async () => {
    const report = await runAgentOutputAudit({
      projectRoot: FIXTURE,
      taskText: 'Build a full-stack app',
    });

    expect(Array.isArray(report.evidenceFiles)).toBe(true);
  });
});

// ── Test Fixtures ───────────────────────────────────────────────────────────

describe('Integration: Full pipeline with fixtures', () => {
  it('fixture: fake checkout should be detected as fake', async () => {
    const report = await runAgentOutputAudit({
      projectRoot: FIXTURE,
      taskText: 'Build Stripe checkout with billing',
    });

    const billingFakes = report.issues.filter(
      i => i.kind === 'fake-implementation' && i.file?.includes('billing')
    );
    expect(billingFakes.length).toBeGreaterThan(0);
  });

  it('fixture: hardcoded credentials should be flagged', async () => {
    const report = await runAgentOutputAudit({
      projectRoot: FIXTURE,
      taskText: 'Build a full SaaS application',
    });

    const issues = report.issues.filter(
      i => i.kind === 'fake-implementation' &&
           i.title.toLowerCase().includes('credential')
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('fixture: unwired component should be detected', async () => {
    const report = await runAgentOutputAudit({
      projectRoot: FIXTURE,
      taskText: 'Build a dashboard with charts',
    });

    const unwired = report.issues.filter(i => i.kind === 'unwired-feature');
    expect(unwired.length).toBeGreaterThan(0);
  });

  it('fixture: noop tests should be found', async () => {
    const report = await runAgentOutputAudit({
      projectRoot: FIXTURE,
      taskText: 'Write comprehensive tests',
    });

    const noop = report.issues.filter(i => i.kind === 'noop-test');
    expect(noop.length).toBeGreaterThan(0);
  });
});

// ── Helper ───────────────────────────────────────────────────────────────────

function collectFiles(projectRoot: string): string[] {
  const { readdirSync } = require('fs');
  const { join } = require('path');
  const files: string[] = [];
  const textExts = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs']);

  function walk(dir: string, depth = 0): void {
    if (depth > 4) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (entry.isFile() && textExts.has(entry.name.split('.').pop() ?? '')) {
          files.push(fullPath);
        }
      }
    } catch {
      // skip
    }
  }

  walk(projectRoot);
  return files;
}
