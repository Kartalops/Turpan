/**
 * BillingTestModeScenario — validates billing in test mode.
 *
 * Safety guarantees:
 * - Detects checkout buttons but does NOT trigger real Stripe checkout
 * - If ui.billing.testMode === true and a local test checkout endpoint exists,
 *   it may call it (only if explicitly enabled)
 * - Reports wiring status for all billing UI elements
 * - NEVER completes a real payment
 */
import type { Scenario, ScenarioContext, ScenarioResult, ScenarioRouteMap } from './Scenario.js';
import type { ProjectFingerprint } from '@turpan/core';
export declare class BillingTestModeScenario implements Scenario {
    readonly id = "next-saas-billing-test-mode";
    readonly name = "Billing Test Mode";
    readonly riskLevel: "low";
    supports(fp: ProjectFingerprint, routes: ScenarioRouteMap): boolean;
    run(ctx: ScenarioContext): Promise<ScenarioResult>;
    private visitPricingPage;
    private checkPricingCards;
    private reportCheckoutWiring;
    private testLocalCheckout;
    private detectFakeCheckoutSuccess;
    private visitBillingAccount;
}
export declare const billingTestModeScenario: BillingTestModeScenario;
//# sourceMappingURL=BillingTestModeScenario.d.ts.map