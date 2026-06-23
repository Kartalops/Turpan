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
import { captureScenarioScreenshot } from './Scenario.js';
import { confidence } from '@turpan/core';
const SCENARIO_ID = 'responsive';
const SCENARIO_NAME = 'Responsive Layout Testing';
const VIEWPORTS = [
    { name: 'desktop', width: 1280, height: 800, device: 'desktop' },
    { name: 'tablet', width: 768, height: 1024, device: 'tablet' },
    { name: 'mobile', width: 375, height: 667, device: 'iPhone SE' },
    { name: 'mobile-large', width: 390, height: 844, device: 'iPhone 12' },
];
export class ResponsiveScenario {
    id = SCENARIO_ID;
    name = SCENARIO_NAME;
    riskLevel = 'safe';
    supports(_fp, routes) {
        return routes.hasRoute('/');
    }
    async run(ctx) {
        const steps = [];
        const findings = [];
        const screenshots = [];
        const start = Date.now();
        const originalViewport = ctx.viewport;
        try {
            for (const vp of VIEWPORTS) {
                const vpResult = await this.testViewport(ctx, vp, steps, screenshots, findings);
                screenshots.push(...vpResult.screenshots);
                steps.push(...vpResult.steps);
                findings.push(...vpResult.findings);
            }
        }
        finally {
            // Restore original viewport
            await ctx.page.setViewportSize({ width: originalViewport.width, height: originalViewport.height });
        }
        const hasCritical = findings.some(f => f.severity === 'critical');
        const passedCount = steps.filter(s => s.passed).length;
        return {
            scenarioId: this.id,
            scenarioName: this.name,
            status: hasCritical ? 'failed' : passedCount >= steps.length * 0.7 ? 'passed' : 'warn',
            durationMs: Date.now() - start,
            steps,
            findings,
            artifacts: { screenshots, traces: [] },
            finalUrl: ctx.page.url(),
        };
    }
    async testViewport(ctx, vp, steps, screenshots, findings) {
        const localScreenshots = [];
        const localSteps = [];
        const localFindings = [];
        const stepStart = Date.now();
        try {
            await ctx.page.setViewportSize({ width: vp.width, height: vp.height });
            await ctx.page.waitForTimeout(500);
            await ctx.page.goto(ctx.baseUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
            await ctx.page.waitForTimeout(1000);
            const screenshot = await captureScenarioScreenshot(ctx, `responsive-${vp.name}`);
            localScreenshots.push(screenshot);
            // Check horizontal overflow
            const overflowResult = await this.checkHorizontalOverflow(ctx, vp);
            if (overflowResult.overflowPx > 0) {
                localFindings.push({
                    id: `responsive-overflow-${vp.name}`,
                    title: `Horizontal overflow on ${vp.name} (${vp.width}px)`,
                    severity: overflowResult.overflowPx > 50 ? 'high' : 'medium',
                    category: 'responsive',
                    explanation: `Page has ${overflowResult.overflowPx}px of horizontal overflow at ${vp.width}×${vp.height} viewport. This forces horizontal scrolling and degrades mobile experience.`,
                    fixable: 'manual',
                    confidence: confidence(90),
                    tags: ['responsive', 'horizontal-overflow', vp.name],
                });
            }
            // Check mobile menu (hamburger)
            if (vp.name.startsWith('mobile')) {
                const hamburgerResult = await this.checkMobileMenu(ctx, localScreenshots);
                localSteps.push(hamburgerResult.step);
            }
            // Check touch targets
            const touchResult = await this.checkTouchTargets(ctx, vp);
            if (touchResult.smallTargets.length > 0) {
                localFindings.push({
                    id: `responsive-touch-${vp.name}`,
                    title: `${touchResult.smallTargets.length} touch targets below 44px on ${vp.name}`,
                    severity: 'medium',
                    category: 'accessibility',
                    explanation: `Found ${touchResult.smallTargets.length} interactive elements smaller than the WCAG 2.5.5 minimum (44×44px) on ${vp.name} viewport. These are difficult for users to tap accurately on touch devices. Affected elements: ${touchResult.smallTargets.join(', ')}`,
                    fixable: 'manual',
                    confidence: confidence(80),
                    tags: ['responsive', 'touch-target', 'accessibility', vp.name],
                });
            }
            localSteps.push({
                description: `Responsive check ${vp.name} (${vp.width}×${vp.height}): ${overflowResult.overflowPx}px overflow, ${touchResult.smallTargets.length} small targets`,
                passed: overflowResult.overflowPx === 0,
                screenshot,
                durationMs: Date.now() - stepStart,
            });
        }
        catch (err) {
            localSteps.push({ description: `Responsive check ${vp.name}: FAILED`, passed: false, error: String(err), durationMs: Date.now() - stepStart });
        }
        return { screenshots: localScreenshots, steps: localSteps, findings: localFindings };
    }
    async checkHorizontalOverflow(ctx, vp) {
        try {
            const overflow = await ctx.page.evaluate(() => {
                const docWidth = document.documentElement.scrollWidth;
                const winWidth = window.innerWidth;
                return Math.max(0, docWidth - winWidth);
            });
            return { overflowPx: overflow };
        }
        catch {
            return { overflowPx: 0 };
        }
    }
    async checkMobileMenu(ctx, screenshots) {
        const start = Date.now();
        const hamburgerSelectors = [
            'button[aria-label*="menu" i]',
            'button[aria-label*="Menu" i]',
            '[aria-label*="menu" i]',
            '.hamburger',
            '[class*="hamburger"]',
            '[class*="burger"]',
            'button:has-text("☰")',
            'button:has-text("≡")',
            '[data-testid="menu-button"]',
            '[data-testid="mobile-menu"]',
        ];
        for (const sel of hamburgerSelectors) {
            try {
                const count = await ctx.page.locator(sel).count();
                if (count > 0) {
                    await ctx.page.locator(sel).first().click({ timeout: 3000 });
                    await ctx.page.waitForTimeout(800);
                    const screenshot = await captureScenarioScreenshot(ctx, `mobile-menu-open`);
                    screenshots.push(screenshot);
                    // Check if nav menu appeared
                    const navVisible = await ctx.page.locator('nav, [role="navigation"], .mobile-nav, .nav-menu').first().isVisible({ timeout: 2000 }).catch(() => false);
                    return {
                        step: {
                            description: navVisible
                                ? `Mobile menu (hamburger) opens correctly`
                                : `Hamburger button found but menu may not be wired`,
                            passed: navVisible,
                            screenshot,
                            durationMs: Date.now() - start,
                        },
                    };
                }
            }
            catch { /* try next */ }
        }
        return {
            step: {
                description: 'No hamburger/mobile menu button found',
                passed: true, // May be intentional
                durationMs: Date.now() - start,
            },
        };
    }
    async checkTouchTargets(ctx, vp) {
        if (!vp.name.startsWith('mobile'))
            return { smallTargets: [] };
        try {
            const smallTargets = await ctx.page.evaluate(() => {
                const interactive = document.querySelectorAll('a, button, [role="button"], input, select, textarea');
                const below44 = [];
                interactive.forEach(el => {
                    const rect = el.getBoundingClientRect();
                    if (rect.width < 44 || rect.height < 44) {
                        const text = el.textContent?.trim().slice(0, 30) || el.getAttribute('aria-label')?.slice(0, 30) || el.tagName;
                        if (text && !below44.includes(text))
                            below44.push(text);
                    }
                });
                return below44;
            });
            return { smallTargets };
        }
        catch {
            return { smallTargets: [] };
        }
    }
}
export const responsiveScenario = new ResponsiveScenario();
//# sourceMappingURL=ResponsiveScenario.js.map