#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { join, resolve } from 'path';
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { execSync, spawn } from 'child_process';
import { runAnalysis, planAnalysis, detectProject, loadConfig } from '@turpan/core';
import { runUiTest } from '@turpan/ui-runner';
import { runAgentOutputAudit } from '@turpan/analyzers';
import { createRuntimeTestCommand, createFixCommand, createPluginsCommand, createScenariosCommand, createEvalCommand, createDependencyAuditCommand, createReviewDiffCommand } from './commands/index.js';
import { runFixEngine, resolveFixMode } from './commands/fix.js';
import { countFindingsBySeverity, deriveVerdict, generateReports, loadRunArtifacts } from '@turpan/report';
import type { TurpanAnalysisData, DiffReview } from '@turpan/report';
import { runInteractiveShell as runShell } from './shell/index.js';
import { ensureDir, resolveProjectPath } from '@turpan/shared';

// ============ CONFIG ============

function createDefaultConfig(projectPath: string): void {
  const projectName = projectPath.split('/').pop() || 'unknown-project';
  const configPath = join(projectPath, 'turpan.yml');
  const config = `# Turpan Configuration — https://github.com/turpan/turpan

version: 0.1.0
projectPath: ${projectPath}
runPath: ${join(projectPath, '.turpan', 'runs')}
deepAnalysis: false
uiAnalysis: false
fixMode: false
logLevel: info

project:
  name: ${projectName}

commands:
  install: ""
  build: ""
  test: ""
  lint: ""
  typecheck: ""
  dev: ""

ui:
  enabled: false
  baseUrl: ""
  scenarios: []
  viewports: [desktop, mobile]

fix:
  mode: report-only
  maxFilesChanged: 5
  allowDependencyChanges: false
  allowFileDeletion: false

security:
  redactSecrets: true

plugins: []

ignore:
  paths: []
  globs: []
`;
  writeFileSync(configPath, config, 'utf-8');
}

async function runDoctorCheck() {
  const checks: Array<{ name: string; ok: boolean; message: string }> = [];

  const nodeVersion = process.version;
  const nodeOk = parseInt(nodeVersion.slice(1).split('.')[0]) >= 20;
  checks.push({ name: 'Node.js version', ok: nodeOk, message: nodeOk ? `${nodeVersion} (OK)` : `${nodeVersion} - need v20+` });

  try {
    const pnpmVersion = execSync('pnpm --version', { encoding: 'utf-8' }).trim();
    checks.push({ name: 'pnpm', ok: true, message: `v${pnpmVersion}` });
  } catch {
    checks.push({ name: 'pnpm', ok: false, message: 'not found' });
  }

  const cwd = process.cwd();
  try {
    const testFile = join(cwd, `.turpan-doctor-test-${Date.now()}`);
    writeFileSync(testFile, 'test');
    unlinkSync(testFile);
    checks.push({ name: 'Directory writable', ok: true, message: cwd });
  } catch {
    checks.push({ name: 'Directory writable', ok: false, message: `${cwd} - not writable` });
  }

  return { ok: checks.every(c => c.ok), checks };
}

// ============ EXIT CODE POLICY ============

type FailOnLevel = 'critical' | 'high' | 'never';

function shouldFailOn(failOn: FailOnLevel, critical: number, high: number): boolean {
  if (failOn === 'never') return false;
  if (failOn === 'critical' && critical > 0) return true;
  if (failOn === 'high' && (critical > 0 || high > 0)) return true;
  return false;
}

function exitWithPolicy(failOn: FailOnLevel, critical: number, high: number): never {
  if (shouldFailOn(failOn, critical, high)) {
    console.log(chalk.red(`\n❌ Exit policy: --fail-on ${failOn} triggered by ` +
      `${critical > 0 ? `${critical} critical finding(s)` : `${high} high finding(s)`}\n`));
    process.exit(1);
  }
  process.exit(0);
}

async function delegateMcpCommand(argv: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('turpan-mcp', argv, {
      stdio: 'inherit',
      shell: false,
      env: process.env,
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        reject(new Error('turpan-mcp binary not found. Install or link @turpan/mcp-server to use MCP commands.'));
        return;
      }
      reject(error);
    });
    child.on('exit', (code, signal) => {
      if (signal) reject(new Error(`turpan-mcp exited from signal ${signal}`));
      else if (code && code !== 0) reject(new Error(`turpan-mcp exited with code ${code}`));
      else resolve();
    });
  });
}

// ============ TERMINAL SUMMARY ============

