/**
 * SettingsScenario — validates settings/account pages in authenticated mode.
 *
 * Safety guarantees:
 * - Inspects forms without submitting destructive changes
 * - Dry-run form fill for safe profile forms (no actual save)
 * - Detects no-op save buttons
 * - NEVER modifies user data
 */
import { captureScenarioScreenshot, detectNoOpButton } from './Scenario.js';
import { confidence } from '@turpan/core';
const SCENARIO_ID = 'next-saas-settings-noop-save';
const SCENARIO_NAME = 'Settings & Account';
export class SettingsScenario {
    id = SCENARIO_ID;
    name = SCENARIO_NAME;
    riskLevel = 'safe';
    supports(fp, routes) {
        return (routes.hasRoute('/settings') ||
            routes.hasRoute('/account') ||
            routes.hasRoute('/profile') ||
            routes.hasRoute('/account/settings'));
    }
    async run(ctx) {
        const steps = [];
        const findings = [];
        const screenshots = [];
        const start = Date.now();
        // Step 1: Visit settings page
        await this.visitSettings(ctx, steps, screenshots);
        // Step 2: Inspect forms
        const formFindings = await this.inspectForms(ctx, steps, screenshots);
        findings.push(...formFindings);
        // Step 3: Detect no-op save buttons
        const noopFindings = await this.detectNoOpSave(ctx, steps, screenshots);
        findings.push(...noopFindings);
        // Step 4: Check for destructive settings
        const destructiveFindings = await this.checkDestructiveSettings(ctx, steps, screenshots);
        findings.push(...destructiveFindings);
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
    async visitSettings(ctx, steps, screenshots) {
        const start = Date.now();
        const paths = ['/settings', '/account', '/profile', '/account/settings'];
        for (const path of paths) {
            if (ctx.routeMap.hasRoute(path)) {
                try {
                    await ctx.page.goto(`${ctx.baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
                    await ctx.page.waitForTimeout(1000);
                    const screenshot = await captureScenarioScreenshot(ctx, 'settings-page');
                    screenshots.push(screenshot);
                    steps.push({ description: `Settings page visited: ${path}`, passed: true, screenshot, durationMs: Date.now() - start });
                    return;
                }
                catch { /* try next */ }
            }
        }
        steps.push({ description: 'Settings page not found in routes', passed: true, durationMs: Date.now() - start });
    }
    async inspectForms(ctx, steps, screenshots) {
        const findings = [];
        const start = Date.now();
        const formSelectors = ['form', '[role="form"]', '.settings-form'];
        let formCount = 0;
        for (const sel of formSelectors) {
            try {
                formCount = await ctx.page.locator(sel).count();
                if (formCount > 0)
                    break;
            }
            catch { /* ignore */ }
        }
        // Inspect form fields
        const fieldTypes = [
            { name: 'text inputs', sel: 'input[type="text"], input:not([type])' },
            { name: 'email inputs', sel: 'input[type="email"]' },
            { name: 'password inputs', sel: 'input[type="password"]' },
            { name: 'checkboxes', sel: 'input[type="checkbox"]' },
            { name: 'selects', sel: 'select' },
        ];
        const foundFields = [];
        for (const ft of fieldTypes) {
            try {
                const count = await ctx.page.locator(ft.sel).count();
                if (count > 0)
                    foundFields.push(`${count}x ${ft.name}`);
            }
            catch { /* ignore */ }
        }
        const screenshot = await captureScenarioScreenshot(ctx, 'settings-forms');
        screenshots.push(screenshot);
        if (formCount > 0) {
            steps.push({
                description: `Settings forms: ${formCount} form(s). Fields: ${foundFields.join(', ') || 'none'}`,
                passed: true,
                screenshot,
                durationMs: Date.now() - start,
            });
        }
        else {
            findings.push({
                id: 'settings-no-forms',
                title: 'Settings page has no forms',
                severity: 'low',
                category: 'ui',
                explanation: 'No forms found on the settings page. This may be intentional for display-only settings.',
                fixable: 'none',
                confidence: confidence(60),
                tags: ['settings', 'form'],
            });
            steps.push({ description: 'No forms found on settings page', passed: true, screenshot, durationMs: Date.now() - start });
        }
        return findings;
    }
    async detectNoOpSave(ctx, steps, screenshots) {
        const findings = [];
        const start = Date.now();
        const saveSelectors = [
            'button:has-text("Save")',
            'button:has-text("Update")',
            'button:has-text("Save Changes")',
            'button:has-text("Update Settings")',
            'input[type="submit"]',
        ];
        for (const sel of saveSelectors) {
            try {
                const count = await ctx.page.locator(sel).count();
                if (count === 0)
                    continue;
                const { isNoOp, reason } = await detectNoOpButton(ctx, sel);
                const screenshot = await captureScenarioScreenshot(ctx, 'settings-save-button');
                screenshots.push(screenshot);
                if (isNoOp) {
                    findings.push({
                        id: 'settings-noop-save',
                        title: 'Save button appears to be a no-op',
                        severity: 'medium',
                        category: 'ui',
                        explanation: `Save button detected as no-op: ${reason}. Clicking it causes no URL or DOM change.`,
                        fixable: 'manual',
                        confidence: confidence(70),
                        tags: ['settings', 'broken-button'],
                    });
                    steps.push({ description: `Save button: no-op detected (${reason})`, passed: false, screenshot, durationMs: Date.now() - start });
                }
                else {
                    steps.push({ description: 'Save button appears wired', passed: true, screenshot, durationMs: Date.now() - start });
                }
                return findings;
            }
            catch { /* ignore */ }
        }
        steps.push({ description: 'No save button found', passed: true, durationMs: Date.now() - start });
        return findings;
    }
    async checkDestructiveSettings(ctx, steps, screenshots) {
        const findings = [];
        const start = Date.now();
        const destructiveSelectors = [
            'button:has-text("Delete")',
            'button:has-text("Remove")',
            'button:has-text("Cancel Account")',
            'button:has-text("Close Account")',
            'button:has-text("Purge")',
            'a:has-text("Delete")',
            '[data-testid*="delete"]',
        ];
        const destructiveFound = [];
        for (const sel of destructiveSelectors) {
            try {
                const count = await ctx.page.locator(sel).count();
                if (count > 0) {
                    const text = await ctx.page.locator(sel).first().textContent({ timeout: 1000 }).catch(() => sel);
                    destructiveFound.push(text?.trim() ?? sel);
                }
            }
            catch { /* ignore */ }
        }
        const screenshot = await captureScenarioScreenshot(ctx, 'settings-destructive-check');
        screenshots.push(screenshot);
        if (destructiveFound.length > 0) {
            steps.push({
                description: `Destructive settings detected (NOT clicked): ${destructiveFound.join(', ')}`,
                passed: true, // We detect but do NOT click
                screenshot,
                durationMs: Date.now() - start,
            });
        }
        else {
            steps.push({ description: 'No destructive settings found', passed: true, screenshot, durationMs: Date.now() - start });
        }
        return findings;
    }
}
export const settingsScenario = new SettingsScenario();
//# sourceMappingURL=SettingsScenario.js.map