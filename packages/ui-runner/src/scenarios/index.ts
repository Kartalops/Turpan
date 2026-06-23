/**
 * Scenarios — Real Scenario Library for Turpan UI Testing.
 *
 * Built-in scenarios:
 *  - SaaS Marketing Homepage
 *  - Authentication Flow (safe — no real credentials)
 *  - SaaS Authenticated Login (real seeded login when testUser.enabled=true)
 *  - Dashboard Experience (unauthenticated)
 *  - Dashboard Authenticated (requires auth — skips if not authenticated)
 *  - Settings & Account (dry-run form inspection)
 *  - Billing & Pricing (safe — no real payments)
 *  - Billing Test Mode (local test checkout when billing.testMode=true)
 *  - Navigation & Routing
 *  - Admin Panel & Settings
 *  - Responsive Layout Testing
 *
 * Usage:
 *  ```ts
 *  import { scenarioRegistry, runScenarioSuite } from '@turpan/ui-runner';
 *
 *  // Register built-in scenarios (done automatically)
 *  scenarioRegistry.list();
 *
 *  // Run all supported scenarios
 *  await runScenarioSuite(ctx);
 *
 *  // Run specific scenario
 *  const result = await scenarioRegistry.runById('auth', ctx);
 *  ```
 */

export type { Scenario, ScenarioContext, ScenarioResult, ScenarioStep, ScenarioFinding, ScenarioRouteMap, ScenarioArtifact, ScenarioStatus, RiskLevel } from './Scenario.js';
export { SAFE_TEST_CREDENTIALS, makeRouteMap, isAuthenticated, detectNoOpButton, detectFakeCheckout, captureScenarioScreenshot } from './Scenario.js';
export { ScenarioRegistry } from './ScenarioRegistry.js';
export { saasMarketingScenario, SaaSMarketingScenario } from './SaaSMarketingScenario.js';
export { authScenario, AuthScenario } from './AuthScenario.js';
export { authenticatedAuthScenario, AuthenticatedAuthScenario } from './AuthenticatedAuthScenario.js';
export { billingScenario, BillingScenario } from './BillingScenario.js';
export { billingTestModeScenario, BillingTestModeScenario } from './BillingTestModeScenario.js';
export { dashboardScenario, DashboardScenario } from './DashboardScenario.js';
export { authenticatedDashboardScenario, AuthenticatedDashboardScenario } from './AuthenticatedDashboardScenario.js';
export { settingsScenario, SettingsScenario } from './SettingsScenario.js';
export { navigationScenario, NavigationScenario } from './NavigationScenario.js';
export { adminScenario, AdminScenario } from './AdminScenario.js';
export { responsiveScenario, ResponsiveScenario } from './ResponsiveScenario.js';

import { ScenarioRegistry } from './ScenarioRegistry.js';
import { saasMarketingScenario } from './SaaSMarketingScenario.js';
import { authScenario } from './AuthScenario.js';
import { authenticatedAuthScenario } from './AuthenticatedAuthScenario.js';
import { billingScenario } from './BillingScenario.js';
import { billingTestModeScenario } from './BillingTestModeScenario.js';
import { dashboardScenario } from './DashboardScenario.js';
import { authenticatedDashboardScenario } from './AuthenticatedDashboardScenario.js';
import { settingsScenario } from './SettingsScenario.js';
import { navigationScenario } from './NavigationScenario.js';
import { adminScenario } from './AdminScenario.js';
import { responsiveScenario } from './ResponsiveScenario.js';

/**
 * Global scenario registry — pre-loaded with all built-in scenarios.
 * Import this in your test code to access the scenario library.
 */
export const scenarioRegistry = new ScenarioRegistry();

// Auto-register built-in scenarios
scenarioRegistry.register(saasMarketingScenario);
scenarioRegistry.register(authScenario);
scenarioRegistry.register(authenticatedAuthScenario);
scenarioRegistry.register(billingScenario);
scenarioRegistry.register(billingTestModeScenario);
scenarioRegistry.register(dashboardScenario);
scenarioRegistry.register(authenticatedDashboardScenario);
scenarioRegistry.register(settingsScenario);
scenarioRegistry.register(navigationScenario);
scenarioRegistry.register(adminScenario);
scenarioRegistry.register(responsiveScenario);

// ── Convenience: run full scenario suite ──────────────────────────────────────

import type { ScenarioContext } from './Scenario.js';
import type { ProjectFingerprint } from '@turpan/core';

/**
 * Run all supported scenarios for a project.
 */
export async function runScenarioSuite(
  ctx: ScenarioContext & { fingerprint: ProjectFingerprint }
): Promise<Array<import('./Scenario.js').ScenarioResult>> {
  return scenarioRegistry.runAll(ctx);
}

/**
 * Run a specific scenario by ID.
 */
export async function runScenario(
  scenarioId: string,
  ctx: ScenarioContext
): Promise<import('./Scenario.js').ScenarioResult | null> {
  return scenarioRegistry.runById(scenarioId, ctx);
}
