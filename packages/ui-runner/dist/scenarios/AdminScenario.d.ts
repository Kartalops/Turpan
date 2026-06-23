/**
 * AdminScenario — validates admin panel and settings pages.
 *
 * Flow:
 *  1. Test unauthenticated access to /admin routes FIRST (critical security check)
 *  2. If accessible without auth → CRITICAL finding (auth bypass)
 *  3. If authenticated test user is not admin, admin should still be blocked
 *  4. Check for data tables and safe action buttons
 *  5. Detect destructive buttons (WARN — do NOT click)
 *  6. Verify role-based access indicators
 *
 * Safety guarantees:
 * - Does NOT attempt privilege escalation
 * - Does NOT click destructive buttons
 * - Tests unauthenticated access BEFORE authenticated access
 */
import type { Scenario, ScenarioContext, ScenarioResult, ScenarioRouteMap } from './Scenario.js';
import type { ProjectFingerprint } from '@turpan/core';
export declare class AdminScenario implements Scenario {
    readonly id = "next-saas-admin-unprotected-authenticated";
    readonly name = "Admin Panel & Settings";
    readonly riskLevel: "medium";
    supports(fp: ProjectFingerprint, routes: ScenarioRouteMap): boolean;
    run(ctx: ScenarioContext): Promise<ScenarioResult>;
    /**
     * CRITICAL SECURITY CHECK: Test unauthenticated access to admin routes.
     * This must run BEFORE any authenticated checks.
     */
    private testUnauthenticatedAccess;
    private visitSettings;
    /**
     * Test admin access with authenticated session.
     * If testUser is not admin, admin should still be blocked.
     * Does NOT attempt privilege escalation.
     */
    private visitAdminAuthenticated;
}
export declare const adminScenario: AdminScenario;
//# sourceMappingURL=AdminScenario.d.ts.map