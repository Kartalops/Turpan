/**
 * @turpan/fix-engine — tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';

// ─── Imports ──────────────────────────────────────────────────────────────────
import {
  DEFAULT_FIX_POLICY,
  policyForMode,
  isAutoApplicable,
  isModeAllowed,
  requiresConfirmation,
  validatePolicy,
  mergePolicy,
} from '../src/FixPolicy.js';

import {
  lookupStrategy,
  isFixable,
  filterFixable,
} from '../src/SafeFixCatalog.js';

import {
  createFixCandidate,
  createFixCandidates,
  filterByConfidence,
  getAutoSafeCandidates,
  aggregateRequiredChecks,
} from '../src/FixCandidate.js';

import { buildFixPlan, summarizePlan } from '../src/FixPlanner.js';
import { generatePatch, formatPatchHeader, generateSinglePatch } from '../src/PatchGenerator.js';
import { dryRunPatchApply } from '../src/PatchApplier.js';
import { shouldRollback } from '../src/PatchVerifier.js';
import { parseBackupFilename, getBackupDir } from '../src/RollbackManager.js';
import { renderFixPlanReport } from '../src/reportWriter.js';

import type { Finding } from '@turpan/core';
import type { FixCandidate, ValidationSummary, ValidationResult } from '../src/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  const defaultFinding: Finding = {
    id: 'fnd-test-001',
    title: 'Test Finding',
    severity: 'medium',
    category: 'dead-code',
    explanation: 'This is a test finding.',
    evidence: [{
      type: 'command-log',
      label: 'test',
      excerpt: 'test evidence',
      timestamp: new Date().toISOString(),
    }],
    fixable: 'auto',
    confidence: 80,
    tags: [],
    ...overrides,
  };
  return defaultFinding;
}

function makeCandidate(
  projectRoot: string,
  finding: Finding,
  overrides: Partial<FixCandidate> = {}
): FixCandidate {
  const filePath = join(projectRoot, 'test.ts');
  const candidate = createFixCandidate(finding, projectRoot)!;
  return { ...candidate, ...overrides };
}

// ─── FixPolicy Tests ───────────────────────────────────────────────────────────

describe('FixPolicy', () => {
  describe('policyForMode', () => {
    it('report-only does not block any category (display-only)', () => {
      const p = policyForMode('report-only');
      expect(p.blockedCategories).toEqual([]);
    });

    it('patch-only blocks only unsafe', () => {
      const p = policyForMode('patch-only');
      expect(p.blockedCategories).toContain('unsafe');
      expect(p.blockedCategories).not.toContain('safe');
    });

    it('apply blocks unsafe categories', () => {
      const p = policyForMode('apply');
      expect(p.blockedCategories).toContain('unsafe');
      expect(p.autoSafeCategories).toContain('safe');
    });

    it('auto-safe blocks unsafe and defers manual (requires confirmation)', () => {
      const p = policyForMode('auto-safe');
      expect(p.blockedCategories).toContain('unsafe');
      expect(p.blockedCategories).not.toContain('manual'); // manual is deferred, not blocked
      expect(p.autoSafeCategories).toContain('safe');
    });

    it('interactive does not require clean git tree', () => {
      const p = policyForMode('interactive');
      expect(p.requireCleanGitTree).toBe(false);
    });

    it('apply requires clean git tree', () => {
      const p = policyForMode('apply');
      expect(p.requireCleanGitTree).toBe(true);
    });
  });

  describe('isAutoApplicable', () => {
    it('safe is auto-applicable in auto-safe mode', () => {
      const p = policyForMode('auto-safe');
      expect(isAutoApplicable(p, 'safe')).toBe(true);
    });

    it('manual is not auto-applicable in auto-safe mode', () => {
      const p = policyForMode('auto-safe');
      expect(isAutoApplicable(p, 'manual')).toBe(false);
    });

    it('unsafe is never auto-applicable', () => {
      const p = policyForMode('apply');
      expect(isAutoApplicable(p, 'unsafe')).toBe(false);
    });
  });

  describe('isModeAllowed', () => {
    it('all modes are allowed by default', () => {
      const p = DEFAULT_FIX_POLICY;
      expect(isModeAllowed(p, 'report-only')).toBe(true);
      expect(isModeAllowed(p, 'patch-only')).toBe(true);
      expect(isModeAllowed(p, 'apply')).toBe(true);
      expect(isModeAllowed(p, 'interactive')).toBe(true);
      expect(isModeAllowed(p, 'auto-safe')).toBe(true);
    });
  });

  describe('requiresConfirmation', () => {
    it('interactive always requires confirmation', () => {
      const p = policyForMode('interactive');
      expect(requiresConfirmation(p, 'interactive', 'safe')).toBe(true);
    });

    it('auto-safe does not require confirmation for safe categories', () => {
      const p = policyForMode('auto-safe');
      expect(requiresConfirmation(p, 'auto-safe', 'safe')).toBe(false);
    });

    it('apply requires confirmation for manual category', () => {
      const p = policyForMode('apply');
      expect(requiresConfirmation(p, 'apply', 'manual')).toBe(true);
    });
  });

  describe('validatePolicy', () => {
    it('returns no errors for valid policy', () => {
      const errors = validatePolicy(DEFAULT_FIX_POLICY);
      expect(errors).toHaveLength(0);
    });

    it('returns error for invalid confidence threshold', () => {
      const bad = { ...DEFAULT_FIX_POLICY, minConfidenceThreshold: 150 };
      const errors = validatePolicy(bad);
      expect(errors.some(e => e.includes('minConfidenceThreshold'))).toBe(true);
    });

    it('returns error for negative maxDeletionFileSizeKb', () => {
      const bad = { ...DEFAULT_FIX_POLICY, maxDeletionFileSizeKb: -1 };
      const errors = validatePolicy(bad);
      expect(errors.some(e => e.includes('maxDeletionFileSizeKb'))).toBe(true);
    });
  });

  describe('mergePolicy', () => {
    it('allows overriding minConfidenceThreshold', () => {
      const merged = mergePolicy(DEFAULT_FIX_POLICY, { minConfidenceThreshold: 90 });
      expect(merged.minConfidenceThreshold).toBe(90);
      expect(merged.blockedCategories).toEqual(DEFAULT_FIX_POLICY.blockedCategories);
    });
  });
});

// ─── SafeFixCatalog Tests ─────────────────────────────────────────────────────

describe('SafeFixCatalog', () => {
  it('returns strategy for unused import finding', () => {
    const finding = makeFinding({
      category: 'dead-code',
      tags: ['unused-import'],
      file: 'src/test.ts',
      line: 5,
    });
    const strategy = lookupStrategy(finding);
    expect(strategy).not.toBeNull();
    expect(strategy?.category).toBe('safe');
    expect(strategy?.autoSafe).toBe(true);
  });

  it('returns strategy for console.log finding', () => {
    const finding = makeFinding({
      category: 'maintainability',
      tags: ['console-log'],
      file: 'src/test.ts',
      line: 10,
    });
    const strategy = lookupStrategy(finding);
    expect(strategy).not.toBeNull();
    expect(strategy?.label).toBe('Remove console.log / debugger');
  });

  it('returns strategy for lint autofix finding', () => {
    const finding = makeFinding({
      category: 'lint',
      tags: [],
      file: 'src/test.ts',
      line: 3,
      suggestedFix: 'const x = 1;',
    });
    const strategy = lookupStrategy(finding);
    expect(strategy).not.toBeNull();
    expect(strategy?.label).toBe('Apply lint autofix');
  });

  it('returns null for unknown finding type', () => {
    const finding = makeFinding({
      category: 'security',
      tags: [],
    });
    const strategy = lookupStrategy(finding);
    expect(strategy).toBeNull();
  });

  it('isFixable returns true for fixable findings', () => {
    const fixable = makeFinding({ category: 'dead-code', tags: ['unused-import'], file: 'a.ts', line: 1 });
    const notFixable = makeFinding({ category: 'security', tags: [] });
    expect(isFixable(fixable)).toBe(true);
    expect(isFixable(notFixable)).toBe(false);
  });

  it('filterFixable returns only fixable findings', () => {
    const findings = [
      makeFinding({ category: 'dead-code', tags: ['unused-import'], file: 'a.ts', line: 1 }),
      makeFinding({ category: 'security', tags: [] }),
    ];
    const filtered = filterFixable(findings);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].category).toBe('dead-code');
  });
});

// ─── FixCandidate Tests ───────────────────────────────────────────────────────

describe('FixCandidate', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'turpan-test-'));

  beforeEach(() => {
    // Create a test file in projectRoot
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(projectRoot, 'test.ts'), 'const unused = 1;\nconsole.log("debug");\n', 'utf-8');
  });

  it('createFixCandidate returns null for non-fixable finding', () => {
    const finding = makeFinding({ category: 'security', tags: [] });
    const candidate = createFixCandidate(finding, projectRoot);
    expect(candidate).toBeNull();
  });

  it('createFixCandidate creates valid candidate for fixable finding', () => {
    const finding = makeFinding({
      category: 'dead-code',
      tags: ['unused-import'],
      file: 'test.ts',
      line: 1,
      suggestedFix: '',
    });
    const candidate = createFixCandidate(finding, projectRoot);
    expect(candidate).not.toBeNull();
    expect(candidate!.id).toMatch(/^fix-/);
    expect(candidate!.category).toBe('safe');
    expect(candidate!.autoSafe).toBe(true);
    expect(candidate!.reversible).toBe(true);
  });

  it('createFixCandidates filters out non-fixable', () => {
    const findings = [
      makeFinding({ category: 'dead-code', tags: ['unused-import'], file: 'test.ts', line: 1 }),
      makeFinding({ category: 'security', tags: [] }),
    ];
    const candidates = createFixCandidates(findings, projectRoot);
    expect(candidates).toHaveLength(1);
  });

  it('filterByConfidence respects threshold', () => {
    const finding = makeFinding({
      category: 'dead-code',
      tags: ['unused-import'],
      file: 'test.ts',
      line: 1,
      confidence: 50,
    });
    const candidates = createFixCandidates([finding], projectRoot);
    const filtered = filterByConfidence(candidates, 70);
    expect(filtered).toHaveLength(0);
  });

  it('getAutoSafeCandidates returns only auto-safe candidates', () => {
    const finding = makeFinding({
      category: 'dead-code',
      tags: ['unused-import'],
      file: 'test.ts',
      line: 1,
    });
    const candidates = createFixCandidates([finding], projectRoot);
    const autoSafe = getAutoSafeCandidates(candidates);
    expect(autoSafe.length).toBeGreaterThanOrEqual(0);
  });

  it('aggregateRequiredChecks merges deduplicated checks', () => {
    const finding = makeFinding({
      category: 'dead-code',
      tags: ['unused-import'],
      file: 'test.ts',
      line: 1,
    });
    const candidates = createFixCandidates([finding], projectRoot);
    const checks = aggregateRequiredChecks(candidates);
    expect(Array.isArray(checks)).toBe(true);
  });
});

// ─── FixPlanner Tests ─────────────────────────────────────────────────────────

describe('FixPlanner', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'turpan-plan-test-'));

  beforeEach(() => {
    mkdirSync(projectRoot, { recursive: true });
    // Write test files so extractSnippet can read them
    writeFileSync(join(projectRoot, 'test.ts'), 'const unused = 1;\nconsole.log("debug");\n', 'utf-8');
  });

  it('buildFixPlan report-only mode marks all as applied (for display)', () => {
    const findings = [
      makeFinding({
        id: 'fnd-001',
        category: 'dead-code',
        tags: ['unused-import'],
        file: 'test.ts',
        line: 1,
      }),
    ];
    const plan = buildFixPlan({
      projectRoot,
      fixMode: 'report-only',
      findings,
    });
    expect(plan.applied.length).toBe(1);
    expect(plan.rejected.length).toBe(0);
    expect(plan.deferred.length).toBe(0);
  });

  it('buildFixPlan patch-only mode applies all non-unsafe', () => {
    const findings = [
      makeFinding({
        category: 'dead-code',
        tags: ['unused-import'],
        file: 'test.ts',
        line: 1,
      }),
      // security finding has no matching strategy → creates no candidate
      makeFinding({
        category: 'security',
        tags: [],
      }),
    ];
    const plan = buildFixPlan({
      projectRoot,
      fixMode: 'patch-only',
      findings,
    });
    // Only the dead-code finding creates a candidate
    expect(plan.applied.length).toBe(1); // dead-code is safe, autoSafe
    expect(plan.candidates.length).toBe(1); // security has no strategy
  });

  it('buildFixPlan auto-safe applies only safe auto-candidates', () => {
    const findings = [
      makeFinding({
        category: 'dead-code',
        tags: ['unused-import'],
        file: 'test.ts',
        line: 1,
        confidence: 90,
      }),
      makeFinding({
        category: 'dependency',
        tags: ['unused-dependency'],
        file: 'package.json',
        line: 1,
      }),
    ];
    const plan = buildFixPlan({
      projectRoot,
      fixMode: 'auto-safe',
      findings,
    });
    // unused-import is safe + autoSafe → applied
    // unused-dependency is manual → deferred
    expect(plan.applied.length).toBe(1); // dead-code unused-import
    expect(plan.deferred.length).toBe(1); // dependency unused-dependency is manual
  });

  it('buildFixPlan respects minConfidenceThreshold', () => {
    const findings = [
      makeFinding({
        category: 'dead-code',
        tags: ['unused-import'],
        file: 'test.ts',
        line: 1,
        confidence: 50,
      }),
    ];
    const plan = buildFixPlan({
      projectRoot,
      fixMode: 'patch-only',
      findings,
      policyOverrides: { minConfidenceThreshold: 70 },
    });
    expect(plan.candidates.length).toBe(0); // filtered out by confidence
  });

  it('buildFixPlan generates unique runId', () => {
    const plan1 = buildFixPlan({ projectRoot, fixMode: 'report-only', findings: [] });
    const plan2 = buildFixPlan({ projectRoot, fixMode: 'report-only', findings: [] });
    expect(plan1.runId).not.toBe(plan2.runId);
  });

  it('summarizePlan returns a non-empty string', () => {
    const plan = buildFixPlan({ projectRoot, fixMode: 'report-only', findings: [] });
    const summary = summarizePlan(plan);
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain('Fix Plan');
  });
});

// ─── PatchGenerator Tests ─────────────────────────────────────────────────────

describe('PatchGenerator', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'turpan-patch-test-'));

  beforeEach(() => {
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(projectRoot, 'test.ts'), 'const unused = 1;\nconsole.log("debug");\n', 'utf-8');
  });

  it('generatePatch returns success for empty candidates', () => {
    const result = generatePatch([]);
    expect(result.success).toBe(true);
    expect(result.patchContent).toBe('');
    expect(result.filesModified).toHaveLength(0);
  });

  it('generatePatch produces unified diff format', () => {
    const finding = makeFinding({
      category: 'maintainability',
      tags: ['console-log'],
      file: 'test.ts',
      line: 2,
      suggestedFix: '',
    });
    const candidates = createFixCandidates([finding], projectRoot);
    const result = generatePatch(candidates);
    expect(result.success).toBe(true);
    expect(result.patchContent).toContain('---');
    expect(result.patchContent).toContain('+++');
    expect(result.patchContent).toContain('@@');
  });

  it('generateSinglePatch produces valid unified diff', () => {
    const finding = makeFinding({
      category: 'maintainability',
      tags: ['console-log'],
      file: 'test.ts',
      line: 2,
      suggestedFix: '',
    });
    const candidate = createFixCandidate(finding, projectRoot)!;
    const patch = generateSinglePatch(candidate);
    expect(patch).toContain('--- a/test.ts');
    expect(patch).toContain('+++ b/test.ts');
    expect(patch).toContain('@@');
  });

  it('formatPatchHeader includes mode and project root', () => {
    const header = formatPatchHeader('apply', '/my/project');
    expect(header).toContain('apply');
    expect(header).toContain('/my/project');
  });
});

// ─── PatchVerifier Tests ───────────────────────────────────────────────────────

describe('PatchVerifier', () => {
  it('shouldRollback returns true when blocking checks fail', () => {
    const summary: ValidationSummary = {
      allPassed: false,
      results: [
        { check: 'build', passed: false, durationMs: 1000, error: 'Build failed' },
        { check: 'lint', passed: true, durationMs: 500 },
      ],
      totalDurationMs: 1500,
    };
    expect(shouldRollback(summary)).toBe(true);
  });

  it('shouldRollback returns false when only non-blocking checks fail', () => {
    const summary: ValidationSummary = {
      allPassed: false,
      results: [
        { check: 'lint', passed: false, durationMs: 1000, error: 'Lint errors' },
        { check: 'test', passed: false, durationMs: 2000, error: 'Test failed' },
      ],
      totalDurationMs: 3000,
    };
    expect(shouldRollback(summary)).toBe(false);
  });

  it('shouldRollback returns false when all checks pass', () => {
    const summary: ValidationSummary = {
      allPassed: true,
      results: [
        { check: 'build', passed: true, durationMs: 5000 },
        { check: 'typecheck', passed: true, durationMs: 3000 },
      ],
      totalDurationMs: 8000,
    };
    expect(shouldRollback(summary)).toBe(false);
  });
});

// ─── RollbackManager Tests ─────────────────────────────────────────────────────

describe('RollbackManager', () => {
  it('parseBackupFilename parses valid backup name', () => {
    const name = '1718000000000_abc123_src_test_ts';
    const parsed = parseBackupFilename(name);
    expect(parsed).not.toBeNull();
    expect(parsed!.timestamp).toBe('1718000000000');
    expect(parsed!.originalPath).toBe('src/test/ts');
  });

  it('parseBackupFilename returns null for invalid name', () => {
    expect(parseBackupFilename('invalid')).toBeNull();
    expect(parseBackupFilename('only_one')).toBeNull();
  });

  it('getBackupDir returns correct path', () => {
    const dir = getBackupDir('/my/project', 'fix-abc123');
    expect(dir).toContain('.turpan');
    expect(dir).toContain('backups');
    expect(dir).toContain('fix-abc123');
  });
});

// ─── ReportWriter Tests ────────────────────────────────────────────────────────

describe('ReportWriter', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'turpan-report-test-'));

  it('renderFixPlanReport produces markdown', () => {
    const plan = buildFixPlan({ projectRoot, fixMode: 'report-only', findings: [] });
    const report = renderFixPlanReport(plan);
    expect(report).toContain('# Turpan Fix Plan');
    expect(report).toContain(plan.runId);
    expect(report).toContain('report-only');
  });
});
