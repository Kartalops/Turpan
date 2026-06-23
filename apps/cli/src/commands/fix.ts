/**
 * fix.ts — CLI fix command and interactive fix handlers.
 *
 * Fix workflow:
 *  1. Load findings from prior review run OR run a fresh review
 *  2. Build FixPlan (select candidates, apply policy)
 *  3. Generate patch
 *  4. Validate (build, typecheck, lint, test)
 *  5. Apply (if mode allows)
 *  6. Rollback if validation fails
 *  7. Write reports
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { join, resolve } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { getGitInfo } from '@turpan/shared';
import {
  buildFixPlan,
  buildFixRunResult,
  applyFixCandidates,
  verifyPatch,
  shouldRollback,
  rollback,
  saveRollbackRecord,
  getCurrentCommitHash,
  summarizePlan,
  renderFixPlanReport,
  writeFixReport,
  type FixMode,
  type FixPlan,
  type FixRunResult,
  type InteractiveResult,
} from '@turpan/fix-engine';
import type { Finding } from '@turpan/core';

export interface FixCLIOptions {
  projectRoot: string;
  fixMode: FixMode;
  /** Path to prior findings JSON (optional) */
  findingsPath?: string;
  /** Run a new review first and use its findings */
  runReviewFirst?: boolean;
  /** Review options if runReviewFirst is true */
  reviewOptions?: {
    deep?: boolean;
    timeoutMs?: number;
  };
  /** Skip validation checks */
  skipValidation?: boolean;
}

interface ReviewResult {
  findings: Finding[];
  runPath: string;
}

// ─── Load Findings ─────────────────────────────────────────────────────────────

async function loadFindings(
  projectRoot: string,
  findingsPath?: string
): Promise<Finding[]> {
  if (findingsPath && existsSync(findingsPath)) {
    try {
      const raw = readFileSync(findingsPath, 'utf-8');
      const parsed = JSON.parse(raw);
      // Handle both array directly and { findings: [] } wrapper
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed.findings)) return parsed.findings;
      return [];
    } catch {
      return [];
    }
  }

  // Try to load from the latest review run
  const latestFindings = join(projectRoot, '.turpan', 'runs', 'latest', 'TURPAN_FINDINGS.json');
  if (existsSync(latestFindings)) {
    try {
      const raw = readFileSync(latestFindings, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed.findings)) return parsed.findings;
    } catch {
      // fall through
    }
  }

  return [];
}

// ─── Interactive Confirmation ─────────────────────────────────────────────────

async function confirmCandidate(candidate: FixPlan['applied'][0]): Promise<InteractiveResult> {
  const fileName = candidate.filePath.split('/').pop() ?? candidate.filePath;
  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: 'list',
      name: 'action',
      message: chalk.cyan(`Apply fix: ${candidate.description} (${fileName}:${candidate.startLine})?`),
      choices: [
        { name: '✅ Apply this fix', value: 'apply' },
        { name: '⏭  Skip this fix', value: 'skip' },
        { name: '🛑 Abort all remaining fixes', value: 'abort' },
      ],
      default: 'apply',
    },
  ]);

  return {
    action: action as 'apply' | 'skip' | 'abort',
    candidateId: candidate.id,
  };
}

// ─── Main Fix Runner ──────────────────────────────────────────────────────────

