/**
 * Tests for GitDiffEngine — pure function tests (no real git repo required)
 */

import { describe, it, expect } from 'vitest';
import { isPathAffectedByDiff, computeDiffRecommendation } from './GitDiffEngine.js';
import type { GitDiffResult } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<GitDiffResult> = {}): GitDiffResult {
  return {
    baseRef: 'main',
    targetRef: 'feature',
    files: [],
    hunks: [],
    stats: { totalFiles: 0, filesAdded: 0, filesModified: 0, filesDeleted: 0, filesRenamed: 0, totalLinesAdded: 0, totalLinesDeleted: 0, totalAdditions: 0, totalDeletions: 0 },
    ownership: [],
    changedRoutes: [],
    changedApis: [],
    changedComponents: [],
    riskLevel: { level: 'low', reasons: [], files: [] },
    hasWorkingTreeChanges: false,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('isPathAffectedByDiff', () => {
  it('should return true for exact path match', () => {
    const diff = makeResult({ files: [{ path: 'src/app/page.tsx', changeType: 'modified', linesAdded: 10, linesDeleted: 2, binary: false }] });
    expect(isPathAffectedByDiff(diff, 'src/app/page.tsx')).toBe(true);
  });

  it('should return false for unrelated path', () => {
    const diff = makeResult({ files: [{ path: 'src/app/page.tsx', changeType: 'modified', linesAdded: 10, linesDeleted: 2, binary: false }] });
    expect(isPathAffectedByDiff(diff, 'src/utils/helper.ts')).toBe(false);
  });

  it('should match renamed old path', () => {
    const diff = makeResult({ files: [{ path: 'src/new.ts', changeType: 'renamed', linesAdded: 0, linesDeleted: 0, binary: false, oldPath: 'src/old.ts' }] });
    expect(isPathAffectedByDiff(diff, 'src/old.ts')).toBe(true);
  });
});

describe('computeDiffRecommendation', () => {
  it('should approve clean diff', () => {
    const result = computeDiffRecommendation(makeResult({
      files: [
        { path: 'src/utils/helper.ts', changeType: 'added', linesAdded: 12, linesDeleted: 0, binary: false },
        { path: 'src/app/page.tsx', changeType: 'modified', linesAdded: 45, linesDeleted: 3, binary: false },
      ],
      stats: { totalFiles: 2, filesAdded: 1, filesModified: 1, filesDeleted: 0, filesRenamed: 0, totalLinesAdded: 57, totalLinesDeleted: 3, totalAdditions: 57, totalDeletions: 3 },
      ownership: [
        { file: 'src/utils/helper.ts', ownership: 'shared', confidence: 75 },
        { file: 'src/app/page.tsx', ownership: 'frontend', confidence: 85 },
      ],
    }));
    expect(result.decision).toBe('approve');
    expect(result.confidence).toBe('high');
  });

  it('should block merge for critical security risk', () => {
    const result = computeDiffRecommendation(makeResult({
      files: [{ path: 'src/middleware/auth.ts', changeType: 'modified', linesAdded: 3, linesDeleted: 1, binary: false }],
      riskLevel: { level: 'critical', reasons: ['Critical security pattern detected: auth bypass'], files: ['src/middleware/auth.ts'] },
    }));
    expect(result.decision).toBe('block_merge');
    expect(result.findings.some(f => f.severity === 'critical')).toBe(true);
  });

  it('should flag feature changes without tests', () => {
    const result = computeDiffRecommendation(makeResult({
      files: [
        { path: 'src/lib/billing.ts', changeType: 'added', linesAdded: 5, linesDeleted: 0, binary: false },
        { path: 'src/app/billing/page.tsx', changeType: 'added', linesAdded: 8, linesDeleted: 0, binary: false },
        { path: 'src/lib/payment.ts', changeType: 'added', linesAdded: 10, linesDeleted: 0, binary: false },
        { path: 'src/app/payment/page.tsx', changeType: 'added', linesAdded: 12, linesDeleted: 0, binary: false },
      ],
      stats: { totalFiles: 4, filesAdded: 4, filesModified: 0, filesDeleted: 0, filesRenamed: 0, totalLinesAdded: 35, totalLinesDeleted: 0, totalAdditions: 35, totalDeletions: 0 },
      ownership: [
        { file: 'src/lib/billing.ts', ownership: 'backend', confidence: 80 },
        { file: 'src/app/billing/page.tsx', ownership: 'frontend', confidence: 85 },
        { file: 'src/lib/payment.ts', ownership: 'backend', confidence: 80 },
        { file: 'src/app/payment/page.tsx', ownership: 'frontend', confidence: 85 },
      ],
    }));
    expect(result.findings.some(f => f.category === 'testing')).toBe(true);
  });

  it('should flag deleted test files as high severity', () => {
    const result = computeDiffRecommendation(makeResult({
      files: [{ path: 'src/utils/__tests__/helper.test.ts', changeType: 'deleted', linesAdded: 0, linesDeleted: 20, binary: false }],
      stats: { totalFiles: 1, filesAdded: 0, filesModified: 0, filesDeleted: 1, filesRenamed: 0, totalLinesAdded: 0, totalLinesDeleted: 20, totalAdditions: 0, totalDeletions: 20 },
      ownership: [{ file: 'src/utils/__tests__/helper.test.ts', ownership: 'test', confidence: 95 }],
    }));
    expect(result.findings.some(f => f.severity === 'high' && f.title.includes('Test'))).toBe(true);
  });

  it('should flag large diffs (>30 files)', () => {
    const manyFiles = Array.from({ length: 35 }, (_, i) => ({ path: `src/lib/${i}.ts`, changeType: 'modified' as const, linesAdded: 20 + i * 5, linesDeleted: 15 + i * 5, binary: false }));
    const result = computeDiffRecommendation(makeResult({
      files: manyFiles,
      stats: { totalFiles: 35, filesAdded: 0, filesModified: 35, filesDeleted: 0, filesRenamed: 0, totalLinesAdded: 390, totalLinesDeleted: 336, totalAdditions: 390, totalDeletions: 336 },
      ownership: manyFiles.map(f => ({ file: f.path, ownership: 'shared' as const, confidence: 75 })),
    }));
    expect(result.reasons.some(r => r.includes('Large PR'))).toBe(true);
    expect(result.decision).toBe('request_changes'); // Phase 24: large diff + no test coverage → request changes
  });

  it('should report medium confidence for >50 files', () => {
    const manyFiles = Array.from({ length: 60 }, (_, i) => ({ path: `src/lib/${i}.ts`, changeType: 'modified' as const, linesAdded: 10, linesDeleted: 5, binary: false }));
    const result = computeDiffRecommendation(makeResult({ files: manyFiles, stats: { totalFiles: 60, filesAdded: 0, filesModified: 60, filesDeleted: 0, filesRenamed: 0, totalLinesAdded: 600, totalLinesDeleted: 300, totalAdditions: 600, totalDeletions: 300 } }));
    expect(result.confidence).toBe('medium');
  });

  it('should report low confidence when ref error present', () => {
    const result = computeDiffRecommendation(makeResult({ refError: 'Base ref "nonexistent" not found' }));
    expect(result.confidence).toBe('low');
  });

  it('should request changes for medium risk level', () => {
    const result = computeDiffRecommendation(makeResult({
      files: [{ path: 'src/app/page.tsx', changeType: 'modified', linesAdded: 50, linesDeleted: 40, binary: false }],
      stats: { totalFiles: 1, filesAdded: 0, filesModified: 1, filesDeleted: 0, filesRenamed: 0, totalLinesAdded: 50, totalLinesDeleted: 40, totalAdditions: 50, totalDeletions: 40 },
      riskLevel: { level: 'medium', reasons: ['Large diff in a single file'], files: ['src/app/page.tsx'] },
    }));
    expect(result.decision).toBe('request_changes');
  });
});