/**
 * AuthenticatedDashboardScenario — validates the authenticated dashboard.
 *
 * Flow:
 *  1. Visit dashboard (pre-authenticated via prior scenario or cookie)
 *  2. Verify meaningful content or empty-state
 *  3. Click safe navigation items
 *  4. Detect console/network errors
 *  5. Detect broken widgets/cards
 *  6. Capture desktop/mobile screenshots
 *
 * Safety: Does NOT create, modify, or delete any data.
 */
import type { Scenario, ScenarioContext, ScenarioResult, ScenarioRouteMap } from './Scenario.js';
import type { ProjectFingerprint } from '@turpan/core';
export declare class AuthenticatedDashboardScenario implements Scenario {
    readonly id = "next-saas-dashboard-empty";
    readonly name = "Dashboard Authenticated";
    readonly riskLevel: "safe";
    supports(fp: ProjectFingerprint, routes: ScenarioRouteMap): boolean;
    run(ctx: ScenarioContext): Promise<ScenarioResult>;
    private visitDashboard;
    private checkMeaningfulContent;
    private clickSafeNavItems;
    private checkForErrors;
    private checkWidgets;
}
export declare const authenticatedDashboardScenario: AuthenticatedDashboardScenario;
//# sourceMappingURL=AuthenticatedDashboardScenario.d.ts.map