async function printTerminalSummary(
  projectPath: string,
  runPath: string,
  diffReviewData?: DiffReview
): Promise<{ critical: number; high: number; medium: number; verdict: string }> {
  // Load existing run artifacts
  const fingerprintPath = join(runPath, 'project-fingerprint.json');
  const agentAuditSummaryPath = join(runPath, 'agent-audit-summary.json');

  const { findings, scorecard } = loadRunArtifacts(runPath);
  let fingerprint: Record<string, unknown> = {};
  let agentAudit: import('@turpan/report').AgentOutputAudit | undefined;

  if (existsSync(fingerprintPath)) {
    try { fingerprint = JSON.parse(readFileSync(fingerprintPath, 'utf-8')); } catch {}
  }
  if (existsSync(agentAuditSummaryPath)) {
    try { agentAudit = JSON.parse(readFileSync(agentAuditSummaryPath, 'utf-8')); } catch {}
  }

  // Build analysis data and generate full report bundle
  const runId = runPath.split('/').pop() ?? new Date().toISOString();
  const timestamp = new Date().toISOString();
  const reportFindings = findings as unknown as TurpanAnalysisData['findings'];

  const analysisData: TurpanAnalysisData = {
    runId,
    runPath,
    timestamp,
    duration: 0,
    projectPath,
    findings: reportFindings,
    scorecard,
    fingerprint,
    verdict: deriveVerdict(scorecard, reportFindings),
    agentAudit,
    diffReview: diffReviewData,
  };

  // Generate the full report bundle
  let reportPaths: Awaited<ReturnType<typeof generateReports>> | null = null;
  try {
    reportPaths = await generateReports(analysisData);
  } catch (err) {
    // Non-fatal: reports may already exist
    console.log(chalk.dim(`  (report generation: ${err instanceof Error ? err.message : err})\n`));
  }

  // Counts
  const counts = countFindingsBySeverity(reportFindings);
  const critical = counts.critical;
  const high = counts.high;
  const medium = counts.medium;
  const verdict  = analysisData.verdict;

  // Verdict color + label
  const verdictColor = verdict === 'GO' ? chalk.green :
                       verdict === 'CONDITIONAL_GO' ? chalk.yellow : chalk.red;
  const verdictIcon  = verdict === 'GO' ? '✅' :
                       verdict === 'CONDITIONAL_GO' ? '⚠️' :
                       verdict === 'NO_GO' ? '❌' : '🔒';

  console.clear?.();
  console.log(chalk.bold('\n🏛️  Turpan Analysis'));
  console.log(chalk.dim(`  ${runPath}\n`));
  console.log(`  ${verdictIcon} Verdict: ${verdictColor(verdict)}`);
  console.log(`  Overall: ${chalk.cyan(String(scorecard.overall + '/100'))}`);
  if (critical > 0) console.log(`  🔴 ${chalk.red(String(critical))} critical   ${chalk.red(String(high))} high   ${chalk.yellow(String(medium))} medium`);
  else if (high > 0)   console.log(`  🟠 ${chalk.yellow(String(high))} high   ${chalk.yellow(String(medium))} medium`);
  else if (medium > 0)  console.log(`  🟡 ${chalk.yellow(String(medium))} medium`);
  else console.log(`  🟢 ${chalk.green('Clean run — no findings')}`);
  console.log();

  if (reportPaths) {
    console.log(chalk.green('✅ Turpan Analysis generated:'));
    const artifacts = [
      reportPaths.analysisMd   && `  ${chalk.cyan('TURPAN_ANALYSIS.md')}`,
      reportPaths.analysisHtml && `  ${chalk.cyan('TURPAN_ANALYSIS.html')}`,
      reportPaths.findingsJson && `  ${chalk.cyan('TURPAN_FINDINGS.json')}`,
      reportPaths.scorecardJson && `  ${chalk.cyan('TURPAN_SCORECARD.json')}`,
      reportPaths.fixPlanMd    && `  ${chalk.cyan('TURPAN_FIX_PLAN.md')}`,
      reportPaths.patchDiff    && `  ${chalk.cyan('TURPAN_PATCH.diff')}`,
      reportPaths.runSummary   && `  ${chalk.cyan('TURPAN_RUN_SUMMARY.json')}`,
      reportPaths.evidenceMd   && `  ${chalk.cyan('TURPAN_EVIDENCE_INDEX.md')}`,
    ].filter(Boolean);
    for (const a of artifacts) console.log(a);
    console.log();
  }

  console.log(chalk.dim('  Next:'));
  console.log(`    ${chalk.cyan('turpan report')}          — view summary`);
  console.log(`    ${chalk.cyan('turpan report --open')}    — open HTML report`);
  console.log(`    ${chalk.cyan('turpan report --json')}    — JSON for CI / agents`);
  console.log(`    ${chalk.cyan('turpan report --format html')} — HTML report`);
  console.log();

  return { critical, high, medium, verdict };
}

// ============ COMMANDS ============

function createDoctorCommand(): Command {
  const cmd = new Command('doctor');
  cmd.description('Check system requirements and environment').action(async () => {
    console.log(chalk.bold('\n🔍 Turpan Environment Check\n'));
    const result = await runDoctorCheck();
    for (const check of result.checks) {
      const icon = check.ok ? chalk.green('✓') : chalk.red('✗');
      console.log(`${icon} ${check.name}: ${check.message} ${chalk.dim(`[${check.ok ? 'OK' : 'FAIL'}]`)}`);
    }
    console.log();
    if (result.ok) {
      console.log(chalk.green('✅ All checks passed! Turpan is ready to use.\n'));
    } else {
      console.log(chalk.red('❌ Some checks failed. Please fix the issues above.\n'));
      process.exit(1);
    }
  });
  return cmd;
}

function createInitCommand(): Command {
  const cmd = new Command('init');
  cmd.description('Initialize Turpan configuration in a project')
    .argument('[path]', 'Project path', '.')
    .action(async (path: string) => {
      const projectPath = resolveProjectPath(path);
      console.log(chalk.bold('\n🚀 Initializing Turpan\n'));
      console.log(chalk.dim(`Project: ${projectPath}\n`));
      createDefaultConfig(projectPath);
      console.log(chalk.green('✅ Created turpan.yml\n'));
      console.log(chalk.bold('Next steps:'));
      console.log(`  ${chalk.cyan('turpan review .')}`);
      console.log(`  ${chalk.cyan('turpan')}\n`);
    });
  return cmd;
}

