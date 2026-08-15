import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import type { Finding } from '@turpan/core';
import {
  adversarialPatchReview,
  assessRegressionTest,
  buildPatchEvidenceReport,
  checkPatchBudget,
  chooseSmallestProvenPatch,
  classifyFixEligibility,
  runPatchExperiment,
  selectImpactedTests,
  summarizeUnifiedDiff,
  type ExperimentCommandResult,
  type ExperimentRunner,
  type PatchCandidate,
  type PatchExperiment,
  type WorktreeManager,
} from '../src/index.js';

describe('evidence-driven self-healing foundation', () => {
  it('classifies findings by autofix eligibility', () => {
    expect(classifyFixEligibility(finding({
      title: 'Missing await drops errors',
      fixable: 'auto',
    }))).toBe('AUTO_FIXABLE');

    expect(classifyFixEligibility(finding({
      title: 'Authorization policy is ambiguous',
      explanation: 'Requires business decision on permission model.',
      fixable: 'manual',
    }))).toBe('HUMAN_REQUIRED');

    expect(classifyFixEligibility(finding({
      title: 'Cosmetic issue',
      confidence: 20,
      evidence: [],
    }))).toBe('NOT_FIXABLE');
  });

  it('enforces minimal patch budgets', () => {
    const candidate = patchCandidate({
      changeSummary: {
        filesChanged: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
        linesAdded: 20,
        linesRemoved: 20,
        dependencyChanges: 1,
      },
    });

    const result = checkPatchBudget(candidate, {
      maxFilesChanged: 3,
      maxLinesChanged: 30,
      maxDependencyChanges: 0,
    });

    expect(result.ok).toBe(false);
    expect(result.reasons).toHaveLength(3);
  });

  it('summarizes unified diff size and dependency changes', () => {
    const summary = summarizeUnifiedDiff([
      'diff --git a/package.json b/package.json',
      '--- a/package.json',
      '+++ b/package.json',
      '+  "dependencies": {}',
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '-old',
      '+new',
    ].join('\n'));

    expect(summary.filesChanged).toEqual(['package.json', 'src/a.ts']);
    expect(summary.linesAdded).toBe(2);
    expect(summary.linesRemoved).toBe(1);
    expect(summary.dependencyChanges).toBeGreaterThan(0);
  });

  it('rejects meaningless regression tests', () => {
    expect(assessRegressionTest('+it.skip("works", () => expect(true).toBe(true));').meaningful).toBe(false);
    expect(assessRegressionTest('+it("persists settings", () => { expect(save()).toEqual({ ok: true }); });').meaningful).toBe(true);
  });

  it('selects impacted tests from changed files and reproduction checks', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'turpan-tests-'));
    try {
      mkdirSync(join(tmp, 'packages', 'core', 'src'), { recursive: true });
      writeFileSync(join(tmp, 'packages', 'core', 'tsconfig.json'), '{}');
      writeFileSync(join(tmp, 'packages', 'core', 'src', 'save.ts'), 'export const save = () => true;');
      writeFileSync(join(tmp, 'packages', 'core', 'src', 'save.test.ts'), 'test("save", () => {});');

      const tests = selectImpactedTests(tmp, patchCandidate({
        changeSummary: {
          filesChanged: ['packages/core/src/save.ts'],
          linesAdded: 1,
          linesRemoved: 1,
          dependencyChanges: 0,
        },
      }), [{ id: 'noop-save', command: 'vitest run repro.test.ts', expectedBefore: 'fail', expectedAfter: 'pass' }]);

      expect(tests.some((test) => test.ladderStep === 'typecheck')).toBe(true);
      expect(tests.some((test) => test.ladderStep === 'targeted-unit')).toBe(true);
      expect(tests.some((test) => test.ladderStep === 'reproduction')).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('adversarial patch reviewer flags dependency and error swallowing risks', () => {
    const review = adversarialPatchReview(patchCandidate({
      unifiedDiff: [
        'diff --git a/package.json b/package.json',
        '+++ b/package.json',
        '+  "dependencies": {"left-pad": "1.0.0"}',
        '+try { run(); } catch (err) {}',
      ].join('\n'),
      changeSummary: {
        filesChanged: ['package.json'],
        linesAdded: 2,
        linesRemoved: 0,
        dependencyChanges: 1,
      },
    }));

    expect(review.approved).toBe(false);
    expect(review.concerns.some((concern) => concern.category === 'dependency')).toBe(true);
    expect(review.concerns.some((concern) => concern.category === 'error-handling')).toBe(true);
  });

  it('runs patch experiments in an isolated worktree and requires reproduction flip', async () => {
    const runner = new ScriptedRunner([
      { exitCode: 1, stdout: 'before fails', stderr: '', durationMs: 1 },
      { exitCode: 0, stdout: 'applied', stderr: '', durationMs: 1 },
      { exitCode: 0, stdout: 'after passes', stderr: '', durationMs: 1 },
      { exitCode: 0, stdout: 'typecheck passes', stderr: '', durationMs: 1 },
    ]);
    const worktrees = new MemoryWorktrees();

    const experiment = await runPatchExperiment({
      projectRoot: '/project',
      finding: finding({ id: 'fnd-save', title: 'Save button is no-op' }),
      candidate: patchCandidate({
        id: 'candidate-a',
        regressionTestDiff: '+it("persists settings", () => { expect(save()).toBe(true); });',
      }),
      reproductions: [{ id: 'save-noop', command: 'npm test -- save.repro', expectedBefore: 'fail', expectedAfter: 'pass' }],
      runner,
      worktrees,
    });

    expect(experiment.accepted).toBe(true);
    expect(experiment.reproductionFlips[0].flipped).toBe(true);
    expect(worktrees.destroyed[0]).toContain('worktree-patch-fnd-save-candidate-a');
    expect(experiment.commandHistory.every((call) => call.redacted)).toBe(true);
  });

  it('chooses the smallest proven patch rather than model preference', () => {
    const large = experiment({ score: 80, linesAdded: 30, files: ['a.ts', 'b.ts'] });
    const small = experiment({ score: 80, linesAdded: 3, files: ['a.ts'] });

    expect(chooseSmallestProvenPatch([large, small])?.id).toBe(small.id);
  });

  it('builds accepted patch evidence reports with read-only apply default', () => {
    const exp = experiment({ score: 85, files: ['src/save.ts'], linesAdded: 2 });
    const report = buildPatchEvidenceReport(exp, {
      rootCause: 'Button handler was not wired to persistence.',
      whyThisPatch: 'It wires the existing handler without changing public behavior.',
    });

    expect(report.applyMode).toBe('never');
    expect(report.problem).toBe(exp.finding.title);
    expect(report.filesChanged).toEqual(['src/save.ts']);
    expect(report.confidence).toBeGreaterThan(0);
  });
});

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'fnd-1',
    title: 'Runtime bug',
    severity: 'high',
    category: 'runtime',
    explanation: 'The bug was reproduced dynamically.',
    evidence: [{ type: 'command-log', label: 'repro', excerpt: 'before failed' }],
    confidence: 85,
    fixable: 'auto',
    tags: [],
    ...overrides,
  };
}

