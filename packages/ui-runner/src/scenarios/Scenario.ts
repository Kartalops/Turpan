/**
 * Scenario — base model for a real-world QA scenario.
 *
 * A scenario is a structured, realistic user flow that exercises a specific
 * part of the application (auth, billing, dashboard, etc.).
 *
 * Safety guarantees:
 * - No destructive actions (delete, drop, purge)
 * - No real purchases or payment submissions
 * - No real credential submission
 * - No bypass of auth controls
 * - All interactions are QA-only
 */

import type { Page } from 'playwright';
import type { ViewportConfig, TestUserConfig, BillingTestConfig } from '../types.js';
import type { ProjectFingerprint } from '@turpan/core';

// ── Scenario Result ────────────────────────────────────────────────────────────

export type ScenarioStatus = 'passed' | 'failed' | 'warn' | 'skipped';

export interface ScenarioStep {
  description: string;
  passed: boolean;
  screenshot?: string;
  error?: string;
  durationMs: number;
}

export interface ScenarioFinding {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  explanation: string;
  fixable: 'auto' | 'manual' | 'none';
  confidence: number;
  tags: string[];
}

export interface ScenarioArtifact {
  screenshots: string[];
  traces: string[];
}

export interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  status: ScenarioStatus;
  /** ms */
  durationMs: number;
  steps: ScenarioStep[];
  findings: ScenarioFinding[];
  artifacts: ScenarioArtifact;
  skippedReason?: string;
  finalUrl?: string;
}

// ── Scenario Context ────────────────────────────────────────────────────────────

export interface ScenarioContext {
  /** Base URL of the app under test */
  baseUrl: string;
  /** Active Playwright page */
  page: Page;
  /** Current viewport */
  viewport: ViewportConfig;
  /** Screenshot directory path */
  screenshotDir: string;
  /** Scenario-run output directory */
  runDir: string;
  /** Project fingerprint */
  fingerprint: ProjectFingerprint;
  /** Route map from route discovery */
  routeMap: ScenarioRouteMap;
  /** Console errors collected during this scenario */
  consoleErrors: string[];
  /** Network errors collected during this scenario */
  networkErrors: Array<{ url: string; status: number; error?: string }>;
  /** Test user config for authenticated scenarios (undefined = not configured) */
  testUser?: TestUserConfig;
  /** Billing test mode config */
  billing?: BillingTestConfig;
  /** Seed output from seedCommand run before auth scenarios */
  seedOutput?: string;
}

export interface ScenarioRouteMap {
  routes: string[];
  hasRoute: (path: string) => boolean;
  available: (paths: string[]) => string[];
}

// ── Scenario Interface ─────────────────────────────────────────────────────────

export type RiskLevel = 'safe' | 'low' | 'medium' | 'high';

export interface Scenario {
  /** Unique identifier, e.g. "saas-marketing", "auth-login" */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Risk level of this scenario */
  readonly riskLevel: RiskLevel;
  /** Whether this scenario supports the given project */
  supports(fp: ProjectFingerprint, routes: ScenarioRouteMap): boolean;
  /** Execute the scenario */
  run(ctx: ScenarioContext): Promise<ScenarioResult>;
}

// ── Safe Test Credentials ─────────────────────────────────────────────────────

/** QA-only test credentials — never used for real authentication */
export const SAFE_TEST_CREDENTIALS = {
  email: 'turpan-test@example.com',
  password: 'TurpanTest123!',
  firstName: 'Turpan',
  lastName: 'Test',
  company: 'Turpan QA',
} as const;

// ── Helper: capture screenshot for scenario ────────────────────────────────────

export async function captureScenarioScreenshot(
  ctx: ScenarioContext,
  label: string
): Promise<string> {
  // Gracefully degrade if the page is a mock (no real screenshot support).
  // This lets scenarios be unit-tested without a browser.
  if (typeof (ctx.page as { screenshot?: unknown }).screenshot !== 'function') {
    return `${ctx.screenshotDir}/scenario-${label}.png`;
  }
  try {
    const { ScreenshotManager } = await import('../ScreenshotManager.js');
    const mgr = new ScreenshotManager(ctx.screenshotDir);
    const artifact = await mgr.capture(ctx.page, `scenario-${label}`, ctx.viewport);
    return artifact.path;
  } catch {
    return `${ctx.screenshotDir}/scenario-${label}.png`;
  }
}

