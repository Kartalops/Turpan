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
import { captureScenarioScreenshot, isAuthenticated } from './Scenario.js';
import { confidence } from '@turpan/core';
const SCENARIO_ID = 'dashboard';
const SCENARIO_NAME = 'Dashboard Experience';
export class DashboardScenario {
    id = SCENARIO_ID;
    name = SCENARIO_NAME;
    riskLevel = 'safe';
    supports(fp, routes) {
        return (routes.hasRoute('/dashboard') ||
            routes.hasRoute('/app') ||
            routes.hasRoute('/home') ||
            routes.hasRoute('/overview') ||
            routes.hasRoute('/app/dashboard'));
    }
    async run(ctx) {
        const steps = [];
        const findings = [];
        const screenshots = [];
        const start = Date.now();
        try {
            // Step 1: Visit dashboard
            await this.visitDashboard(ctx, steps, screenshots);
            // Step 2: Check sidebar
            const sidebarFindings = await this.checkSidebar(ctx, steps, screenshots);
            findings.push(...sidebarFindings);
            // Step 3: Check widgets and data
            const widgetFindings = await this.checkWidgets(ctx, steps, screenshots);
            findings.push(...widgetFindings);
            // Step 4: Check interactive elements
            await this.checkInteractiveWidgets(ctx, steps, screenshots);
            // Step 5: Check user menu
            await this.checkUserMenu(ctx, steps, screenshots);
            // Step 6: Check notifications
            await this.checkNotifications(ctx, steps, screenshots);
        }
        catch (err) {
            steps.push({ description: 'Unexpected error in dashboard scenario', passed: false, error: String(err), durationMs: Date.now() - start });
        }
        const allPassed = steps.every(s => s.passed);
        return {
            scenarioId: this.id,
            scenarioName: this.name,
            status: allPassed ? 'passed' : 'warn',
            durationMs: Date.now() - start,
            steps,
            findings,
            artifacts: { screenshots, traces: [] },
            finalUrl: ctx.page.url(),
        };
    }
    async visitDashboard(ctx, steps, screenshots) {
        const start = Date.now();
        const dashboardPaths = ['/dashboard', '/app', '/overview', '/app/dashboard', '/'];
        for (const path of dashboardPaths) {
            if (ctx.routeMap.hasRoute(path) || path === '/') {
                try {
                    const url = `${ctx.baseUrl}${path === '/' ? '' : path}`;
                    await ctx.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
                    await ctx.page.waitForTimeout(1500);
                    const screenshot = await captureScenarioScreenshot(ctx, 'dashboard');
                    screenshots.push(screenshot);
                    const authed = await isAuthenticated(ctx);
                    steps.push({ description: `Dashboard loaded (authenticated: ${authed})`, passed: true, screenshot, durationMs: Date.now() - start });
                    return;
                }
                catch { /* try next */ }
            }
        }
        steps.push({ description: 'Dashboard page not found', passed: false, durationMs: Date.now() - start });
    }
    async checkSidebar(ctx, steps, screenshots) {
        const findings = [];
        const start = Date.now();
        const sidebarSelectors = [
            '[data-testid="sidebar"]',
            'aside',
            '[role="navigation"]',
            '.sidebar',
            '.nav-sidebar',
            '[class*="sidebar"]',
            '[class*="side-nav"]',
        ];
        let sidebarSel = null;
        for (const sel of sidebarSelectors) {
            try {
                if (await ctx.page.locator(sel).first().isVisible({ timeout: 2000 })) {
                    sidebarSel = sel;
                    break;
                }
            }
            catch { /* ignore */ }
        }
        if (!sidebarSel) {
            findings.push({
                id: 'dash-no-sidebar',
                title: 'Dashboard has no visible sidebar',
                severity: 'low',
                category: 'ui',
                explanation: 'No sidebar navigation found. This may be intentional for mobile-first designs.',
                fixable: 'none',
                confidence: confidence(60),
                tags: ['dashboard', 'ui'],
            });
            steps.push({ description: 'No sidebar found', passed: true, durationMs: Date.now() - start });
            return findings;
        }
        // Count nav items
        const navLinks = await ctx.page.locator(`${sidebarSel} a[href], ${sidebarSel} button`).count();
        const screenshot = await captureScenarioScreenshot(ctx, 'dashboard-sidebar');
        screenshots.push(screenshot);
        steps.push({
            description: `Sidebar found with ${navLinks} navigation items`,
            passed: navLinks > 0,
            screenshot,
            durationMs: Date.now() - start,
        });
        return findings;
    }
    async checkWidgets(ctx, steps, screenshots) {
        const findings = [];
        const start = Date.now();
        const widgetSelectors = [
            '[data-widget]',
            '[class*="widget"]',
            '[class*="card"]',
            '[data-testid*="widget"]',
            '[role="region"]',
            'article',
        ];
        const chartSelectors = [
            'canvas',
            'svg',
            '[class*="chart"]',
            '[class*="graph"]',
            '[data-testid*="chart"]',
            '.recharts-wrapper',
            '.apexcharts',
        ];
        let widgetCount = 0;
        for (const sel of widgetSelectors) {
            try {
                const n = await ctx.page.locator(sel).count();
                if (n > widgetCount)
                    widgetCount = n;
            }
            catch { /* ignore */ }
        }
        let chartCount = 0;
        for (const sel of chartSelectors) {
            try {
                chartCount = await ctx.page.locator(sel).count();
                if (chartCount > 0)
                    break;
            }
            catch { /* ignore */ }
        }
        if (widgetCount > 0) {
            const screenshot = await captureScenarioScreenshot(ctx, 'dashboard-widgets');
            screenshots.push(screenshot);
            steps.push({
                description: `Found ${widgetCount} widget(s), ${chartCount} chart(s)`,
                passed: true,
                screenshot,
                durationMs: Date.now() - start,
            });
        }
        else {
            findings.push({
                id: 'dash-no-widgets',
                title: 'Dashboard has no visible widgets or content',
                severity: 'medium',
                category: 'ui',
                explanation: 'The dashboard appears to be empty. Users expect data widgets, metrics, or charts.',
                fixable: 'manual',
                confidence: confidence(75),
                tags: ['dashboard', 'empty'],
            });
            steps.push({ description: 'No widgets found on dashboard', passed: false, durationMs: Date.now() - start });
        }
        return findings;
    }
    async checkInteractiveWidgets(ctx, steps, screenshots) {
        const start = Date.now();
        const interactiveSelectors = [
            'select',
            '[role="combobox"]',
            '[role="listbox"]',
            'input[type="date"]',
            '[placeholder*="date" i]',
            '[data-testid*="filter"]',
            'button:has-text("Filter")',
            'button:has-text("Refresh")',
            'button:has-text("Export")',
        ];
        const interactive = [];
        for (const sel of interactiveSelectors) {
            try {
                const count = await ctx.page.locator(sel).count();
                if (count > 0)
                    interactive.push(`${count}x ${sel}`);
            }
            catch { /* ignore */ }
        }
        if (interactive.length > 0) {
            const screenshot = await captureScenarioScreenshot(ctx, 'dashboard-interactive');
            screenshots.push(screenshot);
            steps.push({ description: `Interactive elements found: ${interactive.slice(0, 3).join(', ')}`, passed: true, screenshot, durationMs: Date.now() - start });
        }
        else {
            steps.push({ description: 'No interactive widgets (filters, date pickers) found', passed: true, durationMs: Date.now() - start });
        }
    }
    async checkUserMenu(ctx, steps, screenshots) {
        const start = Date.now();
        const userMenuSelectors = [
            '[data-testid="user-menu"]',
            '[data-testid="user-avatar"]',
            'button:has-text("User")',
            'button:has-text("Account")',
            '[aria-label*="user" i]',
            '[class*="user-menu"]',
            '[class*="avatar"]',
        ];
        for (const sel of userMenuSelectors) {
            try {
                const count = await ctx.page.locator(sel).count();
                if (count > 0) {
                    await ctx.page.locator(sel).first().click({ timeout: 3000 });
                    await ctx.page.waitForTimeout(800);
                    const screenshot = await captureScenarioScreenshot(ctx, 'user-menu-open');
                    screenshots.push(screenshot);
                    // Check dropdown items
                    const dropdownItems = await ctx.page.locator('[role="menuitem"], [role="menu"] a, .dropdown-item').count();
                    steps.push({
                        description: `User menu opened with ${dropdownItems} items`,
                        passed: true,
                        screenshot,
                        durationMs: Date.now() - start,
                    });
                    // Close dropdown
                    await ctx.page.keyboard.press('Escape');
                    return;
                }
            }
            catch { /* ignore */ }
        }
        steps.push({ description: 'No user menu found', passed: true, durationMs: Date.now() - start });
    }
    async checkNotifications(ctx, steps, screenshots) {
        const start = Date.now();
        const notifSelectors = [
            '[data-testid="notifications"]',
            'button:has-text("Notification")',
            '[aria-label*="notification" i]',
            '[class*="notification"]',
            '.notification-bell',
        ];
        for (const sel of notifSelectors) {
            try {
                const count = await ctx.page.locator(sel).count();
                if (count > 0) {
                    await ctx.page.locator(sel).first().click({ timeout: 3000 });
                    await ctx.page.waitForTimeout(800);
                    const screenshot = await captureScenarioScreenshot(ctx, 'notifications');
                    screenshots.push(screenshot);
                    steps.push({ description: 'Notifications panel accessible', passed: true, screenshot, durationMs: Date.now() - start });
                    await ctx.page.keyboard.press('Escape');
                    return;
                }
            }
            catch { /* ignore */ }
        }
        steps.push({ description: 'No notifications panel found', passed: true, durationMs: Date.now() - start });
    }
}
export const dashboardScenario = new DashboardScenario();
//# sourceMappingURL=DashboardScenario.js.map