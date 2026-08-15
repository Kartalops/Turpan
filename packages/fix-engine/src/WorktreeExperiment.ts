import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Finding } from '@turpan/core';
import type { ValidationResult } from './types.js';
import type {
  PatchCandidate,
  PatchExperiment,
  ReproductionCheck,
  ReproductionFlip,
  SelectedTest,
  SelfHealingPolicy,
  ToolCall,
} from './autofixTypes.js';
import { DEFAULT_SELF_HEALING_POLICY } from './autofixTypes.js';
import { checkPatchBudget } from './PatchBudget.js';
import { assessRegressionTest } from './RegressionTestGuard.js';
import { selectImpactedTests } from './TestSelector.js';
import { adversarialPatchReview } from './PatchReviewer.js';
import { scorePatchExperiment } from './PatchScorer.js';

export interface ExperimentCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut?: boolean;
}

export interface ExperimentRunner {
  run(command: string, cwd: string, timeoutMs?: number): Promise<ExperimentCommandResult>;
}

export interface WorktreeManager {
  create(experimentId: string): Promise<string>;
  destroy(worktreePath: string): Promise<void>;
}

export interface PatchExperimentOptions {
  projectRoot: string;
  finding: Finding;
  candidate: PatchCandidate;
  reproductions?: ReproductionCheck[];
  policy?: Partial<SelfHealingPolicy>;
  runner: ExperimentRunner;
  worktrees?: WorktreeManager;
}

export class GitWorktreeManager implements WorktreeManager {
  constructor(private readonly projectRoot: string) {}

  async create(experimentId: string): Promise<string> {
    const worktreePath = mkdtempSync(join(tmpdir(), `turpan-${experimentId}-`));
    execFileSync('git', ['worktree', 'add', '--detach', worktreePath, 'HEAD'], {
      cwd: this.projectRoot,
      stdio: 'pipe',
    });
    return worktreePath;
  }

  async destroy(worktreePath: string): Promise<void> {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', worktreePath], {
        cwd: this.projectRoot,
        stdio: 'pipe',
      });
    } finally {
      rmSync(worktreePath, { recursive: true, force: true });
    }
  }
}

export async function runPatchExperiment(options: PatchExperimentOptions): Promise<PatchExperiment> {
  const policy: SelfHealingPolicy = {
    ...DEFAULT_SELF_HEALING_POLICY,
    ...options.policy,
    patchBudget: {
      ...DEFAULT_SELF_HEALING_POLICY.patchBudget,
      ...options.policy?.patchBudget,
    },
  };
  const experimentId = `patch-${options.finding.id}-${options.candidate.id}`;
  const worktrees = options.worktrees ?? new GitWorktreeManager(options.projectRoot);
  const worktreePath = await worktrees.create(experimentId);
  const validation: ValidationResult[] = [];
  const commandHistory: ToolCall[] = [];
  let testsSelected: SelectedTest[] = [];
  let reproductionFlips: ReproductionFlip[] = [];

  try {
    const budget = checkPatchBudget(options.candidate, policy.patchBudget);
    const regression = assessRegressionTest(options.candidate.regressionTestDiff);
    const review = adversarialPatchReview(options.candidate);
    const beforeReproduction = await runReproductions(
      options.runner,
      commandHistory,
      worktreePath,
      options.reproductions ?? [],
      'before',
    );

    if (!budget.ok) {
      validation.push(failedValidation('patch-budget', budget.reasons.join('; ')));
    }
    if (policy.requireRegressionTest && !regression.meaningful) {
      validation.push(failedValidation('regression-test', regression.reasons.join('; ')));
    }

    const patchPath = join(worktreePath, '.turpan-patch.diff');
    writeFileSync(
      patchPath,
      [options.candidate.unifiedDiff, options.candidate.regressionTestDiff ?? ''].filter(Boolean).join('\n'),
    );
    const applyResult = await runAndRecord(options.runner, commandHistory, 'git apply --index .turpan-patch.diff', worktreePath);
    validation.push(toValidation('apply-patch', applyResult));

    testsSelected = selectImpactedTests(worktreePath, options.candidate, options.reproductions ?? []);
    const afterReproduction = await runReproductions(
      options.runner,
      commandHistory,
      worktreePath,
      options.reproductions ?? [],
      'after',
    );
    reproductionFlips = buildReproductionFlips(beforeReproduction, afterReproduction);

    for (const test of testsSelected.filter((test) => test.ladderStep !== 'reproduction')) {
      const result = await runAndRecord(options.runner, commandHistory, test.command, worktreePath);
      validation.push(toValidation(test.id, result));
      if (!result.exitCode && test.ladderStep === 'typecheck') continue;
      if (result.exitCode !== 0 && (test.ladderStep === 'syntax' || test.ladderStep === 'typecheck')) break;
    }

    if (policy.requireReproductionFlip && options.reproductions?.length && reproductionFlips.some((flip) => !flip.flipped)) {
      validation.push(failedValidation('reproduction-flip', 'at least one dynamic reproduction did not flip from failing to passing'));
    }

    const accepted =
      validation.every((result) => result.passed) &&
      review.approved &&
      (!policy.requireReproductionFlip || !options.reproductions?.length || reproductionFlips.every((flip) => flip.flipped));

    const experiment: PatchExperiment = {
      id: experimentId,
      finding: options.finding,
      eligibility: 'AUTO_FIXABLE',
      candidate: options.candidate,
      worktreePath,
      testsSelected,
      validation,
      reproductionFlips,
      review,
      accepted,
      score: 0,
      artifacts: [],
      commandHistory,
    };
    experiment.score = scorePatchExperiment(experiment);
    return experiment;
  } finally {
    await worktrees.destroy(worktreePath);
  }
}

