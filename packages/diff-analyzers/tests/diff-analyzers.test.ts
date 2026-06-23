/**
 * Tests for @turpan/diff-analyzers — diff-scoped security, correctness, and test coverage analyzers
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import type { GitDiffResult } from '@turpan/git-diff';
import { DiffScopedSecurityAnalyzers } from '../src/security/index.js';
import { ChangedSurfaceAnalyzer } from '../src/correctness/index.js';
import { TestCoverageAnalyzer } from '../src/test-coverage/index.js';
import type { DiffScopedFinding } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadFixture(name: string): { diffResult: GitDiffResult; expectedFindings: unknown[] } {
  const fixturePath = join(__dirname, 'fixtures', `${name}.json`);
  const raw = readFileSync(fixturePath, 'utf-8');
  const parsed = JSON.parse(raw);
  return {
    diffResult: parsed.diffResult as GitDiffResult,
    expectedFindings: (parsed.expectedFindings ?? []) as unknown[],
  };
}

function makeCtx(diffResult: GitDiffResult): { diffResult: GitDiffResult; projectRoot: string } {
  return { diffResult, projectRoot: '/fake/project' };
}

function severityOf(findings: DiffScopedFinding[], severity: string): DiffScopedFinding[] {
  return findings.filter(f => f.severity === severity);
}

function findingsForFile(findings: DiffScopedFinding[], file: string): DiffScopedFinding[] {
  return findings.filter(f => f.file === file);
}

// ─── Security Analyzers ───────────────────────────────────────────────────────

describe('DiffScopedSecurityAnalyzers', () => {
  let security: DiffScopedSecurityAnalyzers;

  beforeEach(() => {
    security = new DiffScopedSecurityAnalyzers();
  });

  describe('HardcodedSecretAnalyzer — diff-introduces-secret', () => {
    it('should detect hardcoded AWS key', async () => {
      const { diffResult } = loadFixture('diff-introduces-secret');
      const ctx = makeCtx(diffResult);
      const { findings } = await security.run(ctx);
      const crit = severityOf(findings, 'critical');
      expect(crit.length).toBeGreaterThan(0);
      const aws = crit.find(f => f.pattern === 'awsKey' || f.explanation.includes('AKIA'));
      expect(aws).toBeDefined();
    });

    it('should detect hardcoded password/credential', async () => {
      const { diffResult } = loadFixture('diff-introduces-secret');
      const ctx = makeCtx(diffResult);
      const { findings } = await security.run(ctx);
      const crit = severityOf(findings, 'critical');
      const secret = crit.find(f =>
        f.pattern === 'genericSecret' || f.explanation.toLowerCase().includes('password')
      );
      expect(secret).toBeDefined();
    });

    it('should report correct file path', async () => {
      const { diffResult } = loadFixture('diff-introduces-secret');
      const ctx = makeCtx(diffResult);
      const { findings } = await security.run(ctx);
      const fileFindings = findingsForFile(findings, 'src/lib/api-client.ts');
      expect(fileFindings.length).toBeGreaterThan(0);
    });

    it('should set introducedBy based on changeType', async () => {
      const { diffResult } = loadFixture('diff-introduces-secret');
      const ctx = makeCtx(diffResult);
      const { findings } = await security.run(ctx);
      // New file added → introducedBy should be 'added'
      const secretFindings = findings.filter(f => f.severity === 'critical');
      expect(secretFindings.every(f => f.introducedBy === 'added')).toBe(true);
    });
  });

  describe('AuthGuardAnalyzer — diff-removes-auth-guard', () => {
    it('should detect auth guard bypass via skipAuth comment', async () => {
      const { diffResult } = loadFixture('diff-removes-auth-guard');
      const ctx = makeCtx(diffResult);
      const { findings } = await security.run(ctx);
      const crit = severityOf(findings, 'critical');
      const high = severityOf(findings, 'high');
      // skipAuth triggers PUBLIC_ROUTE_PATTERNS → high, middleware removal → high
      expect(high.length).toBeGreaterThan(0);
    });

    it('should flag the correct file', async () => {
      const { diffResult } = loadFixture('diff-removes-auth-guard');
      const ctx = makeCtx(diffResult);
      const { findings } = await security.run(ctx);
      const fileFindings = findingsForFile(findings, 'src/routes/admin.ts');
      expect(fileFindings.length).toBeGreaterThan(0);
    });
  });

  describe('AdminRouteAnalyzer — diff-adds-admin-route-no-auth', () => {
    it('should detect admin route without auth', async () => {
      const { diffResult } = loadFixture('diff-adds-admin-route-no-auth');
      const ctx = makeCtx(diffResult);
      const { findings } = await security.run(ctx);
      const high = severityOf(findings, 'high');
      const adminFinding = high.find(f =>
        f.category === 'security' && (f.explanation.toLowerCase().includes('admin') || f.title.toLowerCase().includes('admin'))
      );
      expect(adminFinding).toBeDefined();
    });
  });

  describe('docs-only fixture — should not report critical findings', () => {
    it('diff-docs-only-clean: should skip docs-only diffs', async () => {
      const { diffResult } = loadFixture('diff-docs-only-clean');
      const ctx = makeCtx(diffResult);
      const { findings } = await security.run(ctx);
      // Docs-only changes should not trigger security findings
      const crit = severityOf(findings, 'critical');
      const high = severityOf(findings, 'high');
      expect(crit.length).toBe(0);
      expect(high.length).toBe(0);
    });
  });

  describe('huge diff — should still run', () => {
    it('diff-huge-low-confidence: should not crash on large diff', async () => {
      const { diffResult } = loadFixture('diff-huge-low-confidence');
      const ctx = makeCtx(diffResult);
      const { findings } = await security.run(ctx);
      // Should complete without error
      expect(Array.isArray(findings)).toBe(true);
    });
  });

  describe('deduplication', () => {
    it('should deduplicate findings with same id', async () => {
      const { diffResult } = loadFixture('diff-introduces-secret');
      const ctx = makeCtx(diffResult);
      const { findings } = await security.run(ctx);
      const ids = findings.map(f => f.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('all findings have required fields', () => {
    it('every finding has id, severity, category, title, explanation, introducedBy, pattern', async () => {
      const { diffResult } = loadFixture('diff-introduces-secret');
      const ctx = makeCtx(diffResult);
      const { findings } = await security.run(ctx);
      for (const f of findings) {
        expect(typeof f.id).toBe('string');
        expect(f.id.length).toBeGreaterThan(0);
        expect(['critical', 'high', 'medium', 'low', 'info']).toContain(f.severity);
        expect(['security', 'correctness', 'test-coverage']).toContain(f.category);
        expect(typeof f.title).toBe('string');
        expect(typeof f.explanation).toBe('string');
        expect(['added', 'modified', 'deleted', 'renamed']).toContain(f.introducedBy);
        expect(typeof f.pattern).toBe('string');
        expect(typeof f.confidence).toBe('number');
      }
    });
  });
});

// ─── Correctness Analyzers ────────────────────────────────────────────────────

describe('ChangedSurfaceAnalyzer', () => {
  let correctness: ChangedSurfaceAnalyzer;

  beforeEach(() => {
    correctness = new ChangedSurfaceAnalyzer();
  });

  describe('diff-changes-api-contract-no-client-update', () => {
    it('should detect API contract change without client update', async () => {
      const { diffResult } = loadFixture('diff-changes-api-contract-no-client-update');
      const ctx = makeCtx(diffResult);
      const { findings } = await correctness.run(ctx);
      const apiContractFindings = findings.filter(f => f.id.startsWith('api-contract'));
      expect(apiContractFindings.length).toBeGreaterThan(0);
    });
  });

  describe('diff-docs-only-clean', () => {
    it('should produce minimal/no findings for docs-only diff', async () => {
      const { diffResult } = loadFixture('diff-docs-only-clean');
      const ctx = makeCtx(diffResult);
      const { findings } = await correctness.run(ctx);
      // Docs-only should not generate correctness findings
      const highOrCrit = [...severityOf(findings, 'critical'), ...severityOf(findings, 'high')];
      expect(highOrCrit.length).toBe(0);
    });
  });

  describe('returns valid findings shape', () => {
    it('all findings have required DiffScopedFinding fields', async () => {
      const { diffResult } = loadFixture('diff-changes-api-contract-no-client-update');
      const ctx = makeCtx(diffResult);
      const { findings } = await correctness.run(ctx);
      for (const f of findings) {
        expect(typeof f.id).toBe('string');
        expect(['critical', 'high', 'medium', 'low', 'info']).toContain(f.severity);
        expect(typeof f.title).toBe('string');
        expect(typeof f.explanation).toBe('string');
        expect(typeof f.confidence).toBe('number');
      }
    });
  });

  describe('parallel execution', () => {
    it('should complete in reasonable time (under 5s for all fixtures)', async () => {
      const start = Date.now();
      const { diffResult } = loadFixture('diff-changes-api-contract-no-client-update');
      const ctx = makeCtx(diffResult);
      await correctness.run(ctx);
      expect(Date.now() - start).toBeLessThan(5000);
    });
  });
});

// ─── Test Coverage Analyzers ─────────────────────────────────────────────────

describe('TestCoverageAnalyzer', () => {
  let testCov: TestCoverageAnalyzer;

  beforeEach(() => {
    testCov = new TestCoverageAnalyzer();
  });

  describe('diff-feature-no-tests', () => {
    it('should flag missing tests for feature code changes', async () => {
      const { diffResult } = loadFixture('diff-feature-no-tests');
      const ctx = makeCtx(diffResult);
      const { findings } = await testCov.run(ctx);
      const high = severityOf(findings, 'high');
      const medium = severityOf(findings, 'medium');
      expect(high.length + medium.length).toBeGreaterThan(0);
    });

    it('should identify billing/auth as critical features needing tests', async () => {
      const { diffResult } = loadFixture('diff-feature-no-tests');
      const ctx = makeCtx(diffResult);
      const { findings } = await testCov.run(ctx);
      const high = severityOf(findings, 'high');
      // Billing is a critical feature — should be flagged HIGH
      const billingRelated = high.filter(f =>
        f.title.toLowerCase().includes('billing') ||
        f.title.toLowerCase().includes('auth') ||
        f.title.toLowerCase().includes('payment')
      );
      expect(billingRelated.length).toBeGreaterThan(0);
    });
  });

  describe('diff-test-deletion', () => {
    it('should flag deleted test files as HIGH severity', async () => {
      const { diffResult } = loadFixture('diff-test-deletion');
      const ctx = makeCtx(diffResult);
      const { findings } = await testCov.run(ctx);
      const high = severityOf(findings, 'high');
      // TestDeletionAnalyzer fires: "Test file deleted" — contains "delet"
      const deletedTest = high.find(f =>
        f.title.toLowerCase().includes('delet') ||
        f.explanation.toLowerCase().includes('delet')
      );
      expect(deletedTest).toBeDefined();
      // Also: CriticalFeatureCoverageAnalyzer fires (auth.ts changed without tests)
      // — title does NOT contain "delet" but that's also a valid high finding
      expect(high.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('diff-docs-only-clean — should skip test coverage checks', () => {
    it('should not flag docs-only diffs for missing tests', async () => {
      const { diffResult } = loadFixture('diff-docs-only-clean');
      const ctx = makeCtx(diffResult);
      const { findings } = await testCov.run(ctx);
      // Docs-only changes should not generate missing-test findings
      const high = severityOf(findings, 'high');
      const medium = severityOf(findings, 'medium');
      expect(high.length + medium.length).toBe(0);
    });
  });

  describe('returns valid TestCoverageFinding shape', () => {
    it('all findings have required fields', async () => {
      const { diffResult } = loadFixture('diff-feature-no-tests');
      const ctx = makeCtx(diffResult);
      const { findings } = await testCov.run(ctx);
      for (const f of findings) {
        expect(typeof f.id).toBe('string');
        expect(f.severity).toBeDefined();
        expect(f.title).toBeTruthy();
        expect(f.explanation).toBeTruthy();
        expect(f.confidence).toBeGreaterThan(0);
      }
    });
  });
});

// ─── Changed Surface Mapping ─────────────────────────────────────────────────

describe('changed surface mapping', () => {
  it('diff-changes-api-contract-no-client-update: should detect changed components', async () => {
    const { diffResult } = loadFixture('diff-changes-api-contract-no-client-update');
    // changedComponents from GitDiffEngine should be populated
    expect(diffResult.changedComponents.length).toBeGreaterThan(0);
    const userList = diffResult.changedComponents.find(c => c.name === 'UserList');
    expect(userList).toBeDefined();
  });

  it('diff-adds-admin-route-no-auth: should detect changed APIs', async () => {
    const { diffResult } = loadFixture('diff-adds-admin-route-no-auth');
    expect(diffResult.changedApis.length).toBeGreaterThan(0);
    expect(diffResult.changedApis.some(a => a.path.includes('admin'))).toBe(true);
  });

  it('diff-docs-only-clean: should not be classified as having changed routes', async () => {
    const { diffResult } = loadFixture('diff-docs-only-clean');
    // Docs-only should not trigger route/API detection as risky surface
    expect(diffResult.changedRoutes.length).toBe(0);
  });
});

// ─── Individual Analyzer Exports ──────────────────────────────────────────────

describe('individual analyzer exports', () => {
  it('HardcodedSecretAnalyzer should be importable and have a run method', async () => {
    const { HardcodedSecretAnalyzer } = await import('../src/security/index.js');
    const { diffResult } = loadFixture('diff-introduces-secret');
    const { findings } = await HardcodedSecretAnalyzer.run({ diffResult, projectRoot: '/fake' });
    expect(findings.length).toBeGreaterThan(0);
  });

  it('AuthGuardAnalyzer should be importable and have a run method', async () => {
    const { AuthGuardAnalyzer } = await import('../src/security/index.js');
    const { diffResult } = loadFixture('diff-removes-auth-guard');
    const { findings } = await AuthGuardAnalyzer.run({ diffResult, projectRoot: '/fake' });
    expect(findings.length).toBeGreaterThan(0);
  });

  it('AdminRouteAnalyzer should be importable and have a run method', async () => {
    const { AdminRouteAnalyzer } = await import('../src/security/index.js');
    const { diffResult } = loadFixture('diff-adds-admin-route-no-auth');
    const { findings } = await AdminRouteAnalyzer.run({ diffResult, projectRoot: '/fake' });
    expect(findings.length).toBeGreaterThan(0);
  });

  it('TestDeletionAnalyzer should flag deleted tests', async () => {
    const { TestDeletionAnalyzer } = await import('../src/test-coverage/index.js');
    const { diffResult } = loadFixture('diff-test-deletion');
    const { findings } = await TestDeletionAnalyzer.run({ diffResult, projectRoot: '/fake' });
    expect(findings.some(f => f.severity === 'high')).toBe(true);
  });
});