function createReviewCommand(): Command {
  const cmd = new Command('review');
  cmd.description('Run code review on a project')
    .argument('[path]', 'Project path to analyze', '.')
    .option('-d, --deep', 'Enable deep analysis (includes static quality, dead code, security checks)', false)
    .option('-q, --quality', 'Run static code quality analyzers only (unused deps, placeholders, complexity, architecture)', false)
    .option('-u, --ui', 'Enable UI analysis', false)
    .option('-f, --fix', 'Enable fix mode (produces patch plans only, same as --patch-only)', false)
    .option('--patch-only', 'Generate patch diffs without applying (default when using --fix)', false)
    .option('--apply', 'Apply fixes to working tree (requires clean git state)', false)
    .option('--interactive', 'Ask before applying each fix', false)
    .option('--auto-safe', 'Automatically apply only safe fix categories', false)
    .option('-p, --plan', 'Print the review plan without running analysis', false)
    .option('--install', 'Run dependency installation before review', false)
    .option('--timeout <seconds>', 'Timeout per command in seconds (default: 120)', '120')
    .option('--skip-build', 'Skip build stage', false)
    .option('--skip-tests', 'Skip test stage', false)
    .option('--skip-lint', 'Skip lint stage', false)
    .option('--skip-typecheck', 'Skip typecheck stage', false)
    .option('-s, --scenarios <ids>', 'Comma-separated UI test scenario IDs (e.g. auth,billing,dashboard)', undefined)
    .option('--skip-scenarios', 'Skip scenario library execution in UI tests', false)
    .option('--plugins <list>', 'Comma-separated list of plugins to enable (e.g. saas,security-basic)', undefined)
    .option('--agent-output', 'Run agent output audit (requires --task)', false)
    .option('--task <file>', 'Task/prompt file for agent audit')
    .option('--from <ref>', 'Base ref for diff-based review (e.g. main, origin/main)', undefined)
    .option('--to <ref>', 'Target ref for diff-based review (e.g. HEAD, feature-branch)', undefined)
    .option('--fail-on <level>', 'Exit code policy: critical (exit 1 on critical), high (exit 1 on critical or high), never (never fail)', 'never')
    .option('--dependency-audit', 'Include dependency CVE scan and license audit (offline by default)', false)
    .option('--online', 'Enable online CVE scanning (OSV/npm audit) — only used with --dependency-audit', false)
    .action(async (path: string, options: {
      deep?: boolean; quality?: boolean; ui?: boolean; fix?: boolean; plan?: boolean;
      patchOnly?: boolean; apply?: boolean; interactive?: boolean; autoSafe?: boolean;
      install?: boolean; timeout?: string;
      skipBuild?: boolean; skipTests?: boolean; skipLint?: boolean; skipTypecheck?: boolean;
      scenarios?: string; skipScenarios?: boolean; plugins?: string;
      agentOutput?: boolean; task?: string;
      from?: string; to?: string;
      failOn?: string;
      dependencyAudit?: boolean; online?: boolean;
    }) => {
      const projectPath = resolveProjectPath(path);
      const timeoutMs = (parseInt(options.timeout ?? '120') || 120) * 1000;

      // ── Diff-review mode: use git diff as the review scope ─────────────────
      if (options.from || options.to) {
        const baseRef = options.from ?? 'main';
        const targetRef = options.to ?? 'HEAD';

        console.log(chalk.bold('\n🔍 Turpan Diff Review\n'));
        console.log(chalk.dim(`Project: ${projectPath}`));
        console.log(chalk.dim(`Diff: ${baseRef} → ${targetRef}`));
        console.log(chalk.cyan('⏳ Computing diff…\n'));

        // Import lazily to avoid circular deps
        const { GitDiffEngine } = await import('@turpan/git-diff');

        let diffResult: import('@turpan/git-diff').GitDiffResult;
        try {
          const engine = new GitDiffEngine(projectPath);
          diffResult = engine.getDiff(baseRef, targetRef);
          if (diffResult.refError) {
            console.error(chalk.red(`\n❌ ${diffResult.refError}\n`));
            process.exit(1);
          }
        } catch (err) {
          console.error(chalk.red(`\n❌ Failed to get git diff: ${err instanceof Error ? err.message : err}\n`));
          process.exit(1);
        }

        // Show diff summary
        const s = diffResult.stats;
        console.log(chalk.green(`  ${s.filesAdded} added | ${s.filesModified} modified | ${s.filesDeleted} deleted | ${s.filesRenamed} renamed`));
        console.log(chalk.dim(`  +${s.totalLinesAdded} / -${s.totalLinesDeleted} lines\n`));

        if (diffResult.hasWorkingTreeChanges) {
          console.log(chalk.yellow('  ⚠️  Warning: working tree has uncommitted changes\n'));
        }

        // Show changed files
        if (diffResult.files.length > 0) {
          console.log(chalk.bold('  Changed files:'));
          for (const f of diffResult.files.slice(0, 30)) {
            const icon = f.changeType === 'added' ? '✨' :
                         f.changeType === 'deleted' ? '🗑️' :
                         f.changeType === 'renamed' ? '📝' : '📄';
            console.log(`    ${icon} ${f.changeType.padEnd(10)} ${f.path}`);
          }
          if (diffResult.files.length > 30) {
            console.log(chalk.dim(`    … and ${diffResult.files.length - 30} more files\n`));
          }
          console.log();
        }

        // Run diff-scoped review
        console.log(chalk.cyan('⏳ Running diff-scoped analysis…\n'));
        let runPath: string;
        try {
          runPath = await runAnalysis({
            projectPath,
            deepAnalysis: options.deep ?? false,
            uiAnalysis: options.ui ?? false,
            fixMode: options.fix ?? false,
            install: options.install ?? false,
            timeoutMs,
            skipBuild: options.skipBuild ?? false,
            skipTests: options.skipTests ?? false,
            skipLint: options.skipLint ?? false,
            skipTypecheck: options.skipTypecheck ?? false,
            uiScenarios: options.scenarios ? options.scenarios.split(',').map(s => s.trim()).filter(Boolean) : undefined,
            skipScenarios: options.skipScenarios ?? false,
            plugins: options.plugins ? options.plugins.split(',').map(p => p.trim()).filter(Boolean) : undefined,
            dependencyAudit: options.dependencyAudit ?? false,
            dependencyAuditOnline: options.online ?? false,
            diffMode: true,
            diffResult,
            diffBaseRef: baseRef,
            diffTargetRef: targetRef,
          });
        } catch (err) {
          console.error(chalk.red(`\n❌ Diff review failed: ${err instanceof Error ? err.message : err}\n`));
          process.exit(1);
        }

        // Build diff review data for the report
        const { GitDiffEngine: GE2 } = await import('@turpan/git-diff');
        const engine2 = new GitDiffEngine(projectPath);
        const recommendation = engine2.deriveRecommendation(diffResult);
        const diffReviewData = {
          baseRef,
          targetRef,
          changedFilesSummary: `${s.filesAdded} added, ${s.filesModified} modified, ${s.filesDeleted} deleted, ${s.filesRenamed} renamed (+${s.totalLinesAdded}/-${s.totalLinesDeleted} lines)`,
          riskByFile: diffResult.riskLevel.files.map(f => ({
            file: f,
            risk: (diffResult.riskLevel.level) as DiffReview['riskByFile'][number]['risk'],
            reason: diffResult.riskLevel.reasons.find(r => r.includes(f)),
          })),
          changedRoutes: diffResult.changedRoutes.map(r => r.route),
          changedApis: diffResult.changedApis.map(a => a.path),
          changedComponents: diffResult.changedComponents.map(c => c.name),
          findingsIntroducedByDiff: recommendation.findings.map(f => `[${f.severity}] ${f.title}`),
          preExistingFindingsIgnored: [],
          recommendation: recommendation.decision,
          confidence: recommendation.confidence,
          summary: recommendation.summary,
          topIntroducedRisks: recommendation.findings.slice(0, 5).map(f => ({
            severity: f.severity,
            title: f.title,
            explanation: f.explanation,
            file: f.file,
            line: f.line,
            confidence: 80,
          })),
          testCoverage: {
            status: ('not-applicable') as DiffReview['testCoverage']['status'],
            criticalFeaturesTested: false,
            testFilesChanged: diffResult.stats.filesDeleted + diffResult.stats.filesAdded,
            sourceFilesChanged: diffResult.stats.totalFiles,
            missingTestFiles: [],
            deletedTestFiles: diffResult.stats.filesDeleted > 0
              ? diffResult.files.filter(f => f.changeType === 'deleted' && (f.path.includes('test') || f.path.includes('spec'))).map(f => f.path)
              : [],
            testsWithoutAssertions: [],
          },
          mergeDecision: {
            decision: recommendation.decision,
            blockers: recommendation.decision === 'block_merge' ? recommendation.findings.filter(f => f.severity === 'critical').map(f => f.title) : ([] as string[]),
            warnings: recommendation.decision === 'request_changes' ? recommendation.findings.filter(f => f.severity === 'high').map(f => f.title) : ([] as string[]),
          },
        } satisfies DiffReview;

        console.clear();
        console.log(chalk.green('✅ Diff review complete!\n'));
        const recIcon = recommendation.decision === 'approve' ? '✅' :
                        recommendation.decision === 'request_changes' ? '⚠️' : '❌';
        console.log(`  PR Decision: ${recIcon} **${recommendation.decision.replace('_', ' ').toUpperCase()}**\n`);
        console.log(chalk.dim(`Reports at: ${runPath}\n`));
        console.log(`  ${chalk.cyan('TURPAN_ANALYSIS.md')}       — full analysis`);
        console.log(`  ${chalk.cyan('TURPAN_PR_COMMENT.md')}     — GitHub PR comment`);
        console.log(`  ${chalk.cyan('TURPAN_DIFF_FINDINGS.json')} — CI-friendly JSON\n`);
        const failOn = (options.failOn ?? 'never') as FailOnLevel;
        const summary = await printTerminalSummary(projectPath, runPath, diffReviewData);
        exitWithPolicy(failOn, summary.critical, summary.high);
        return;
      }

      // If any fix mode is requested, delegate to the fix engine
      const fixMode = resolveFixMode({
        patchOnly: options.patchOnly,
        apply: options.apply,
        interactive: options.interactive,
        autoSafe: options.autoSafe,
        fix: options.fix,
      });

      if (fixMode !== 'report-only') {
        // Delegate to fix engine (which includes running review for findings)
        try {
          const result = await runFixEngine({
            projectRoot: projectPath,
            fixMode,
            runReviewFirst: true,
            reviewOptions: { deep: options.deep, timeoutMs },
          });
          const verdictColor = result.validation.allPassed ? chalk.green : chalk.red;
          console.log(chalk.bold('\n✅ Fix run complete!'));
          console.log(chalk.dim(`   Mode: ${fixMode} | Applied: ${result.applied.length} | Rejected: ${result.rejected.length}\n`));
        } catch (err) {
          console.error(chalk.red(`\n❌ Fix run failed: ${err}\n`));
          process.exit(1);
        }
        return;
      }

      if (options.agentOutput) {
        const taskFile = options.task ?? join(projectPath, '.turpan', 'task.md');
        let taskText: string | undefined;
        if (existsSync(taskFile)) {
          taskText = readFileSync(taskFile, 'utf-8');
        }
        // Run agent audit standalone — no full review needed
        console.log(chalk.cyan('\n🔍 Running agent output audit…\n'));
        const report = await runAgentOutputAudit({ projectRoot: projectPath, taskText, agentType: (options as {agent?: string}).agent });
        console.log(chalk.green(`\n✅ Agent audit complete — Score: ${report.completion.overall}/100 (${report.recommendation})\n`));
        return;
      }

      const modeParts = options.quality
        ? ['static-code-quality']
        : [options.deep ? 'deep' : 'standard'];
      if (options.ui) modeParts.push('UI');
      if (options.fix) modeParts.push('fix');
      if (options.install) modeParts.push('+install');
      const skipped = [
        options.skipBuild && 'build',
        options.skipTests && 'tests',
        options.skipLint && 'lint',
        options.skipTypecheck && 'typecheck',
      ].filter(Boolean);
      if (skipped.length > 0) modeParts.push(`-skip:${skipped.join(',')}`);

      console.log(chalk.bold('\n🔍 Turpan Review\n'));
      console.log(chalk.dim(`Project: ${projectPath}`));
      console.log(chalk.dim(`Mode: ${modeParts.join(' | ')}`));
      if (options.timeout) console.log(chalk.dim(`Timeout: ${options.timeout}s per command`));
      console.log();
      console.log(chalk.cyan('⏳ Analyzing...'));
      let runPath: string;
      try {
        if (options.quality) {
          // Quality-only mode: deep analysis focused on static quality
          runPath = await runAnalysis({
            projectPath,
            deepAnalysis: true,
            uiAnalysis: false,
            fixMode: options.fix ?? false,
            install: false,
            timeoutMs,
            skipBuild: true,
            skipTests: true,
            skipLint: true,
            skipTypecheck: true,
            skipSecurity: true,
            uiScenarios: options.scenarios ? options.scenarios.split(',').map(s => s.trim()).filter(Boolean) : undefined,
            skipScenarios: true,
          });
        } else {
          const enabledPlugins = options.plugins
            ? options.plugins.split(',').map(p => p.trim()).filter(Boolean)
            : undefined;
          runPath = await runAnalysis({
            projectPath,
            deepAnalysis: options.deep ?? false,
            uiAnalysis: options.ui ?? false,
            fixMode: options.fix ?? false,
            install: options.install ?? false,
            timeoutMs,
            skipBuild: options.skipBuild ?? false,
            skipTests: options.skipTests ?? false,
            skipLint: options.skipLint ?? false,
            skipTypecheck: options.skipTypecheck ?? false,
            uiScenarios: options.scenarios ? options.scenarios.split(',').map(s => s.trim()).filter(Boolean) : undefined,
            skipScenarios: options.skipScenarios ?? false,
            plugins: enabledPlugins,
            dependencyAudit: options.dependencyAudit ?? false,
            dependencyAuditOnline: options.online ?? false,
          });
        }
      } catch (error) {
        console.error(chalk.red(`\n❌ Analysis failed: ${error}\n`));
        process.exit(1);
      }

      // Run agent output audit if --agent-output flag is set
      const taskFile = options.task ?? join(projectPath, '.turpan', 'task.md');
      if (existsSync(taskFile)) {
        console.log(chalk.cyan('\n🔍 Running agent output audit…\n'));
        const auditReport = await runAgentOutputAudit({
          projectRoot: projectPath,
          taskText: readFileSync(taskFile, 'utf-8'),
        });
        const summaryPath = join(runPath, 'agent-audit-summary.json');
        writeFileSync(summaryPath, JSON.stringify({
          completionScore: auditReport.completion.overall,
          recommendation: auditReport.recommendation,
          confidenceLevel: auditReport.confidenceLevel,
          requestedCapabilities: auditReport.requestedCapabilities.map(c => c.category),
          implementedCapabilities: auditReport.implementedCapabilities.map(c => c.category),
          missingCapabilities: auditReport.completion.missingCapabilities.map(c => c.category),
          fakeShallowImpls: auditReport.completion.fakeOrShallowCapabilities.map(c => c.category),
          issuesCount: {
            critical: auditReport.issues.filter(i => i.severity === 'critical').length,
            high:     auditReport.issues.filter(i => i.severity === 'high').length,
            medium:   auditReport.issues.filter(i => i.severity === 'medium').length,
            low:      auditReport.issues.filter(i => i.severity === 'low').length,
          },
          overall: auditReport.completion.overall,
        }, null, 2), 'utf-8');
        const detailPath = join(runPath, 'AGENT_OUTPUT_AUDIT.json');
        writeFileSync(detailPath, JSON.stringify(auditReport, null, 2), 'utf-8');
        console.log(chalk.green(`  Agent audit — Score: ${auditReport.completion.overall}/100 (${auditReport.recommendation})\n`));
      }

      const summary = await printTerminalSummary(projectPath, runPath);
      const failOn = (options.failOn ?? 'never') as FailOnLevel;
      exitWithPolicy(failOn, summary.critical, summary.high);
    });
  return cmd;
}