async function runReproductions(
  runner: ExperimentRunner,
  commandHistory: ToolCall[],
  cwd: string,
  checks: ReproductionCheck[],
  phase: 'before' | 'after',
): Promise<Array<{ check: ReproductionCheck; result: ValidationResult }>> {
  const results: Array<{ check: ReproductionCheck; result: ValidationResult }> = [];
  for (const check of checks) {
    const result = await runAndRecord(runner, commandHistory, check.command, cwd);
    results.push({ check, result: toValidation(`${check.id}:${phase}`, result) });
  }
  return results;
}

function buildReproductionFlips(
  before: Array<{ check: ReproductionCheck; result: ValidationResult }>,
  after: Array<{ check: ReproductionCheck; result: ValidationResult }>,
): ReproductionFlip[] {
  return before.map((beforeResult) => {
    const afterResult = after.find((item) => item.check.id === beforeResult.check.id);
    const fallbackAfter = failedValidation(`${beforeResult.check.id}:after`, 'after-patch reproduction did not run');
    return {
      checkId: beforeResult.check.id,
      before: beforeResult.result,
      after: afterResult?.result ?? fallbackAfter,
      flipped: !beforeResult.result.passed && Boolean(afterResult?.result.passed),
    };
  });
}

async function runAndRecord(
  runner: ExperimentRunner,
  history: ToolCall[],
  command: string,
  cwd: string,
): Promise<ExperimentCommandResult> {
  const id = `cmd-${history.length + 1}`;
  history.push({
    id,
    tool: 'shell',
    input: { command, cwd },
    startedAt: new Date().toISOString(),
  });
  const result = await runner.run(command, cwd);
  history[history.length - 1] = {
    ...history[history.length - 1],
    finishedAt: new Date().toISOString(),
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    redacted: true,
  };
  return result;
}

function toValidation(check: string, result: ExperimentCommandResult): ValidationResult {
  return {
    check: check as ValidationResult['check'],
    passed: result.exitCode === 0,
    durationMs: result.durationMs,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n').slice(0, 5000),
  };
}

function failedValidation(check: string, error: string): ValidationResult {
  return {
    check: check as ValidationResult['check'],
    passed: false,
    durationMs: 0,
    error,
  };
}
