/**
 * BillingScenario — validates billing and pricing UI without making real payments.
 *
 * Safety guarantees:
 * - NO real credit card entry
 * - NO real payment submission
 * - No checkout flow completion
 * - Validates only that pricing pages render and buttons are visible
 * - Detects broken/unwired checkout buttons
 */
import type { Scenario, ScenarioContext, ScenarioResult, ScenarioRouteMap } from './Scenario.js';
import type { ProjectFingerprint } from '@turpan/core';
export declare class BillingScenario implements Scenario {
    readonly id = "billing";
    readonly name = "Billing & Pricing";
    readonly riskLevel: "low";
    supports(fp: ProjectFingerprint, routes: ScenarioRouteMap): boolean;
    run(ctx: ScenarioContext): Promise<ScenarioResult>;
    private visitPricingPage;
    private checkPricingCards;
    private checkComparisonTable;
    private checkCheckoutButtons;
    private visitBillingAccount;
}
export declare const billingScenario: BillingScenario;
//# sourceMappingURL=BillingScenario.d.ts.map