function createReportCommand(): Command {
  const cmd = new Command('report');
  cmd.description('Display, open, or export the Turpan Analysis report')
    .argument('[path]', 'Project path or run ID (default: latest run)', '.')
    .option('--format <format>', 'Output format: markdown (default) or html', 'markdown')
    .option('--json', 'Output structured JSON (findings + scorecard)', false)
    .option('--open', 'Open the HTML report in the browser', false)
    .action(async (path: string, options: { format?: string; json?: boolean; open?: boolean }) => {
      const { ReportOpenCommand } = await import('@turpan/report');
      const projectPath = resolveProjectPath(path);

      if (options.open) {
        await ReportOpenCommand.open();
        return;
      }

      if (options.json) {
        const latestPath = join(projectPath, '.turpan', 'runs', 'latest');
        const findingsPath  = join(latestPath, 'TURPAN_FINDINGS.json');
        const scorecardPath = join(latestPath, 'TURPAN_SCORECARD.json');
        const summaryPath   = join(latestPath, 'TURPAN_RUN_SUMMARY.json');

        if (existsSync(findingsPath)) {
          console.log(readFileSync(findingsPath, 'utf-8'));
        } else if (existsSync(scorecardPath)) {
          console.log(readFileSync(scorecardPath, 'utf-8'));
        } else if (existsSync(summaryPath)) {
          console.log(readFileSync(summaryPath, 'utf-8'));
        } else {
          console.error(chalk.red('\n❌ No JSON report found. Run `turpan review .` first.\n'));
          process.exit(1);
        }
        return;
      }

      const latestPath   = join(projectPath, '.turpan', 'runs', 'latest');
      const htmlPath     = join(latestPath, 'TURPAN_ANALYSIS.html');
      const mdPath       = join(latestPath, 'TURPAN_ANALYSIS.md');
      const reportPath   = options.format === 'html' ? htmlPath : mdPath;

      if (!existsSync(reportPath)) {
        console.log(chalk.yellow('\n⚠ No analysis report found.\n'));
        console.log(chalk.dim('Run ' + chalk.cyan('turpan review .') + ' first.\n'));
        return;
      }

      const content = readFileSync(reportPath, 'utf-8');
      console.log(content);
    });

  // `turpan report open` sub-command
  const openCmd = new Command('open');
  openCmd.description('Open the HTML report in your browser').action(async () => {
    const { ReportOpenCommand } = await import('@turpan/report');
    await ReportOpenCommand.open();
  });
  cmd.addCommand(openCmd);

  return cmd;
}

