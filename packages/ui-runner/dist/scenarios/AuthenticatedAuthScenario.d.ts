/**
 * AuthenticatedAuthScenario — upgrades AuthScenario with real seeded login.
 *
 * Safety guarantees:
 * - ONLY submits credentials if testUser.enabled === true
 * - Uses seeded test credentials from config — NEVER real credentials
 * - Verifies redirect to dashboard after login
 * - Captures screenshots before/after
 * - Detects login errors without real account exposure
 * - Auth-state metadata saved but secrets are NEVER persisted
 */
import type { Scenario, ScenarioContext, ScenarioResult, ScenarioRouteMap } from './Scenario.js';
import type { ProjectFingerprint } from '@turpan/core';
export declare class AuthenticatedAuthScenario implements Scenario {
    readonly id = "next-saas-auth-good";
    readonly name = "SaaS Authenticated Login";
    readonly riskLevel: "low";
    supports(fp: ProjectFingerprint, routes: ScenarioRouteMap): boolean;
    run(ctx: ScenarioContext): Promise<ScenarioResult>;
    private visitLoginPage;
    private checkLoginForm;
    private fillCredentials;
    private submitLogin;
    private verifyRedirect;
    private saveAuthStateMetadata;
}
export declare const authenticatedAuthScenario: AuthenticatedAuthScenario;
//# sourceMappingURL=AuthenticatedAuthScenario.d.ts.map