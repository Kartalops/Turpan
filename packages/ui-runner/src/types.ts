/**
 * Shared types for the UI Testing Engine
 */

import type { Browser, Page, BrowserContext, CDPSession } from 'playwright';
import type { Severity, Category, Finding } from '@turpan/core';

// ---------------------------------------------------------------------------
// Run configuration
// ---------------------------------------------------------------------------

/**
 * Test user configuration for authenticated scenario testing.
 * Credentials are NEVER real — always isolated test accounts.
 */
export interface TestUserConfig {
  /** Enable authenticated scenario testing */
  enabled: boolean;
  /** Test user email */
  email: string;
  /** Test user password */
  password: string;
  /** Command to seed the test user (e.g., "pnpm seed:test-user"). Empty = skip seeding. */
  seedCommand: string;
  /** Login page path */
  loginPath: string;
  /** Dashboard path after successful login */
  dashboardPath: string;
  /** Run seed command before running authenticated scenarios */
  runSeedBeforeAuth?: boolean;
}

export interface BillingTestConfig {
  /** When true, calls local test checkout endpoint if available */
  testMode: boolean;
  /** Local test checkout endpoint path (e.g., "/api/test-checkout"). Defaults to common paths if empty. */
  checkoutEndpoint?: string;
}

export interface UiRunnerConfig {
  projectRoot: string;
  runId: string;
  /** Override the URL — skips server start */
  url?: string;
  /** Run in headed mode (visible browser) */
  headed?: boolean;
  /** Only test mobile viewport */
  mobileOnly?: boolean;
  /** Only test desktop viewport */
  desktopOnly?: boolean;
  /** Capture Playwright traces */
  trace?: boolean;
  /** Timeout for page operations in ms */
  pageTimeoutMs?: number;
  /** Custom screenshot directory */
  screenshotDir?: string;
  /** Test user for authenticated scenarios */
  testUser?: TestUserConfig;
  /** Billing test mode configuration */
  billing?: BillingTestConfig;
}

export interface ViewportConfig {
  name: 'desktop' | 'mobile';
  width: number;
  height: number;
  deviceScaleFactor?: number;
  isMobile?: boolean;
  hasTouch?: boolean;
}

// ---------------------------------------------------------------------------
// Discovered routes
// ---------------------------------------------------------------------------

export interface DiscoveredRoute {
  path: string;
  source: 'crawl' | 'known' | 'link';
  method?: string;
  statusCode?: number;
  loaded: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Console / Network
// ---------------------------------------------------------------------------

export interface ConsoleEntry {
  type: 'error' | 'warning' | 'log' | 'info' | 'debug';
  text: string;
  url?: string;
  line?: number;
  column?: number;
  timestamp: string;
  isRuntimeError: boolean;
  isHydrationError: boolean;
}

export interface NetworkRequest {
  url: string;
  method: string;
  route: string;
  status: number;
  statusText: string;
  responseBodySize?: number;
  failure?: string;
  resourceType: string;
  isAppRequest: boolean;
  isExternalRequest: boolean;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

export interface InteractionStep {
  type: 'click' | 'fill' | 'select' | 'hover' | 'scroll' | 'wait' | 'navigate';
  selector?: string;
  value?: string;
  index?: number;
  description: string;
}

export interface InteractionResult {
  step: InteractionStep;
  success: boolean;
  error?: string;
  screenshot?: string;
  url?: string;
}

// ---------------------------------------------------------------------------
// Screenshot / Artifact
// ---------------------------------------------------------------------------

export interface ScreenshotArtifact {
  route: string;
  viewport: string;
  path: string;
  url: string;
}

export interface UiArtifact {
  screenshots: ScreenshotArtifact[];
  consoleErrors: ConsoleEntry[];
  networkErrors: NetworkRequest[];
  interactions: InteractionResult[];
  traces: string[];
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export type UiVerdict = 'usable' | 'partially_usable' | 'broken' | 'cannot_start';

// ---------------------------------------------------------------------------
// App Server
// ---------------------------------------------------------------------------

export interface AppServerInfo {
  url: string;
  port: number;
  pid: number;
  startedAt: string;
}

export type AppType = 'nextjs' | 'vite-react' | 'unknown';

// ---------------------------------------------------------------------------
// Responsive / Accessibility
// ---------------------------------------------------------------------------

export interface ResponsiveResult {
  viewport: ViewportConfig;
  hasHorizontalOverflow: boolean;
  overflowPixels?: number;
  screenshot?: string;
}

export interface AccessibilityResult {
  viewport: ViewportConfig;
  issues: A11yIssue[];
  screenshot?: string;
}

export interface A11yIssue {
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  element?: string;
  selector?: string;
  wcagCriteria?: string;
}

// ---------------------------------------------------------------------------
// UI Test Report
// ---------------------------------------------------------------------------

// Forward-declare for use in UiTestReport
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ScenarioResultPlaceholder {}

/**
 * Scenario summary embedded in the UI test report.
 */
export interface ScenarioSummary {
  total: number;
  passed: number;
  failed: number;
  warn: number;
  skipped: number;
  scenarios: Array<{ id: string; name: string; status: string; durationMs: number }>;
}

export interface UiTestReport {
  runId: string;
  projectRoot: string;
  appType: AppType;
  verdict: UiVerdict;
  baseUrl: string;
  startedAt: string;
  completedAt: string;
  routes: DiscoveredRoute[];
  artifacts: UiArtifact;
  responsiveResults: ResponsiveResult[];
  accessibilityResults: AccessibilityResult[];
  /** Scenario results from real scenario library */
  scenarioResults?: ScenarioSummary;
  findings: Finding[];
  summary: UiTestSummary;
}

export interface UiTestSummary {
  totalRoutes: number;
  successfulRoutes: number;
  failedRoutes: number;
  totalScreenshots: number;
  consoleErrors: number;
  networkErrors: number;
  hydrationErrors: number;
  runtimeErrors: number;
  responsiveIssues: number;
  a11yIssues: number;
  interactionSteps: number;
  interactionFailures: number;
}