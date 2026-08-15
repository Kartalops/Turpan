/**
 * InteractiveShell — main shell orchestration.
 * Coordinates IntentRouter, CommandMemory, ShellRenderer, and ShellSession.
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { detectProject, formatFingerprintSummary, type ProjectFingerprint } from '@turpan/core';
import { runReview, type OrchestratorResult } from '@turpan/core';
import { parseCommand, getIntentLabel, getAvailableCommands, getCommandCategories, type Intent } from './intent.js';
import { CommandMemory, type ShellMode } from './CommandMemory.js';
import { ShellRenderer } from './ShellRenderer.js';
import { ShellSession } from './ShellSession.js';
import { IntentRouter, createRouter, type RouterResult } from './IntentRouter.js';
import { ReportOpenCommand } from '@turpan/report';

const TURPAN_PROMPT = chalk.cyan('turpan') + chalk.dim(' > ');

export interface InteractiveShellConfig {
  projectPath: string;
  autoRun?: boolean;
}

export async function runInteractiveShell(config: InteractiveShellConfig): Promise<void> {
  const { projectPath } = config;

  const memory = new CommandMemory();
  const renderer = new ShellRenderer();
  const fingerprint = detectProject(projectPath);

  const session = new ShellSession(
    {
      projectPath,
      projectName: fingerprint.projectName,
      projectType: fingerprint.appType,
    },
    memory
  );

  const router = createRouter(projectPath, null);

  // ── Header ─────────────────────────────────────────────────────────────────
  renderer.greeting();
  renderer.projectInfo(formatFingerprintSummary(fingerprint).split('\n'));
  renderer.help(getCommandCategories());
  renderer.dim('Type a command or /help for available commands.\n');

  // ── Main loop ──────────────────────────────────────────────────────────────
  while (session.running) {
    try {
      const { command } = await inquirer.prompt<{ command: string }>([
        {
          type: 'input',
          name: 'command',
          message: TURPAN_PROMPT,
          prefix: '',
          transformer: (input: string) => input,
        },
      ]);

      if (!command.trim()) {
        continue;
      }

      // Handle slash commands
      if (command.startsWith('/')) {
        await handleSlashCommand(command.slice(1), session, router, renderer);
        continue;
      }

      session.pushCommand(command);
      session.resetHistoryIndex();

      const parsed = parseCommand(command);
      const route = router.route(parsed);

      await executeRoute(route, session, router, renderer);
    } catch (error) {
      if ((error as { code?: string }).code === 'EXIT') {
        session.stop();
      } else {
        renderer.error(String(error));
      }
    }
  }

  renderer.goodbye();
}

// ── Slash command handler ─────────────────────────────────────────────────────

async function handleSlashCommand(
  raw: string,
  session: ShellSession,
  router: IntentRouter,
  renderer: ShellRenderer
): Promise<void> {
  const parsed = parseCommand(raw);
  const route = router.route(parsed);

  switch (raw.toLowerCase()) {
    case 'help':
      renderer.help(getCommandCategories());
      return;
    case 'status':
      renderer.status(
        session.selectedMode,
        session.lastRunId,
        session.lastFindings.length
      );
      return;
    case 'findings':
      if (session.lastFindings.length === 0) {
        renderer.info('No findings from last run. Run a review first.');
      } else {
        renderer.findingsSummary(session.lastFindings);
      }
      return;
    case 'score':
    case 'scorecard':
      if (!session.lastScorecard) {
        renderer.info('No scorecard from last run. Run a review first.');
      } else {
        renderer.scorecard(session.lastScorecard);
      }
      return;
    case 'report':
      await openLatestReport(session, renderer);
      return;
    case 'review':
      await executeRoute(router.route(parseCommand('review')), session, router, renderer);
      return;
    case 'review --ui':
      await executeRoute(router.route(parseCommand('ui review')), session, router, renderer);
      return;
    case 'fix --patch-only':
      await executeRoute(router.route(parseCommand('patch only')), session, router, renderer);
      return;
    case 'fix --apply':
      await executeRoute(router.route(parseCommand('apply fix')), session, router, renderer);
      return;
    case 'doctor':
      await runDoctor(session, renderer);
      return;
    case 'exit':
    case 'quit':
      session.stop();
      return;
    default:
      renderer.info(`Unknown slash command: /${raw}. Try /help.`);
  }
}

// ── Route execution ───────────────────────────────────────────────────────────

async function executeRoute(
  route: RouterResult,
  session: ShellSession,
  router: IntentRouter,
  renderer: ShellRenderer
): Promise<void> {
  const { intent, label, action, runOptions, plugins, scenarios } = route;

  // Handle exit
  if (intent === 'exit') {
    session.stop();
    return;
  }

  // Handle report-only actions
  if (action === 'report') {
    if (intent === 'show_findings') {
      if (session.lastFindings.length === 0) {
        renderer.info('No findings from last run. Run a review first.');
      } else {
        renderer.findingsSummary(session.lastFindings);
      }
      return;
    }
    if (intent === 'show_scorecard') {
      if (!session.lastScorecard) {
        renderer.info('No scorecard from last run. Run a review first.');
      } else {
        renderer.scorecard(session.lastScorecard);
      }
      return;
    }
    if (intent === 'open_report') {
      await openLatestReport(session, renderer);
      return;
    }
    // For scan/propose intents without prior run, run a limited review
    if (router.requiresPriorRun(intent) && !session.lastRunId) {
      renderer.info(`No prior run found. Running a review first...`);
    } else {
      renderer.info(`${label}: ${router.describeIntent(intent)}`);
      renderer.info('(This intent runs a read-only scan)\n');
      return;
    }
  }

  // Handle open action
  if (action === 'open') {
    await openLatestReport(session, renderer);
    return;
  }

  // Show mode notice for fix/patch intents
  if (action === 'patch') {
    renderer.patchModeNotice();
  } else if (action === 'apply') {
    renderer.applyModeNotice();
  }

  // Run the analysis
  renderer.stageStart(label, router.describeIntent(intent));

  let result: OrchestratorResult | undefined;
  try {
    const config = buildTurpanConfig(session, runOptions ?? {}, plugins, scenarios);
    result = await runReview(config);

    // Update memory
    session.commandMemory.setLastRun(result.runId, {
      timestamp: new Date().toISOString(),
      projectPath: session.config.projectPath,
      analysisType: intent,
      status: 'completed',
      duration: result.durationMs,
    });
    session.commandMemory.setFindings(result.findings);
    session.commandMemory.setScorecard({
      overall: result.scorecard.overall,
      categories: {
        correctness: result.scorecard.overall,
        security: result.scorecard.security,
        performance: result.scorecard.ui_runtime,
        maintainability: result.scorecard.architecture,
        codeCoverage: result.scorecard.test_health,
      },
      findingsCount: result.findings.length,
      criticalIssues: result.findings.filter(finding => finding.severity === 'critical').length,
    });
    session.setProjectStarted(true);

    const mode: ShellMode = ShellSession.intentToMode(intent);
    session.setMode(mode);

    // Render summary
    const runPath = getRunReportPath(result.runId);
    renderer.stageComplete(label, result.durationMs);
    renderer.runSummary({
      runId: result.runId,
      durationMs: result.durationMs,
      findingsCount: result.findings.length,
      verdict: result.verdict,
      reportPath: runPath,
    });

    // Show findings summary
    if (result.findings.length > 0) {
      renderer.findingsSummary(result.findings, 10);
    }

    renderer.artifactPath('Report', runPath);

  } catch (error) {
    renderer.stageFail(label, error instanceof Error ? error.message : String(error));
    renderer.error(`Review failed: ${error}`);
  }
}

// ── Doctor ────────────────────────────────────────────────────────────────────

async function runDoctor(session: ShellSession, renderer: ShellRenderer): Promise<void> {
  renderer.doctorSection('Environment');

  // Check node version
  const nodeVersion = process.version;
  renderer.doctorCheck('Node.js', 'pass', nodeVersion);

  // Check project path
  renderer.doctorCheck('Project Path', 'pass', session.config.projectPath);

  // Check last run
  if (session.lastRunId) {
    renderer.doctorCheck('Last Run', 'pass', session.lastRunId);
  } else {
    renderer.doctorCheck('Last Run', 'warn', 'No runs yet');
  }

  // Check findings
  if (session.lastFindings.length > 0) {
    renderer.doctorCheck(
      'Findings',
      session.lastFindings.some(f => f.severity === 'critical') ? 'fail' : 'pass',
      `${session.lastFindings.length} findings`
    );
  } else {
    renderer.doctorCheck('Findings', 'pass', 'No findings');
  }

  // Check scorecard
  if (session.lastScorecard) {
    const score = session.lastScorecard.overall;
    renderer.doctorCheck(
      'Scorecard',
      score >= 60 ? 'pass' : score >= 40 ? 'warn' : 'fail',
      `Overall: ${score}/100`
    );
  } else {
    renderer.doctorCheck('Scorecard', 'warn', 'No scorecard yet');
  }

  renderer.dim('\n  Run /review for a full analysis.\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTurpanConfig(
  session: ShellSession,
  runOptions: RouterResult['runOptions'],
  plugins?: string[],
  scenarios?: string[]
): Parameters<typeof runReview>[0] {
  const fingerprint = detectProject(session.config.projectPath);

  return {
    projectPath: session.config.projectPath,
    fingerprint,
    config: {
      version: '1.0.0',
      projectPath: session.config.projectPath,
      runPath: '',
      deepAnalysis: runOptions?.deepAnalysis ?? false,
      uiAnalysis: runOptions?.uiAnalysis ?? false,
      fixMode: runOptions?.fixMode ?? false,
      logLevel: 'info',
      plugins: plugins ?? [],
    },
    deepAnalysis: runOptions?.deepAnalysis ?? false,
    uiAnalysis: runOptions?.uiAnalysis ?? false,
    fixMode: runOptions?.fixMode ?? false,
    skipBuild: runOptions?.skipBuild ?? false,
    skipTests: runOptions?.skipTests ?? false,
    skipLint: runOptions?.skipLint ?? false,
    skipTypecheck: runOptions?.skipTypecheck ?? false,
    plugins,
    uiScenarios: scenarios,
    skipScenarios: false,
  };
}

function getRunReportPath(runId: string): string {
  // Construct the expected report path from run ID
  return `.turpan/runs/${runId}/report.html`;
}

async function openLatestReport(session: ShellSession, renderer: ShellRenderer): Promise<void> {
  if (!session.lastRunId) {
    renderer.info('No report to open. Run a review first.');
    return;
  }
  const reportPath = getRunReportPath(session.lastRunId);
  try {
    await ReportOpenCommand.open(reportPath);
    renderer.info(`Opened: ${reportPath}`);
  } catch {
    renderer.error(`Could not open report: ${reportPath}`);
  }
}
