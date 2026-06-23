/**
 * uiLiveStage — runs live UI tests with the scenario library.
 *
 * Uses @turpan/ui-runner to:
 *  1. Start the dev server (or use provided URL)
 *  2. Discover routes
 *  3. Run viewport tests (desktop + mobile)
 *  4. Execute the Real Scenario Library (auth, billing, dashboard, etc.)
 *  5. Produce structured findings
 */

import type { ReviewContext } from '../../orchestrator/ReviewContext.js';
import type { StageResult } from '../../orchestrator/ReviewStage.js';
import type { Finding } from '../../findings/Finding.js';

export interface UiLiveStageOptions {
  /** URL to test — skips server start if provided */
  url?: string;
  /** Run in headed browser */
  headed?: boolean;
  /** Only test mobile viewport */
  mobileOnly?: boolean;
  /** Only test desktop viewport */
  desktopOnly?: boolean;
  /** Scenario IDs to run (omit for all supported) */
  scenarios?: string[];
  /** Skip scenario library execution */
  skipScenarios?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFinding = any;

function makeResult(
  status: StageResult['status'],
  durationMs: number,
  findings: Finding[],
  artifacts?: Record<string, unknown>,
  error?: string
): StageResult {
  return { stageId: 'ui-live-basic', status, findings, durationMs, artifacts, error };
}

export async function runUiLiveStage(
  ctx: ReviewContext,
  opts: UiLiveStageOptions = {}
): Promise<StageResult> {
  const { fingerprint, projectRoot, runId } = ctx;
  const start = Date.now();

  // Check if UI testing is applicable
  const uiAppTypes = ['nextjs', 'vite-react', 'vite-vue', 'vite-svelte', 'remix'];
  if (!uiAppTypes.includes(fingerprint.appType)) {
    return makeResult('skipped', Date.now() - start, [], undefined, 'Not a supported UI framework');
  }

  // Dynamically import ui-runner to avoid circular dependency at the type level
  let runUiTest: (opts: {
    projectRoot: string; runId: string; fingerprint: unknown;
    url?: string; headed?: boolean; mobileOnly?: boolean; desktopOnly?: boolean;
    scenarios?: string[]; skipScenarios?: boolean;
    testUser?: { enabled: boolean; email: string; password: string; seedCommand?: string; loginPath?: string; dashboardPath?: string };
    billing?: { testMode: boolean; checkoutEndpoint?: string };
  }) => Promise<unknown>;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const uiRunner = require('@turpan/ui-runner');
    runUiTest = uiRunner.runUiTest as typeof runUiTest;
  } catch {
    return makeResult('failed', Date.now() - start, [], undefined, '@turpan/ui-runner not installed or not found');
  }

  // Pull testUser / billing config from project config (safely, opt-in only)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let projectConfig: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadConfig } = require('../../config/index.js');
    projectConfig = loadConfig(projectRoot);
  } catch { /* ignore */ }

  try {
    // eslint-disable-next-line @typescript-eslint/no-any
    const report = await runUiTest({
      projectRoot,
      runId,
      fingerprint: fingerprint as unknown,
      url: opts.url,
      headed: opts.headed,
      mobileOnly: opts.mobileOnly,
      desktopOnly: opts.desktopOnly,
      scenarios: opts.scenarios ?? ctx.uiScenarios,
      skipScenarios: opts.skipScenarios ?? ctx.skipScenarios ?? false,
      testUser: projectConfig?.ui?.testUser?.enabled ? {
        enabled: true,
        email: projectConfig.ui.testUser.email,
        password: projectConfig.ui.testUser.password,
        seedCommand: projectConfig.ui.testUser.seedCommand ?? '',
        loginPath: projectConfig.ui.testUser.loginPath ?? '/login',
        dashboardPath: projectConfig.ui.testUser.dashboardPath ?? '/dashboard',
      } : undefined,
      billing: projectConfig?.ui?.billing?.testMode ? {
        testMode: true,
        checkoutEndpoint: projectConfig.ui.billing.checkoutEndpoint ?? '',
      } : undefined,
    }) as {
      findings: AnyFinding[];
      summary: { totalRoutes: number; totalScreenshots: number; consoleErrors: number; runtimeErrors: number; hydrationErrors: number; responsiveIssues: number; a11yIssues: number };
      scenarioResults?: { total: number; passed: number; failed: number };
      verdict: string;
    };

    // Register findings from the report into the shared store
    const registeredFindings: Finding[] = [];
    for (const f of report.findings as AnyFinding[]) {
      try {
        ctx.findings.add(f as Finding);
        registeredFindings.push(f as Finding);
      } catch { /* skip malformed */ }
    }

    // Store scenario summary in context metadata
    if (report.scenarioResults) {
      ctx.metadata['uiScenarioResults'] = report.scenarioResults;
    }

    const durationMs = Date.now() - start;
    return makeResult('completed', durationMs, registeredFindings, {
      routes: report.summary.totalRoutes,
      screenshots: report.summary.totalScreenshots,
      consoleErrors: report.summary.consoleErrors,
      runtimeErrors: report.summary.runtimeErrors,
      hydrationErrors: report.summary.hydrationErrors,
      responsiveIssues: report.summary.responsiveIssues,
      a11yIssues: report.summary.a11yIssues,
      scenarioResults: report.scenarioResults,
      verdict: report.verdict,
    });
  } catch (err) {
    return makeResult('failed', Date.now() - start, [], undefined, String(err));
  }
}
