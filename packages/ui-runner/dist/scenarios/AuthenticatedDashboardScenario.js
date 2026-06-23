/**
 * AuthenticatedDashboardScenario — validates the authenticated dashboard.
 *
 * Flow:
 *  1. Visit dashboard (pre-authenticated via prior scenario or cookie)
 *  2. Verify meaningful content or empty-state
 *  3. Click safe navigation items
 *  4. Detect console/network errors
 *  5. Detect broken widgets/cards
 *  6. Capture desktop/mobile screenshots
 *
 * Safety: Does NOT create, modify, or delete any data.
 */
import { captureScenarioScreenshot, isAuthenticated } from './Scenario.js';
import { confidence } from '@turpan/core';
const SCENARIO_ID = 'next-saas-dashboard-empty';
const SCENARIO_NAME = 'Dashboard Authenticated';
export class AuthenticatedDashboardScenario {
    id = SCENARIO_ID;
    name = SCENARIO_NAME;
    riskLevel = 'safe';
    supports(fp, routes) {
        return (routes.hasRoute('/dashboard') ||
            routes.hasRoute('/home') ||
            routes.hasRoute('/overview') ||
            routes.hasRoute('/app'));
    }
    async run(ctx) {
        const steps = [];
        const findings = [];
        const screenshots = [];
        const start = Date.now();
        // Step 1: Visit dashboard
        await this.visitDashboard(ctx, steps, screenshots);
        // Step 2: Check auth state
        const authed = await isAuthenticated(ctx);
        if (!authed) {
            steps.push({
                description: 'Dashboard requires authentication — skipping authenticated checks',
                passed: false,
                durationMs: Date.now() - start,
            });
            return {
                scenarioId: this.id,
                scenarioName: this.name,
                status: 'skipped',
                durationMs: Date.now() - start,
                steps,
                findings,
                artifacts: { screenshots, traces: [] },
                finalUrl: ctx.page.url(),
                skippedReason: 'Not authenticated — set testUser.enabled=true to run authenticated scenarios',
            };
        }
        // Step 3: Check meaningful content or empty state
        const contentFindings = await this.checkMeaningfulContent(ctx, steps, screenshots);
        findings.push(...contentFindings);
        // Step 4: Click safe navigation items
        const navFindings = await this.clickSafeNavItems(ctx, steps, screenshots);
        findings.push(...navFindings);
        // Step 5: Detect console/network errors
        await this.checkForErrors(ctx, steps);
        // Step 6: Detect broken widgets
        const widgetFindings = await this.checkWidgets(ctx, steps, screenshots);
        findings.push(...widgetFindings);
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
        const paths = ['/dashboard', '/home', '/overview', '/app'];
        for (const path of paths) {
            if (ctx.routeMap.hasRoute(path)) {
                try {
                    await ctx.page.goto(`${ctx.baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
                    await ctx.page.waitForTimeout(1500);
                    const screenshot = await captureScenarioScreenshot(ctx, 'dashboard-auth');
                    screenshots.push(screenshot);
                    steps.push({ description: `Dashboard visited: ${path}`, passed: true, screenshot, durationMs: Date.now() - start });
                    return;
                }
                catch { /* try next */ }
            }
        }
        // Fallback to root
        await ctx.page.goto(ctx.baseUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        const screenshot = await captureScenarioScreenshot(ctx, 'dashboard-root');
        screenshots.push(screenshot);
        steps.push({ description: 'Dashboard fallback to root', passed: true, screenshot, durationMs: Date.now() - start });
    }
    async checkMeaningfulContent(ctx, steps, screenshots) {
        const findings = [];
        const start = Date.now();
        const bodyText = await ctx.page.evaluate(() => document.body?.innerText ?? '');
        const isBlank = bodyText.trim().length < 30;
        const screenshot = await captureScenarioScreenshot(ctx, 'dashboard-content-check');
        screenshots.push(screenshot);
        if (isBlank) {
            findings.push({
                id: 'dash-blank-content',
                title: 'Dashboard appears blank or has no meaningful content',
                severity: 'medium',
                category: 'ui',
                explanation: 'The dashboard page has very little visible text content. This could indicate a loading issue, empty state, or broken rendering.',
                fixable: 'manual',
                confidence: confidence(75),
                tags: ['dashboard', 'empty', 'content'],
            });
            steps.push({ description: 'Dashboard appears blank or minimal', passed: false, screenshot, durationMs: Date.now() - start });
        }
        else {
            steps.push({ description: 'Dashboard has meaningful content', passed: true, screenshot, durationMs: Date.now() - start });
        }
        return findings;
    }
    async clickSafeNavItems(ctx, steps, screenshots) {
        const findings = [];
        const start = Date.now();
        const navSelectors = [
            '[role="navigation"] a',
            'nav a',
            '.sidebar a',
            '[class*="nav"] a',
        ];
        let navLinks = [];
        for (const sel of navSelectors) {
            try {
                const links = await ctx.page.locator(sel).all();
                for (const link of links.slice(0, 5)) {
                    const text = (await link.textContent({ timeout: 1000 }).catch(() => '')) ?? '';
                    const href = await link.getAttribute('href').catch(() => '');
                    if (text.trim() && href) {
                        navLinks.push(`${text.trim()} -> ${href}`);
                    }
                }
                if (navLinks.length > 0)
                    break;
            }
            catch { /* ignore */ }
        }
        if (navLinks.length === 0) {
            steps.push({ description: 'No navigation links found to click', passed: true, durationMs: Date.now() - start });
            return findings;
        }
        // Click first safe nav item (exclude logout, delete, etc.)
        const safeKeywords = ['home', 'dashboard', 'overview', 'settings', 'profile', 'account', 'help', 'docs'];
        const unsafeKeywords = ['logout', 'sign out', 'delete', 'remove', 'cancel', 'destroy'];
        let clicked = false;
        for (const navText of navLinks) {
            const lower = navText.toLowerCase();
            const isSafe = safeKeywords.some(k => lower.includes(k)) && !unsafeKeywords.some(k => lower.includes(k));
            if (!isSafe)
                continue;
            const href = navText.split(' -> ').pop() ?? '';
            if (!href || href === '#')
                continue;
            try {
                await ctx.page.goto(`${ctx.baseUrl}${href.startsWith('/') ? '' : '/'}${href}`, { waitUntil: 'domcontentloaded', timeout: 10_000 });
                await ctx.page.waitForTimeout(800);
                const screenshot = await captureScenarioScreenshot(ctx, `dashboard-nav-${navText.split(' ')[0]}`);
                screenshots.push(screenshot);
                steps.push({ description: `Clicked nav: "${navText.split(' -> ')[0]}"`, passed: true, screenshot, durationMs: Date.now() - start });
                clicked = true;
                // Navigate back to dashboard
                await this.visitDashboard(ctx, steps, screenshots);
                break;
            }
            catch { /* try next */ }
        }
        if (!clicked) {
            steps.push({ description: 'No safe navigation items to click', passed: true, durationMs: Date.now() - start });
        }
        return findings;
    }
    async checkForErrors(ctx, steps) {
        const start = Date.now();
        const consoleErrors = ctx.consoleErrors.filter(e => typeof e === 'string' && !e.includes('favicon') && !e.includes('preload'));
        const networkErrors = ctx.networkErrors.filter(e => e.status >= 400);
        if (consoleErrors.length > 0) {
            steps.push({ description: `Console errors detected: ${consoleErrors.length}`, passed: false, durationMs: Date.now() - start });
        }
        else {
            steps.push({ description: 'No console errors on dashboard', passed: true, durationMs: Date.now() - start });
        }
        if (networkErrors.length > 0) {
            steps.push({ description: `Network errors detected: ${networkErrors.length}`, passed: false, durationMs: Date.now() - start });
        }
        else {
            steps.push({ description: 'No network errors on dashboard', passed: true, durationMs: Date.now() - start });
        }
    }
    async checkWidgets(ctx, steps, screenshots) {
        const findings = [];
        const start = Date.now();
        const brokenSelectors = [
            '[class*="broken"]',
            '[class*="error"]',
            '[data-state="error"]',
            '[aria-invalid="true"]',
            '.widget-error',
        ];
        let brokenCount = 0;
        for (const sel of brokenSelectors) {
            try {
                brokenCount += await ctx.page.locator(sel).count();
            }
            catch { /* ignore */ }
        }
        const widgetSelectors = [
            '[data-widget]',
            '[class*="widget"]',
            '[class*="card"]',
            '[role="region"]',
            'article',
        ];
        let widgetCount = 0;
        for (const sel of widgetSelectors) {
            try {
                widgetCount = await ctx.page.locator(sel).count();
                if (widgetCount > 0)
                    break;
            }
            catch { /* ignore */ }
        }
        const screenshot = await captureScenarioScreenshot(ctx, 'dashboard-widgets-check');
        screenshots.push(screenshot);
        if (brokenCount > 0) {
            findings.push({
                id: 'dash-broken-widgets',
                title: `Dashboard has ${brokenCount} broken/errored widget(s)`,
                severity: 'medium',
                category: 'ui',
                explanation: `Detected elements marked as broken or in error state. These may indicate failed data fetches or component errors.`,
                fixable: 'manual',
                confidence: confidence(70),
                tags: ['dashboard', 'broken-widget'],
            });
            steps.push({ description: `${brokenCount} broken widget(s) found`, passed: false, screenshot, durationMs: Date.now() - start });
        }
        else if (widgetCount > 0) {
            steps.push({ description: `Dashboard has ${widgetCount} widget(s)`, passed: true, screenshot, durationMs: Date.now() - start });
        }
        else {
            findings.push({
                id: 'dash-no-widgets',
                title: 'Dashboard has no visible widgets',
                severity: 'low',
                category: 'ui',
                explanation: 'No widget, card, or region elements found on the dashboard.',
                fixable: 'none',
                confidence: confidence(60),
                tags: ['dashboard', 'empty'],
            });
            steps.push({ description: 'No widgets found on dashboard', passed: true, screenshot, durationMs: Date.now() - start });
        }
        return findings;
    }
}
export const authenticatedDashboardScenario = new AuthenticatedDashboardScenario();
//# sourceMappingURL=AuthenticatedDashboardScenario.js.map