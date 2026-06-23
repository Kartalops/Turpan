/**
 * NavigationScenario — validates the primary navigation structure.
 *
 * Flow:
 *  1. Collect all navigation links from header/sidebar
 *  2. Visit each valid route
 *  3. Check each route loads without crash
 *  4. Capture screenshot of each route
 *  5. Detect broken links (404s)
 */
import type { Scenario, ScenarioContext, ScenarioResult, ScenarioRouteMap } from './Scenario.js';
import type { ProjectFingerprint } from '@turpan/core';
export declare class NavigationScenario implements Scenario {
    readonly id = "navigation";
    readonly name = "Navigation & Routing";
    readonly riskLevel: "safe";
    supports(_fp: ProjectFingerprint, routes: ScenarioRouteMap): boolean;
    run(ctx: ScenarioContext): Promise<ScenarioResult>;
    private checkRouteStatus;
}
export declare const navigationScenario: NavigationScenario;
//# sourceMappingURL=NavigationScenario.d.ts.map