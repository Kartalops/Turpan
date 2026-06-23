/**
 * ResponsiveScenario — validates responsive behavior across viewports.
 *
 * Flow:
 *  1. Test homepage at desktop, tablet, mobile viewports
 *  2. Detect horizontal overflow at each breakpoint
 *  3. Check mobile menu (hamburger) visibility
 *  4. Check touch targets meet 44px minimum
 *  5. Check for horizontal scroll indicators
 *  6. Report findings per viewport
 */
import type { Scenario, ScenarioContext, ScenarioResult, ScenarioRouteMap } from './Scenario.js';
import type { ProjectFingerprint } from '@turpan/core';
export declare class ResponsiveScenario implements Scenario {
    readonly id = "responsive";
    readonly name = "Responsive Layout Testing";
    readonly riskLevel: "safe";
    supports(_fp: ProjectFingerprint, routes: ScenarioRouteMap): boolean;
    run(ctx: ScenarioContext): Promise<ScenarioResult>;
    private testViewport;
    private checkHorizontalOverflow;
    private checkMobileMenu;
    private checkTouchTargets;
}
export declare const responsiveScenario: ResponsiveScenario;
//# sourceMappingURL=ResponsiveScenario.d.ts.map