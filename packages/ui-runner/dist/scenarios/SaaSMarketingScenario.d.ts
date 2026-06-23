/**
 * SaaS Marketing Scenario — validates the marketing homepage and funnel.
 *
 * Flow:
 *  1. Visit /
 *  2. Check hero visibility and CTA
 *  3. Check navigation links
 *  4. Click pricing/features if present
 *  5. Scroll page and capture screenshot
 *  6. Validate no broken links
 */
import type { Scenario, ScenarioContext, ScenarioResult, ScenarioRouteMap } from './Scenario.js';
import type { ProjectFingerprint } from '@turpan/core';
export declare class SaaSMarketingScenario implements Scenario {
    readonly id = "saas-marketing";
    readonly name = "SaaS Marketing Homepage";
    readonly riskLevel: "safe";
    supports(fp: ProjectFingerprint, routes: ScenarioRouteMap): boolean;
    run(ctx: ScenarioContext): Promise<ScenarioResult>;
    private visitHomepage;
    private checkHeroSection;
    private checkPrimaryCta;
    private checkNavigation;
    private navigateToSecondaryPages;
    private scrollPage;
}
export declare const saasMarketingScenario: SaaSMarketingScenario;
//# sourceMappingURL=SaaSMarketingScenario.d.ts.map