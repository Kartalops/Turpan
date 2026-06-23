/**
 * AuthScenario — validates login, registration, and auth protection flows.
 *
 * Safety guarantees:
 * - NEVER submits real credentials
 * - NEVER logs into real accounts
 * - Validates only that forms exist and are wired (via detection, not actual auth)
 * - Tests protected route redirects (expected behavior)
 * - Detects fake/empty auth implementations
 */
import type { Scenario, ScenarioContext, ScenarioResult, ScenarioRouteMap } from './Scenario.js';
import type { ProjectFingerprint } from '@turpan/core';
export declare class AuthScenario implements Scenario {
    readonly id = "auth";
    readonly name = "Authentication Flow";
    readonly riskLevel: "low";
    supports(fp: ProjectFingerprint, routes: ScenarioRouteMap): boolean;
    run(ctx: ScenarioContext): Promise<ScenarioResult>;
    private visitLoginPage;
    private checkLoginForm;
    private detectFormWiring;
    private checkProtectedRouteRedirect;
    private visitRegisterPage;
    private checkSocialLogin;
    private checkForgotPassword;
}
export declare const authScenario: AuthScenario;
//# sourceMappingURL=AuthScenario.d.ts.map