function createInspectCommand(): Command {
  const cmd = new Command('inspect');
  cmd.description('Inspect and display project fingerprint')
    .argument('[path]', 'Project path to inspect', '.')
    .option('--json', 'Output as JSON', false)
    .action(async (path: string, options: { json?: boolean }) => {
      const projectPath = resolveProjectPath(path);

      console.log(chalk.bold('\n🔍 Project Fingerprint\n'));
      console.log(chalk.dim(`Inspecting: ${projectPath}\n`));

      try {
        const { detectProject, formatFingerprintSummary } = await import('@turpan/core');
        const fingerprint = detectProject(projectPath);

        if (options.json) {
          console.log(JSON.stringify(fingerprint, null, 2));
        } else {
          const summary = formatFingerprintSummary(fingerprint);
          console.log(chalk.bold('📋 Project Summary'));
          console.log(chalk.dim('─'.repeat(50)));
          console.log(summary.split('\n').map(l => '  ' + l).join('\n'));
          console.log(chalk.dim('─'.repeat(50) + '\n'));

          if (fingerprint.missingFiles.length > 0) {
            console.log(chalk.bold('⚠️  Missing / Potential Issues'));
            for (const missing of fingerprint.missingFiles) {
              console.log(`  ${chalk.yellow('•')} ${missing}`);
            }
            console.log();
          }
        }

        // Save fingerprint
        const latestPath = join(projectPath, '.turpan', 'runs', 'latest');
        ensureDir(latestPath);
        writeFileSync(join(latestPath, 'project-fingerprint.json'), JSON.stringify(fingerprint, null, 2), 'utf-8');
        console.log(chalk.dim(`Fingerprint saved to: ${latestPath}/project-fingerprint.json\n`));
      } catch (error) {
        console.error(chalk.red(`\n❌ Inspection failed: ${error}\n`));
        process.exit(1);
      }
    });
  return cmd;
}

// ============ MAIN ============

const program = new Command();

program
  .name('turpan')
  .description('🐪 Interactive review and fix agent CLI')
  .version('0.1.0');

function createCleanupScanCommand(): Command {
  const cmd = new Command('cleanup-scan');
  cmd.description('Scan for cleanup candidates (unused code, placeholders, dead code) — read-only')
    .argument('[path]', 'Project path to scan', '.')
    .option('--deep', 'Run deep analysis including architecture checks', false)
    .action(async (path: string, options: { deep?: boolean }) => {
      const projectPath = resolveProjectPath(path);
      console.log(chalk.bold('\n🧹 Turpan Cleanup Scan\n'));
      console.log(chalk.dim(`Project: ${projectPath}`));
      console.log(chalk.dim('Mode: read-only — no files will be deleted\n'));
      console.log(chalk.cyan('🔍 Scanning...\n'));
      try {
        const runPath = await runAnalysis({
          projectPath,
          deepAnalysis: options.deep ?? false,
          skipBuild: true,
          skipTests: true,
          skipLint: true,
          skipTypecheck: true,
          skipSecurity: true,
        });
        console.log('\x1b[2J\x1b[0f');
        console.log(chalk.green('✅ Cleanup scan complete!\n'));
        console.log(chalk.dim(`Reports at: ${runPath}\n`));
        console.log(`  ${chalk.cyan('TURPAN_ANALYSIS.md')} — contains Code Quality & Cleanup section`);
        console.log(`  ${chalk.cyan('TURPAN_FINDINGS.json')}\n`);
      } catch (error) {
        console.log('\x1b[2J\x1b[0f');
        console.error(chalk.red(`\n❌ Cleanup scan failed: ${error}\n`));
        process.exit(1);
      }
    });
  return cmd;
}

