/**
 * DashboardScenario — validates the authenticated dashboard experience.
 *
 * Flow:
 *  1. Visit dashboard (may be redirected to login)
 *  2. Check for data widgets and charts
 *  3. Check sidebar navigation
 *  4. Test interactive widgets (filters, date pickers)
 *  5. Check notifications/alerts
 *  6. Test user menu
 */
import type { Scenario, ScenarioContext, ScenarioResult, ScenarioRouteMap } from './Scenario.js';
import type { ProjectFingerprint } from '@turpan/core';
export declare class DashboardScenario implements Scenario {
    readonly id = "dashboard";
    readonly name = "Dashboard Experience";
    readonly riskLevel: "safe";
    supports(fp: ProjectFingerprint, routes: ScenarioRouteMap): boolean;
    run(ctx: ScenarioContext): Promise<ScenarioResult>;
    private visitDashboard;
    private checkSidebar;
    private checkWidgets;
    private checkInteractiveWidgets;
    private checkUserMenu;
    private checkNotifications;
}
export declare const dashboardScenario: DashboardScenario;
//# sourceMappingURL=DashboardScenario.d.ts.map