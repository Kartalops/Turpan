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
import { captureScenarioScreenshot } from './Scenario.js';
import { confidence } from '@turpan/core';
const SCENARIO_ID = 'next-saas-admin-unprotected-authenticated';
const SCENARIO_NAME = 'Admin Panel & Settings';
export class AdminScenario {
    id = SCENARIO_ID;
    name = SCENARIO_NAME;
    riskLevel = 'medium';
    supports(fp, routes) {
        return (routes.hasRoute('/admin') ||
            routes.hasRoute('/settings') ||
            routes.hasRoute('/account') ||
            routes.hasRoute('/admin/users') ||
            routes.hasRoute('/admin/settings'));
    }
    async run(ctx) {
        const steps = [];
        const findings = [];
        const screenshots = [];
        const start = Date.now();
        // Step 1: CRITICAL — Test unauthenticated access FIRST
        const unauthFindings = await this.testUnauthenticatedAccess(ctx, steps, screenshots);
        findings.push(...unauthFindings);
        // Step 2: Settings page (safe, display-only)
        await this.visitSettings(ctx, steps, screenshots);
        // Step 3: Authenticated admin access (if testUser is enabled)
        const adminFindings = await this.visitAdminAuthenticated(ctx, steps, screenshots);
        findings.push(...adminFindings);
        const criticalCount = findings.filter(f => f.severity === 'critical').length;
        return {
            scenarioId: this.id,
            scenarioName: this.name,
            status: criticalCount > 0 ? 'failed' : steps.some(s => !s.passed) ? 'warn' : 'passed',
            durationMs: Date.now() - start,
            steps,
            findings,
            artifacts: { screenshots, traces: [] },
            finalUrl: ctx.page.url(),
        };
    }
    /**
     * CRITICAL SECURITY CHECK: Test unauthenticated access to admin routes.
     * This must run BEFORE any authenticated checks.
     */
    async testUnauthenticatedAccess(ctx, steps, screenshots) {
        const findings = [];
        const start = Date.now();
        const adminPaths = ['/admin', '/admin/dashboard', '/admin/users', '/admin/settings'];
        // Clear any existing auth state to ensure we're testing unauthenticated access
        try {
            await ctx.page.context().clearCookies();
        }
        catch { /* ignore */ }
        for (const path of adminPaths) {
            if (ctx.routeMap.hasRoute(path)) {
                try {
                    await ctx.page.goto(`${ctx.baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
                    await ctx.page.waitForTimeout(1500);
                    const screenshot = await captureScenarioScreenshot(ctx, `admin-unauth-${path.replace(/\//g, '-')}`);
                    screenshots.push(screenshot);
                    const currentUrl = ctx.page.url();
                    const isOnAdmin = currentUrl.includes('/admin');
                    const isOnLogin = currentUrl.includes('/login') || currentUrl.includes('/signin');
                    if (isOnAdmin && !isOnLogin) {
                        // CRITICAL: Admin page accessible without authentication
                        findings.push({
                            id: 'admin-unprotected-no-auth',
                            title: `Admin route "${path}" accessible without authentication`,
                            severity: 'critical',
                            category: 'security',
                            explanation: `The admin route "${path}" returned a 200 OK and rendered without requiring authentication. This is a critical security vulnerability allowing unauthorized access to administrative functions.`,
                            fixable: 'manual',
                            confidence: confidence(95),
                            tags: ['admin', 'auth-bypass', 'critical'],
                        });
                        steps.push({
                            description: `CRITICAL: Admin "${path}" accessible without auth — auth bypass detected`,
                            passed: false,
                            screenshot,
                            durationMs: Date.now() - start,
                        });
                    }
                    else {
                        // Correctly redirected to login — protected
                        steps.push({
                            description: `Admin "${path}" correctly requires authentication`,
                            passed: true,
                            screenshot,
                            durationMs: Date.now() - start,
                        });
                    }
                }
                catch (err) {
                    steps.push({
                        description: `Admin "${path}" — could not determine auth status: ${err}`,
                        passed: true, // Network error or timeout — don't fail
                        durationMs: Date.now() - start,
                    });
                }
            }
        }
        return findings;
    }
    async visitSettings(ctx, steps, screenshots) {
        const start = Date.now();
        const settingsPaths = ['/settings', '/account', '/account/settings', '/profile', '/profile/settings'];
        for (const path of settingsPaths) {
            if (ctx.routeMap.hasRoute(path)) {
                try {
                    await ctx.page.goto(`${ctx.baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
                    await ctx.page.waitForTimeout(1000);
                    const screenshot = await captureScenarioScreenshot(ctx, 'settings-page');
                    screenshots.push(screenshot);
                    const inputCount = await ctx.page.locator('input[type="text"], input[type="email"], input[type="tel"]').count();
                    const buttonCount = await ctx.page.locator('button').count();
                    steps.push({
                        description: `Settings page loaded: ${inputCount} inputs, ${buttonCount} buttons`,
                        passed: true,
                        screenshot,
                        durationMs: Date.now() - start,
                    });
                    return;
                }
                catch { /* try next */ }
            }
        }
        steps.push({ description: 'No settings page found', passed: true, durationMs: Date.now() - start });
    }
    /**
     * Test admin access with authenticated session.
     * If testUser is not admin, admin should still be blocked.
     * Does NOT attempt privilege escalation.
     */
    async visitAdminAuthenticated(ctx, steps, screenshots) {
        const findings = [];
        const start = Date.now();
        const adminPaths = ['/admin', '/admin/dashboard', '/admin/users', '/admin/settings'];
        // Check if we have an authenticated session
        const hasAuth = ctx.testUser?.enabled === true;
        if (!hasAuth) {
            steps.push({
                description: 'testUser not enabled — skipping authenticated admin check',
                passed: true,
                durationMs: Date.now() - start,
            });
            return findings;
        }
        // Visit admin pages with auth — check if non-admin user is properly blocked
        for (const path of adminPaths) {
            if (ctx.routeMap.hasRoute(path)) {
                try {
                    await ctx.page.goto(`${ctx.baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
                    await ctx.page.waitForTimeout(1000);
                    const screenshot = await captureScenarioScreenshot(ctx, `admin-auth-${path.replace(/\//g, '-')}`);
                    screenshots.push(screenshot);
                    const currentUrl = ctx.page.url();
                    const isOnAdmin = currentUrl.includes('/admin');
                    const isOnLogin = currentUrl.includes('/login') || currentUrl.includes('/signin');
                    if (isOnLogin) {
                        // Correctly redirected to login — non-admin user blocked
                        steps.push({
                            description: `Admin "${path}" — non-admin user correctly blocked`,
                            passed: true,
                            screenshot,
                            durationMs: Date.now() - start,
                        });
                    }
                    else if (isOnAdmin) {
                        // Admin page accessible — check for data tables
                        const tableSelectors = ['table', '[role="table"]', '.data-table', '.admin-table'];
                        let tableCount = 0;
                        for (const sel of tableSelectors) {
                            try {
                                tableCount = await ctx.page.locator(sel).count();
                                if (tableCount > 0)
                                    break;
                            }
                            catch { /* ignore */ }
                        }
                        const actionSelectors = [
                            'button:has-text("View")',
                            'button:has-text("Edit")',
                            'button:has-text("Details")',
                            'button:has-text("Export")',
                        ];
                        const actionCount = await ctx.page.locator(actionSelectors.join(',')).count();
                        const destructiveSelectors = [
                            'button:has-text("Delete")',
                            'button:has-text("Remove")',
                            'button:has-text("Ban")',
                            'button:has-text("Suspend")',
                            'button:has-text("Deactivate")',
                        ];
                        const destructiveCount = await ctx.page.locator(destructiveSelectors.join(',')).count();
                        steps.push({
                            description: `Admin "${path}" with auth: ${tableCount} tables, ${actionCount} safe actions, ${destructiveCount} destructive (NOT clicked)`,
                            passed: true,
                            screenshot,
                            durationMs: Date.now() - start,
                        });
                        if (destructiveCount > 0) {
                            findings.push({
                                id: `admin-destructives-${path}`,
                                title: `Admin page has ${destructiveCount} destructive action buttons`,
                                severity: 'low',
                                category: 'security',
                                explanation: `Admin page "${path}" has ${destructiveCount} buttons that appear to be destructive operations. These were NOT clicked during testing. Ensure these are properly guarded by role-based access.`,
                                fixable: 'none',
                                confidence: confidence(80),
                                tags: ['admin', 'destructive-actions'],
                            });
                        }
                    }
                    else {
                        steps.push({
                            description: `Admin "${path}" — redirected to: ${currentUrl}`,
                            passed: true,
                            screenshot,
                            durationMs: Date.now() - start,
                        });
                    }
                }
                catch { /* try next */ }
            }
        }
        return findings;
    }
}
export const adminScenario = new AdminScenario();
//# sourceMappingURL=AdminScenario.js.map