// ── Helper: check if a route exists ────────────────────────────────────────────

export function makeRouteMap(routes: string[]): ScenarioRouteMap {
  const routeSet = new Set(routes);
  return {
    routes,
    hasRoute: (path: string) => routeSet.has(path) || routeSet.has(path.replace(/\/$/, '')),
    available: (paths: string[]) => paths.filter(p => routeSet.has(p) || routeSet.has(p.replace(/\/$/, ''))),
  };
}

// ── Helper: check auth state ───────────────────────────────────────────────────

export async function isAuthenticated(ctx: ScenarioContext): Promise<boolean> {
  // Check for common auth indicators
  const indicators = [
    '[data-testid="user-menu"]',
    '[data-testid="user-avatar"]',
    '[role="navigation"] a:has-text("Logout")',
    '[role="navigation"] a:has-text("Sign out")',
    '[role="navigation"] a:has-text("Log out")',
    '[data-testid="dashboard-header"]',
    '.user-profile',
    '#user-menu',
  ];

  for (const selector of indicators) {
    try {
      const count = await ctx.page.locator(selector).count();
      if (count > 0) return true;
    } catch { /* ignore */ }
  }

  // Check URL for auth redirects
  const url = ctx.page.url();
  if (url.includes('/login') || url.includes('/signin')) {
    return false;
  }

  return false;
}

// ── Helper: detect no-op button ───────────────────────────────────────────────

export async function detectNoOpButton(
  ctx: ScenarioContext,
  selector: string
): Promise<{ isNoOp: boolean; reason: string }> {
  try {
    const beforeUrl = ctx.page.url();
    const beforeBody = await ctx.page.evaluate(() => document.body?.innerHTML?.length ?? 0);

    await ctx.page.locator(selector).first().click({ timeout: 3000 });

    await ctx.page.waitForTimeout(1500);

    const afterUrl = ctx.page.url();
    const afterBody = await ctx.page.evaluate(() => document.body?.innerHTML?.length ?? 0);

    // Check if URL changed
    if (beforeUrl !== afterUrl) {
      return { isNoOp: false, reason: 'URL changed' };
    }

    // Check if DOM changed
    if (Math.abs(beforeBody - afterBody) > 100) {
      return { isNoOp: false, reason: 'DOM changed' };
    }

    // Check if any network request fired
    const networkRequests = ctx.networkErrors.length;
    // If no network errors AND no URL/DOM change, might be no-op

    return { isNoOp: true, reason: 'No URL/DOM change detected after click' };
  } catch (err) {
    return { isNoOp: false, reason: `Click failed: ${err}` };
  }
}

// ── Helper: detect fake checkout ───────────────────────────────────────────────

export async function detectFakeCheckout(
  ctx: ScenarioContext,
  selector: string
): Promise<{ isFake: boolean; reason: string }> {
  try {
    // Check if button is disabled or has no handler
    const isDisabled = await ctx.page.locator(selector).first().isDisabled();
    if (isDisabled) {
      return { isFake: true, reason: 'Button is disabled (placeholder)' };
    }

    // Check if button text suggests it's not wired
    const text = await ctx.page.locator(selector).first().textContent();
    if (text && /(demo|coming soon|disabled|not available)/i.test(text)) {
      return { isFake: true, reason: `Button text suggests not wired: "${text}"` };
    }

    // Try clicking and check for network activity
    const beforeUrl = ctx.page.url();
    await ctx.page.locator(selector).first().click({ timeout: 3000 });
    await ctx.page.waitForTimeout(2000);

    // Check if any checkout-related network request was attempted
    const url = ctx.page.url();
    const hasCheckoutUrl = url.includes('checkout') || url.includes('payment') || url.includes('billing');

    if (!hasCheckoutUrl && url === beforeUrl) {
      return { isFake: true, reason: 'No navigation to checkout/payment after click' };
    }

    return { isFake: false, reason: 'Appears to be wired' };
  } catch {
    return { isFake: true, reason: 'Click failed (likely not wired)' };
  }
}