function createAgentAuditCommand(): Command {
  const cmd = new Command('agent-audit');
  cmd.description('Audit agent output: compare original task to actual implementation')
    .argument('[path]', 'Project path to audit', '.')
    .option('-t, --task <file>', 'Path to task/prompt file that was given to the agent')
    .option('--agent <type>', 'Agent type (claude-code, opencode, cursor, etc.)')
    .option('--shell', 'Read task from interactive shell input')
    .option('--from <ref>', 'Base ref for diff-scoped audit (e.g. main)', undefined)
    .option('--to <ref>', 'Target ref for diff-scoped audit (e.g. HEAD)', undefined)
    .action(async (path: string, options: { task?: string; agent?: string; shell?: boolean; from?: string; to?: string }) => {
      const projectPath = resolveProjectPath(path);
      console.log(chalk.bold('\n🤖 Turpan Agent Output Audit\n'));
      console.log(chalk.dim(`Project: ${projectPath}\n`));

      let taskText: string | undefined;
      if (options.shell) {
        // Read from stdin
        console.log(chalk.dim('Paste the task/prompt (Ctrl+D to finish):\n'));
        taskText = await new Promise<string>((resolve) => {
          const chunks: string[] = [];
          process.stdin.on('data', (d) => chunks.push(d.toString()));
          process.stdin.on('end', () => resolve(chunks.join('')));
        });
      } else if (options.task) {
        const taskPath = resolve(projectPath, options.task);
        if (!existsSync(taskPath)) {
          console.error(chalk.red(`\n❌ Task file not found: ${taskPath}\n`));
          process.exit(1);
        }
        taskText = readFileSync(taskPath, 'utf-8');
        console.log(chalk.dim(`Task loaded from: ${taskPath}\n`));
      } else {
        // Try default .turpan/task.md
        const defaultPath = join(projectPath, '.turpan', 'task.md');
        if (existsSync(defaultPath)) {
          taskText = readFileSync(defaultPath, 'utf-8');
          console.log(chalk.dim(`Task loaded from: ${defaultPath}\n`));
        } else {
          console.error(chalk.red('\n❌ No task file specified. Use --task <file> or create .turpan/task.md\n'));
          process.exit(1);
        }
      }

      console.log(chalk.cyan('🔍 Analyzing agent output…\n'));

      // Build diff result if --from/--to were provided
      let diffResultForAudit: { files: Array<{ path: string; changeType: 'added' | 'modified' | 'deleted' | 'renamed'; oldPath?: string }> } | undefined;
      if (options.from || options.to) {
        const baseRef = options.from ?? 'main';
        const targetRef = options.to ?? 'HEAD';
        try {
          const { GitDiffEngine } = await import('@turpan/git-diff');
          const engine = new GitDiffEngine(projectPath);
          const diff = engine.getDiff(baseRef, targetRef);
          if (!diff.refError) {
            diffResultForAudit = { files: diff.files as Array<{ path: string; changeType: 'added' | 'modified' | 'deleted' | 'renamed'; oldPath?: string }> };
            console.log(chalk.dim(`Diff scope: ${baseRef} → ${targetRef} (${diff.files.length} files)\n`));
          }
        } catch { /* non-fatal — fall back to full scan */ }
      }

      try {
        const report = await runAgentOutputAudit({
          projectRoot: projectPath,
          taskText,
          agentType: options.agent,
          diffMode: Boolean(diffResultForAudit),
          diffResult: diffResultForAudit,
        });

        // Print summary
        const verdictColor = report.recommendation === 'READY' ? chalk.green :
          report.recommendation === 'READY_WITH_LIMITATIONS' ? chalk.yellow :
          report.recommendation === 'NOT_READY' ? chalk.red : chalk.red.bold;

        console.log(chalk.bold('📊 Agent Output Audit Results\n'));
        console.log(`  Recommendation: ${verdictColor(report.recommendation)}`);
        console.log(`  Confidence:     ${report.confidenceLevel}`);
        console.log(`  Overall Score:  ${chalk.cyan(String(report.completion.overall) + '/100')}`);
        console.log();
        console.log(`  Requested:     ${chalk.cyan(String(report.completion.totalCapabilities))} capabilities`);
        console.log(`  Implemented:   ${chalk.green(String(report.completion.implementedCapabilities))}`);
        console.log(`  Missing:       ${report.completion.missingCapabilities.length > 0 ? chalk.red(String(report.completion.missingCapabilities.length)) : chalk.green('0')}`);
        console.log();

        // Issues summary
        const critical = report.issues.filter((i: { severity: string }) => i.severity === 'critical').length;
        const high = report.issues.filter((i: { severity: string }) => i.severity === 'high').length;
        const medium = report.issues.filter((i: { severity: string }) => i.severity === 'medium').length;
        const low = report.issues.filter((i: { severity: string }) => i.severity === 'low').length;
        if (report.issues.length > 0) {
          console.log(chalk.bold('  Issues Found:'));
          if (critical > 0) console.log(`    ${chalk.red('●')} ${chalk.red(String(critical))} critical`);
          if (high > 0) console.log(`    ${chalk.red('●')} ${chalk.yellow(String(high))} high`);
          if (medium > 0) console.log(`    ${chalk.yellow('●')} ${chalk.yellow(String(medium))} medium`);
          if (low > 0) console.log(`    ${chalk.blue('●')} ${chalk.blue(String(low))} low`);
          console.log();
        }

        // Coverage breakdown
        console.log(`  ${chalk.bold('Coverage:')}`);
        console.log(`    Feature Coverage:     ${chalk.cyan(String(report.completion.requestedFeatureCoverage) + '%')}`);
        console.log(`    Implementation Depth: ${chalk.cyan(String(report.completion.implementationDepth) + '%')}`);
        console.log(`    Test Relevance:      ${chalk.cyan(String(report.completion.testCoverageRelevance) + '%')}`);
        console.log(`    Runtime Validation:   ${chalk.cyan(String(report.completion.runtimeValidation) + '%')}`);
        console.log();

        // Print issues
        if (report.issues.length > 0) {
          console.log(chalk.bold('  Issues:\n'));
          for (const issue of report.issues.slice(0, 20)) {
            const sevColor = issue.severity === 'critical' || issue.severity === 'high' ? chalk.red :
              issue.severity === 'medium' ? chalk.yellow : chalk.dim;
            const kindLabel = `[${issue.kind}]`.padEnd(22);
            console.log(`    ${sevColor(issue.severity.toUpperCase().padEnd(10))} ${kindLabel} ${issue.title}`);
            if (issue.file) {
              console.log(chalk.dim(`      ${issue.file}${issue.line ? ':' + issue.line : ''}`));
            }
          }
          if (report.issues.length > 20) {
            console.log(chalk.dim(`    … and ${report.issues.length - 20} more issues\n`));
          }
          console.log();
        }

        console.log(`  ${chalk.bold('Summary:')} ${report.summary}\n`);

        // Save report
        const runId = new Date().toISOString().replace(/[:.]/g, '-');
        const runDir = join(projectPath, '.turpan', 'runs', runId);
        ensureDir(runDir);
        const reportJson = JSON.stringify(report, null, 2);
        writeFileSync(join(runDir, 'AGENT_OUTPUT_AUDIT.json'), reportJson, 'utf-8');

        // Write markdown report
        const mdLines: string[] = [];
        mdLines.push('# Agent Output Audit Report');
        mdLines.push('');
        mdLines.push(`**Project:** ${projectPath}`);
        mdLines.push(`**Date:** ${new Date().toISOString()}`);
        mdLines.push(`**Recommendation:** ${report.recommendation}`);
        mdLines.push(`**Confidence:** ${report.confidenceLevel}`);
        mdLines.push('');
        mdLines.push('## Completion Score');
        mdLines.push('');
        mdLines.push(`| Metric | Value |`);
        mdLines.push(`|--------|-------|`);
        mdLines.push(`| **Overall** | **${report.completion.overall}/100** |`);
        mdLines.push(`| Feature Coverage | ${report.completion.requestedFeatureCoverage}% |`);
        mdLines.push(`| Implementation Depth | ${report.completion.implementationDepth}% |`);
        mdLines.push(`| Test Relevance | ${report.completion.testCoverageRelevance}% |`);
        mdLines.push(`| Runtime Validation | ${report.completion.runtimeValidation}% |`);
        mdLines.push(`| Requested Capabilities | ${report.completion.totalCapabilities} |`);
        mdLines.push(`| Implemented | ${report.completion.implementedCapabilities} |`);
        mdLines.push(`| Missing | ${report.completion.missingCapabilities.length} |`);
        mdLines.push('');
        mdLines.push('## Requested vs Implemented');
        mdLines.push('');
        mdLines.push('| Capability | Status |');
        mdLines.push('|------------|--------|');
        for (const cap of report.requestedCapabilities) {
          const impl = report.implementedCapabilities.find((i: { category: string }) => i.category === cap.category);
          const status = impl ? '✅ Implemented' : '❌ Missing';
          mdLines.push(`| ${cap.category} | ${status} |`);
        }
        mdLines.push('');
        if (report.issues.length > 0) {
          mdLines.push('## Issues');
          mdLines.push('');
          for (const issue of report.issues) {
            mdLines.push(`### ${issue.severity.toUpperCase()}: ${issue.title}`);
            mdLines.push('');
            mdLines.push(`${issue.explanation}`);
            mdLines.push('');
            if (issue.file) {
              mdLines.push(`**File:** \`${issue.file}${issue.line ? ':' + issue.line : ''}\``);
              mdLines.push('');
            }
            if (issue.suggestedFix) {
              mdLines.push(`**Suggested Fix:** ${issue.suggestedFix}`);
              mdLines.push('');
            }
          }
        }
        mdLines.push('');
        mdLines.push(`## Summary`);
        mdLines.push('');
        mdLines.push(report.summary);
        mdLines.push('');
        mdLines.push('*Generated by Turpan Agent Output Audit*');

        writeFileSync(join(runDir, 'AGENT_OUTPUT_AUDIT.md'), mdLines.join('\n'), 'utf-8');

        console.log(chalk.green('✅ Agent audit complete!\n'));
        console.log(chalk.dim(`Report saved to: ${runDir}\n`));
        console.log(`  ${chalk.cyan('AGENT_OUTPUT_AUDIT.md')} — human-readable report`);
        console.log(`  ${chalk.cyan('AGENT_OUTPUT_AUDIT.json')} — structured data\n`);

      } catch (error) {
        console.error(chalk.red(`\n❌ Agent audit failed: ${error}\n`));
        process.exit(1);
      }
    });
  return cmd;
}