export async function runFixEngine(opts: FixCLIOptions): Promise<FixRunResult> {
  const { projectRoot, fixMode, findingsPath, skipValidation } = opts;

  console.log(chalk.bold('\n🔧 Turpan Safe Fix Engine\n'));
  console.log(chalk.dim(`Project: ${projectRoot}`));
  console.log(chalk.dim(`Mode:    ${fixMode}\n`));

  // ── Check git state ───────────────────────────────────────────────────────
  const gitInfo = getGitInfo(projectRoot);
  const gitDirty = gitInfo?.isDirty ?? false;

  if (gitDirty) {
    console.log(chalk.yellow('⚠️  Git working tree is dirty — uncommitted changes exist.'));
    if (fixMode === 'apply' || fixMode === 'auto-safe') {
      console.log(chalk.yellow('   Patches may conflict. Prefer --patch-only or --interactive.\n'));
    }
  }

  if (gitInfo) {
    console.log(chalk.dim(`   Branch: ${gitInfo.branch} | Commit: ${gitInfo.commitHash}`));
  }

  // ── Load findings ─────────────────────────────────────────────────────────
  console.log(chalk.cyan('📋 Loading findings…'));
  let findings: Finding[] = [];
  let runPath = join(projectRoot, '.turpan', 'runs', 'fix-' + Date.now().toString(36));

  if (opts.runReviewFirst) {
    console.log(chalk.cyan('🔍 Running review to collect findings…\n'));
    // Lazy-import to avoid circular deps
    const { runAnalysis } = await import('@turpan/core').then(m => ({ runAnalysis: m.runAnalysis }));
    try {
      runPath = await runAnalysis({
        projectPath: projectRoot,
        deepAnalysis: opts.reviewOptions?.deep ?? true,
        timeoutMs: opts.reviewOptions?.timeoutMs ?? 120_000,
        skipBuild: false,
        skipTests: false,
        skipLint: false,
        skipTypecheck: false,
      });
      // Load findings from run
      const fp = join(runPath, 'TURPAN_FINDINGS.json');
      findings = await loadFindings(projectRoot, fp);
    } catch (err) {
      console.warn(chalk.yellow(`⚠️  Review failed, continuing with existing findings: ${err}`));
      findings = await loadFindings(projectRoot, undefined);
    }
  } else {
    findings = await loadFindings(projectRoot, findingsPath);
  }

  if (findings.length === 0) {
    console.log(chalk.yellow('\n⚠️  No findings found. Run `turpan review .` first or use --review flag.\n'));
    throw new Error('No findings to fix');
  }

  console.log(chalk.dim(`   Found ${findings.length} findings\n`));

  // ── Build FixPlan ─────────────────────────────────────────────────────────
  console.log(chalk.cyan('📝 Building fix plan…'));
  const plan = buildFixPlan({
    projectRoot,
    fixMode,
    findings,
  });

  if (plan.candidates.length === 0) {
    console.log(chalk.yellow('\n⚠️  No fixable candidates found.\n'));
    throw new Error('No fixable candidates');
  }

  console.log(chalk.dim(summarizePlan(plan)));
  console.log();

  // ── Interactive confirmation ─────────────────────────────────────────────
  const confirmedCandidates = [...plan.applied];

  if (fixMode === 'interactive') {
    console.log(chalk.bold('Interactive mode — confirm each fix:\n'));
    for (const candidate of plan.deferred) {
      const result = await confirmCandidate(candidate);
      if (result.action === 'abort') {
        console.log(chalk.yellow('\n⛔ Fix session aborted.\n'));
        break;
      }
      if (result.action === 'apply') {
        confirmedCandidates.push(candidate);
      }
      // skip → don't add
    }
  }

  // ── Generate patch ───────────────────────────────────────────────────────
  if (confirmedCandidates.length === 0) {
    console.log(chalk.yellow('\n⚠️  No fixes to apply.\n'));
    // Still write the plan for review
    const { generatePatch } = await import('@turpan/fix-engine');
    const patch = await import('@turpan/fix-engine').then(m => m.generatePatch);
    const patchResult = patch(confirmedCandidates);
    const validation = { allPassed: true, results: [], totalDurationMs: 0 };
    const result = buildFixRunResult(plan, patchResult, validation, {
      gitDirty: false,
      workedInWorktree: false,
    });
    const reportPaths = writeFixReport(plan, result, patchResult.patchContent, projectRoot);
    console.log(chalk.dim(`Fix plan: ${reportPaths.fixPlanPath}\n`));
    return result;
  }

  console.log(chalk.cyan(`🔧 Applying ${confirmedCandidates.length} fix(es)…\n`));

  // ── Apply fixes ──────────────────────────────────────────────────────────
  const dryRun = fixMode === 'patch-only' || fixMode === 'report-only';
  const useWorktree = !dryRun && (fixMode === 'apply' || fixMode === 'auto-safe');

  const { applyFixCandidates: applyFn } = await import('@turpan/fix-engine');
  const applyResult = await applyFn(confirmedCandidates, {
    projectRoot,
    runId: plan.runId,
    useWorktree,
    dryRun,
    backup: true,
  });

  if (!applyResult.success) {
    console.error(chalk.red(`\n❌ Failed to apply fixes: ${applyResult.error}\n`));
    throw new Error(applyResult.error);
  }

  if (dryRun) {
    console.log(chalk.green('✅ Patch generated (dry run — no files modified)\n'));
  } else {
    console.log(chalk.green(`✅ Applied ${applyResult.modified.length} file change(s)\n`));
  }

  // ── Validate ──────────────────────────────────────────────────────────────
  let validation = { allPassed: true, results: [], totalDurationMs: 0 };

  if (!skipValidation && !dryRun) {
    console.log(chalk.cyan('🔬 Validating (build, typecheck, lint, test)…\n'));
    const { verifyPatch } = await import('@turpan/fix-engine');
    const { aggregateRequiredChecks } = await import('@turpan/fix-engine');
    const checks = aggregateRequiredChecks(confirmedCandidates);
    validation = await verifyPatch(confirmedCandidates, {
      projectRoot,
      checks,
      timeoutMs: 120_000,
    });

    const passedColor = validation.allPassed ? chalk.green : chalk.red;
    const statusIcon = validation.allPassed ? '✅' : '❌';
    console.log(passedColor(`\n${statusIcon} Validation: ${validation.allPassed ? 'PASSED' : 'FAILED'}`));
    console.log(chalk.dim(`   Completed in ${Math.round(validation.totalDurationMs / 1000)}s\n`));

    for (const r of validation.results) {
      const icon = r.passed ? chalk.green('✓') : chalk.red('✗');
      const checkLabel = r.check.padEnd(12);
      console.log(`   ${icon} ${checkLabel} ${chalk.dim(`${Math.round(r.durationMs / 1000)}s`)}`);
      if (r.error) console.log(chalk.dim(`      ${r.error.slice(0, 80)}`));
    }
    console.log();

    // ── Rollback on failure ─────────────────────────────────────────────────
    if (shouldRollback(validation)) {
      console.error(chalk.red('\n🚨 Validation failed — rolling back changes!\n'));
      const { rollback: rollbackFn } = await import('@turpan/fix-engine');
      const rollbackOutcome = await rollbackFn({
        projectRoot,
        runId: plan.runId,
        reason: `Validation failed: ${validation.results.find(r => !r.passed)?.check}`,
        worktreePath: applyResult.worktreePath,
        appliedFingerprint: getCurrentCommitHash(projectRoot),
      });
      console.error(chalk.red(`\n⚠️  Rollback: ${rollbackOutcome.success ? 'SUCCESS' : 'PARTIAL/FAILED'}\n`));
      if (rollbackOutcome.failedFiles.length > 0) {
        console.error(chalk.red(`   Failed to restore: ${rollbackOutcome.failedFiles.join(', ')}\n`));
      }
      const rollbackRecordPath = saveRollbackRecord(rollbackOutcome.record, projectRoot);
      console.error(chalk.dim(`   Rollback record: ${rollbackRecordPath}\n`));
    }
  }

  // ── Write reports ────────────────────────────────────────────────────────
  const { generatePatch } = await import('@turpan/fix-engine');
  const patchResult = generatePatch(confirmedCandidates);
  const result = buildFixRunResult(plan, patchResult, validation, {
    gitDirty,
    workedInWorktree: !!applyResult.worktreePath,
  });

  const reportPaths = writeFixReport(plan, result, patchResult.patchContent, projectRoot);

  console.log(chalk.bold('\n📄 Reports written:\n'));
  console.log(`   ${chalk.cyan(reportPaths.fixPlanPath)}`);
  console.log(`   ${chalk.cyan(reportPaths.patchDiffPath)}`);
  console.log(`   ${chalk.cyan(reportPaths.resultJsonPath)}\n`);

  return result;
}

// ─── Mode Resolution ──────────────────────────────────────────────────────────

export type CLIFixMode = 'patch-only' | 'apply' | 'interactive' | 'auto-safe';

export function resolveFixMode(options: {
  patchOnly?: boolean;
  apply?: boolean;
  interactive?: boolean;
  autoSafe?: boolean;
  fix?: boolean;
}): FixMode {
  const modes: FixMode[] = [];
  if (options.patchOnly) modes.push('patch-only');
  if (options.apply) modes.push('apply');
  if (options.interactive) modes.push('interactive');
  if (options.autoSafe) modes.push('auto-safe');

  if (modes.length > 1) {
    throw new Error(`Conflicting fix modes specified: ${modes.join(', ')}`);
  }

  if (modes.length === 1) return modes[0];
  if (options.fix) return 'patch-only'; // --fix alone = patch-only for safety

  return 'report-only';
}
