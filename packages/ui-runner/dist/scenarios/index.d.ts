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
/**
 * Global scenario registry — pre-loaded with all built-in scenarios.
 * Import this in your test code to access the scenario library.
 */
export declare const scenarioRegistry: ScenarioRegistry;
import type { ScenarioContext } from './Scenario.js';
import type { ProjectFingerprint } from '@turpan/core';
/**
 * Run all supported scenarios for a project.
 */
export declare function runScenarioSuite(ctx: ScenarioContext & {
    fingerprint: ProjectFingerprint;
}): Promise<Array<import('./Scenario.js').ScenarioResult>>;
/**
 * Run a specific scenario by ID.
 */
export declare function runScenario(scenarioId: string, ctx: ScenarioContext): Promise<import('./Scenario.js').ScenarioResult | null>;
//# sourceMappingURL=index.d.ts.map