function createUiTestCommand(): Command {
  const cmd = new Command('ui-test');
  cmd.description('Run live UI testing engine — start dev server, open browser, test routes')
    .argument('[path]', 'Project path to test', '.')
    .option('--url <url>', 'Skip server start, use existing URL (e.g. http://localhost:3000)')
    .option('--headed', 'Run with visible browser (not headless)', false)
    .option('--mobile', 'Only test mobile viewport (390×844)', false)
    .option('--desktop', 'Only test desktop viewport (1280×800)', false)
    .option('--trace', 'Capture Playwright traces for debugging', false)
    .option('-s, --scenarios <ids>', 'Comma-separated scenario IDs (e.g. auth,billing,marketing)', undefined)
    .option('--skip-scenarios', 'Skip scenario library', false)
    .action(async (path: string, options: {
      url?: string; headed?: boolean; mobile?: boolean; desktop?: boolean; trace?: boolean; scenarios?: string; skipScenarios?: boolean;
    }) => {
      const projectPath = resolveProjectPath(path);
      const runId = new Date().toISOString().replace(/[:.]/g, '-');

      console.log(chalk.bold('\n🖥️  Turpan Live UI Test\n'));
      console.log(chalk.dim(`Project: ${projectPath}`));
      if (options.url) console.log(chalk.dim(`URL: ${options.url}`));
      console.log(chalk.dim(`Mode: ${options.headed ? 'headed' : 'headless'} | ${options.mobile ? 'mobile' : options.desktop ? 'desktop' : 'both'} viewports\n`));
      console.log(chalk.cyan('⏳ Starting UI test engine...\n'));

      try {
        const fingerprint = detectProject(projectPath);
        // Pull testUser / billing config from turpan.yml (safely, opt-in only)
        const cfg = loadConfig(projectPath) as unknown as { ui?: { testUser?: { enabled: boolean; email: string; password: string; seedCommand?: string; loginPath?: string; dashboardPath?: string }; billing?: { testMode: boolean; checkoutEndpoint?: string } } };
        const testUser = cfg.ui?.testUser;
        const billing = cfg.ui?.billing;

        const report = await runUiTest({
          projectRoot: projectPath,
          runId,
          fingerprint,
          url: options.url,
          headed: options.headed,
          mobileOnly: options.mobile,
          scenarios: options.scenarios ? options.scenarios.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          skipScenarios: options.skipScenarios ?? false,
          desktopOnly: options.desktop,
          trace: options.trace,
          testUser: testUser?.enabled ? {
            enabled: true,
            email: testUser.email,
            password: testUser.password,
            seedCommand: testUser.seedCommand ?? '',
            loginPath: testUser.loginPath ?? '/login',
            dashboardPath: testUser.dashboardPath ?? '/dashboard',
          } : undefined,
          billing: billing?.testMode ? {
            testMode: true,
            checkoutEndpoint: billing.checkoutEndpoint ?? '',
          } : undefined,
        });

        console.log('\x1b[2J\x1b[0f');
        console.log(chalk.bold('\n🖥️  UI Test Results\n'));

        const verdictColor = report.verdict === 'usable' ? chalk.green :
                             report.verdict === 'partially_usable' ? chalk.yellow : chalk.red;
        console.log(`  Verdict: ${verdictColor(report.verdict.toUpperCase())}`);
        console.log(chalk.dim(`  App: ${report.appType} @ ${report.baseUrl}\n`));

        console.log(`  Routes:     ${report.summary.successfulRoutes}/${report.summary.totalRoutes} loaded`);
        console.log(`  Screenshots: ${chalk.cyan(String(report.summary.totalScreenshots))}`);
        console.log(`  Console errors: ${report.summary.consoleErrors > 0 ? chalk.red(String(report.summary.consoleErrors)) : chalk.green('0')}`);
        console.log(`  Network errors: ${report.summary.networkErrors > 0 ? chalk.red(String(report.summary.networkErrors)) : chalk.green('0')}`);
        console.log(`  Hydration errors: ${report.summary.hydrationErrors > 0 ? chalk.red(String(report.summary.hydrationErrors)) : chalk.green('0')}`);
        console.log(`  Responsive issues: ${report.summary.responsiveIssues > 0 ? chalk.yellow(String(report.summary.responsiveIssues)) : chalk.green('0')}`);
        console.log(`  A11y issues: ${report.summary.a11yIssues > 0 ? chalk.yellow(String(report.summary.a11yIssues)) : chalk.green('0')}`);
        console.log(`  Interactions: ${report.summary.interactionSteps - report.summary.interactionFailures}/${report.summary.interactionSteps} succeeded\n`);

        if (report.findings.length > 0) {
          console.log(chalk.bold('  UI Findings:'));
          for (const f of report.findings.slice(0, 10)) {
            const sevColor = f.severity === 'critical' || f.severity === 'high' ? chalk.red :
                             f.severity === 'medium' ? chalk.yellow : chalk.dim;
            console.log(`    ${sevColor(`[${f.severity}]`)} ${f.title}`);
          }
          if (report.findings.length > 10) {
            console.log(chalk.dim(`    … and ${report.findings.length - 10} more\n`));
          }
        }

        const runDir = join(projectPath, '.turpan', 'runs', runId);
        console.log(chalk.green('\n✅ UI test complete!\n'));
        console.log(chalk.dim(`Artifacts at: ${runDir}\n`));
        console.log(`  ${chalk.cyan('screenshots/')}   — page screenshots`);
        console.log(`  ${chalk.cyan('ui/routes.json')}   — discovered routes`);
        console.log(`  ${chalk.cyan('ui/console-errors.json')} — console errors`);
        console.log(`  ${chalk.cyan('ui/network-errors.json')} – network errors`);
        console.log(`  ${chalk.cyan('ui-test-report.json')} – full report\n`);

      } catch (error) {
        console.log('\x1b[2J\x1b[0f');
        console.error(chalk.red(`\n❌ UI test failed: ${error}\n`));
        process.exit(1);
      }
    });
  return cmd;
}