function patchCandidate(overrides: Partial<PatchCandidate> = {}): PatchCandidate {
  return {
    id: 'candidate-1',
    findingId: 'fnd-1',
    description: 'Minimal patch',
    unifiedDiff: [
      'diff --git a/src/save.ts b/src/save.ts',
      '--- a/src/save.ts',
      '+++ b/src/save.ts',
      '-export const save = () => false;',
      '+export const save = () => true;',
    ].join('\n'),
    changeSummary: {
      filesChanged: ['src/save.ts'],
      linesAdded: 1,
      linesRemoved: 1,
      dependencyChanges: 0,
    },
    ...overrides,
  };
}

function experiment(options: { score: number; linesAdded: number; files: string[] }): PatchExperiment {
  return {
    id: `exp-${options.files.length}-${options.linesAdded}`,
    finding: finding(),
    eligibility: 'AUTO_FIXABLE',
    candidate: patchCandidate({
      changeSummary: {
        filesChanged: options.files,
        linesAdded: options.linesAdded,
        linesRemoved: 0,
        dependencyChanges: 0,
      },
    }),
    worktreePath: '/tmp/worktree',
    testsSelected: [],
    validation: [{ check: 'test', passed: true, durationMs: 1 }],
    reproductionFlips: [{
      checkId: 'repro',
      before: { check: 'test', passed: false, durationMs: 1 },
      after: { check: 'test', passed: true, durationMs: 1 },
      flipped: true,
    }],
    review: { reviewer: 'test-reviewer', approved: true, concerns: [] },
    accepted: true,
    score: options.score,
    artifacts: [],
    commandHistory: [],
  };
}

class ScriptedRunner implements ExperimentRunner {
  constructor(private readonly results: ExperimentCommandResult[]) {}

  async run(): Promise<ExperimentCommandResult> {
    const result = this.results.shift();
    if (!result) return { exitCode: 0, stdout: '', stderr: '', durationMs: 1 };
    return result;
  }
}

class MemoryWorktrees implements WorktreeManager {
  destroyed: string[] = [];

  async create(experimentId: string): Promise<string> {
    return mkdtempSync(join(tmpdir(), `worktree-${experimentId}-`));
  }

  async destroy(worktreePath: string): Promise<void> {
    this.destroyed.push(worktreePath);
    rmSync(worktreePath, { recursive: true, force: true });
  }
}