program.addCommand(createDoctorCommand());
program.addCommand(createInitCommand());
program.addCommand(createInspectCommand());
program.addCommand(createReviewCommand());
program.addCommand(createReportCommand());
program.addCommand(createDependencyAuditCommand());
program.addCommand(createCleanupScanCommand());
program.addCommand(createAgentAuditCommand());
program.addCommand(createReviewDiffCommand());
program.addCommand(createUiTestCommand());
program.addCommand(createRuntimeTestCommand());
program.addCommand(createFixCommand());
program.addCommand(createPluginsCommand());
program.addCommand(createScenariosCommand());
program.addCommand(createEvalCommand());

// Scripts subcommand
const scriptsCmd = new Command('scripts');
scriptsCmd.description('🐪 Turpan utility scripts');
scriptsCmd
  .command('post-pr-comment')
  .description('Post or update a sticky PR comment with Turpan review results')
  .allowUnknownOption(true)
  .action(async () => {
    const { createPostPrCommentCommand } = await import('./commands/postPrComment.js');
    const subCmd = createPostPrCommentCommand();
    // Forward remaining args to the subcommand
    await subCmd.parseAsync(process.argv, { from: 'user' });
  });
program.addCommand(scriptsCmd);

// MCP server subcommand
// Pass any subcommand directly through to the MCP server CLI
const mcpCmd = new Command('mcp');
mcpCmd.description('🐪 Turpan MCP Server commands');
mcpCmd
  .command('serve')
  .description('Start the Turpan MCP server (stdio transport)')
  .allowUnknownOption(true)
  .action(async () => {
    await delegateMcpCommand(['serve', ...process.argv.slice(3)]);
  });
mcpCmd
  .command('config')
  .description('Show MCP server configuration')
  .allowUnknownOption(true)
  .action(async () => {
    await delegateMcpCommand(['config', ...process.argv.slice(3)]);
  });
mcpCmd
  .command('status')
  .description('Check MCP server status')
  .allowUnknownOption(true)
  .action(async () => {
    await delegateMcpCommand(['status', ...process.argv.slice(3)]);
  });
program.addCommand(mcpCmd);

// Default: open interactive shell when no command is given
program.action(async () => {
  // If user typed `turpan mcp` with no subcommand, fall through to MCP help
  if (process.argv.length >= 3 && process.argv[2] === 'mcp') {
    await delegateMcpCommand(['--help']);
    return;
  }
  await runShell({ projectPath: resolveProjectPath('.') });
});

program.parseAsync(process.argv).catch((error) => {
  console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
  console.error(error.stack);
  process.exit(1);
});
