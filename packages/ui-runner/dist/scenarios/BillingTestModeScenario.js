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
import { captureScenarioScreenshot, detectFakeCheckout } from './Scenario.js';
import { confidence } from '@turpan/core';
const SCENARIO_ID = 'next-saas-billing-test-mode';
const SCENARIO_NAME = 'Billing Test Mode';
export class BillingTestModeScenario {
    id = SCENARIO_ID;
    name = SCENARIO_NAME;
    riskLevel = 'low';
    supports(fp, routes) {
        return (routes.hasRoute('/pricing') ||
            routes.hasRoute('/plans') ||
            routes.hasRoute('/billing') ||
            routes.hasRoute('/checkout') ||
            routes.hasRoute('/subscribe'));
    }
    async run(ctx) {
        const steps = [];
        const findings = [];
        const screenshots = [];
        const start = Date.now();
        const billingTestMode = ctx.billing?.testMode === true;
        // Step 1: Visit pricing page
        await this.visitPricingPage(ctx, steps, screenshots);
        // Step 2: Check pricing cards
        const cardFindings = await this.checkPricingCards(ctx, steps, screenshots);
        findings.push(...cardFindings);
        // Step 3: Report on checkout buttons (wiring status only)
        const checkoutFindings = await this.reportCheckoutWiring(ctx, steps, screenshots);
        findings.push(...checkoutFindings);
        // Step 4: If test mode enabled, attempt local test checkout
        if (billingTestMode) {
            const checkoutFindings = await this.testLocalCheckout(ctx, steps, screenshots);
            findings.push(...checkoutFindings);
        }
        else {
            steps.push({
                description: 'ui.billing.testMode=false — checkout NOT triggered (safety)',
                passed: true,
                durationMs: 0,
            });
        }
        // Step 5: Visit billing account (if accessible)
        await this.visitBillingAccount(ctx, steps, screenshots);
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
    async visitPricingPage(ctx, steps, screenshots) {
        const start = Date.now();
        const paths = ['/pricing', '/plans', '/subscribe'];
        for (const path of paths) {
            if (ctx.routeMap.hasRoute(path)) {
                try {
                    await ctx.page.goto(`${ctx.baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
                    await ctx.page.waitForTimeout(1000);
                    const screenshot = await captureScenarioScreenshot(ctx, 'billing-pricing-page');
                    screenshots.push(screenshot);
                    steps.push({ description: `Pricing page visited: ${path}`, passed: true, screenshot, durationMs: Date.now() - start });
                    return;
                }
                catch { /* try next */ }
            }
        }
        steps.push({ description: 'No dedicated pricing page found', passed: true, durationMs: Date.now() - start });
    }
    async checkPricingCards(ctx, steps, screenshots) {
        const findings = [];
        const start = Date.now();
        const cardSelectors = [
            '[data-plan]',
            '.pricing-card',
            '.plan-card',
            '[class*="pricing"]',
            '[class*="plan"]',
        ];
        let pricingTexts = [];
        for (const sel of cardSelectors) {
            try {
                const cards = await ctx.page.locator(sel).all();
                for (const card of cards.slice(0, 5)) {
                    const text = await card.textContent({ timeout: 2000 }).catch(() => '');
                    if (text && text.trim().length > 20) {
                        pricingTexts.push(text.trim().slice(0, 100));
                    }
                }
                if (pricingTexts.length > 0)
                    break;
            }
            catch { /* ignore */ }
        }
        const hasPrice = pricingTexts.some(t => /\$[\d,]+/.test(t) || /[\d,]+(?:USD|EUR|GBP)/i.test(t));
        const hasPlanNames = pricingTexts.some(t => /free|starter|pro|enterprise|team/i.test(t));
        const screenshot = await captureScenarioScreenshot(ctx, 'billing-pricing-cards');
        screenshots.push(screenshot);
        if (pricingTexts.length > 0) {
            steps.push({
                description: `Pricing cards found. Price visible: ${hasPrice}, Plan names: ${hasPlanNames}`,
                passed: hasPrice || hasPlanNames,
                screenshot,
                durationMs: Date.now() - start,
            });
        }
        else {
            findings.push({
                id: 'billing-no-pricing',
                title: 'Pricing information not found',
                severity: 'medium',
                category: 'billing',
                explanation: 'Could not detect pricing information on the pricing page.',
                fixable: 'manual',
                confidence: confidence(75),
                tags: ['billing', 'missing-content'],
            });
            steps.push({ description: 'No pricing cards found', passed: false, screenshot, durationMs: Date.now() - start });
        }
        return findings;
    }
    async reportCheckoutWiring(ctx, steps, screenshots) {
        const findings = [];
        const start = Date.now();
        const checkoutSelectors = [
            'button:has-text("Subscribe")',
            'button:has-text("Get Started")',
            'button:has-text("Start Free")',
            'button:has-text("Upgrade")',
            'button:has-text("Pay")',
            'button:has-text("Checkout")',
            'a:has-text("Subscribe")',
            'a:has-text("Get Started")',
        ];
        const wiringReports = [];
        for (const sel of checkoutSelectors) {
            try {
                const count = await ctx.page.locator(sel).count();
                if (count === 0)
                    continue;
                const { isFake, reason } = await detectFakeCheckout(ctx, sel);
                wiringReports.push(`${count}x "${sel}" → ${isFake ? `UNWIRED (${reason})` : 'wired'}`);
                if (isFake) {
                    findings.push({
                        id: `billing-unwired-checkout`,
                        title: `Checkout button appears unwired`,
                        severity: 'medium',
                        category: 'billing',
                        explanation: `Button "${sel}" ${reason}.`,
                        fixable: 'manual',
                        confidence: confidence(70),
                        tags: ['billing', 'unwired-button'],
                    });
                }
            }
            catch { /* ignore */ }
        }
        const screenshot = await captureScenarioScreenshot(ctx, 'billing-checkout-wiring');
        screenshots.push(screenshot);
        if (wiringReports.length > 0) {
            steps.push({
                description: `Checkout wiring: ${wiringReports.join('; ')}`,
                passed: findings.length === 0,
                screenshot,
                durationMs: Date.now() - start,
            });
        }
        else {
            steps.push({ description: 'No checkout buttons found', passed: true, durationMs: Date.now() - start });
        }
        return findings;
    }
    async testLocalCheckout(ctx, steps, screenshots) {
        const findings = [];
        const start = Date.now();
        // Use configured checkoutEndpoint if set, otherwise fall back to common paths
        const configuredEndpoint = ctx.billing?.checkoutEndpoint;
        const fallbackEndpoints = [
            '/api/test-checkout',
            '/api/billing/test-checkout',
            '/api/checkout/test',
        ];
        let availableEndpoint = null;
        if (configuredEndpoint) {
            // Use the explicitly configured endpoint
            availableEndpoint = configuredEndpoint.startsWith('/') ? configuredEndpoint : `/${configuredEndpoint}`;
        }
        else {
            // Fall back to auto-detect from route map
            availableEndpoint = fallbackEndpoints.find(ep => ctx.routeMap.hasRoute(ep)) ?? null;
        }
        if (!availableEndpoint) {
            steps.push({
                description: 'No local test checkout endpoint configured or found — reporting wiring only',
                passed: true,
                durationMs: Date.now() - start,
            });
            return findings;
        }
        // Safety: never call external payment processors
        const externalDomains = ['stripe.com', 'paypal.com', 'braintree.com', 'squareup.com', 'checkout.stripe.com'];
        if (externalDomains.some(d => availableEndpoint.includes(d))) {
            steps.push({
                description: 'External payment processor detected in endpoint — BLOCKED for safety',
                passed: false,
                durationMs: Date.now() - start,
            });
            return findings;
        }
        // Call local test endpoint
        try {
            const res = await ctx.page.evaluate(async (endpoint) => {
                const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
                let body = null;
                try {
                    body = await r.json();
                }
                catch { /* ignore */ }
                return { ok: r.ok, status: r.status, body };
            }, availableEndpoint);
            const screenshot = await captureScenarioScreenshot(ctx, 'billing-test-checkout-result');
            screenshots.push(screenshot);
            // Check for fake success indicators in response body
            const fakeIndicators = this.detectFakeCheckoutSuccess(res.body);
            if (fakeIndicators) {
                findings.push({
                    id: 'billing-fake-success',
                    title: 'Checkout endpoint returns fake success response',
                    severity: 'high',
                    category: 'billing',
                    explanation: `Checkout endpoint returned a response with fake/stub data: ${fakeIndicators}. This means the billing system is not properly wired to a real payment provider.`,
                    fixable: 'manual',
                    confidence: confidence(85),
                    tags: ['billing', 'fake-checkout'],
                });
            }
            if (res.ok) {
                steps.push({ description: `Local test checkout (${configuredEndpoint ? 'configured' : 'auto-detected'}) call succeeded (${res.status})${fakeIndicators ? ' — FAKE response detected' : ''}`, passed: !fakeIndicators, screenshot, durationMs: Date.now() - start });
            }
            else {
                steps.push({ description: `Local test checkout call returned ${res.status}`, passed: false, screenshot, durationMs: Date.now() - start });
            }
        }
        catch (err) {
            steps.push({ description: `Local test checkout call failed: ${err}`, passed: false, durationMs: Date.now() - start });
        }
        return findings;
    }
    detectFakeCheckoutSuccess(body) {
        if (!body || typeof body !== 'object')
            return null;
        const obj = body;
        // Check for fake subscription/payment IDs
        const fakePatterns = [
            { key: 'subscriptionId', pattern: /^(sub_fake|sub_test|test_)/ },
            { key: 'paymentIntent', pattern: /^(pi_fake|pi_test|test_)/ },
            { key: 'clientSecret', pattern: /^(secret_fake|secret_test|test_)/ },
            { key: 'sessionId', pattern: /^(cs_fake|cs_test|test_)/ },
            { key: 'id', pattern: /^(sub_fake|pi_fake|test_)/ },
        ];
        for (const { key, pattern } of fakePatterns) {
            const val = obj[key];
            if (typeof val === 'string' && pattern.test(val)) {
                return `field "${key}" = "${val.slice(0, 20)}..." matches fake pattern`;
            }
        }
        // Check for explicit fake flag
        if (obj['fake'] === true || obj['testMode'] === true || obj['isTest'] === true) {
            return `response contains test/fake flag`;
        }
        // Check for mock/placeholder text
        const str = JSON.stringify(obj).toLowerCase();
        if (/\bmock\b|\bplaceholder\b|\bfake\b|\bnot.?real\b/.test(str)) {
            return `response contains mock/placeholder text`;
        }
        return null;
    }
    async visitBillingAccount(ctx, steps, screenshots) {
        const start = Date.now();
        const paths = ['/billing', '/account/billing', '/settings/billing'];
        for (const path of paths) {
            if (ctx.routeMap.hasRoute(path)) {
                try {
                    await ctx.page.goto(`${ctx.baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
                    await ctx.page.waitForTimeout(800);
                    const screenshot = await captureScenarioScreenshot(ctx, 'billing-account-page');
                    screenshots.push(screenshot);
                    steps.push({ description: `Billing account page visited: ${path}`, passed: true, screenshot, durationMs: Date.now() - start });
                    return;
                }
                catch { /* try next */ }
            }
        }
        steps.push({ description: 'No billing account page found', passed: true, durationMs: Date.now() - start });
    }
}
export const billingTestModeScenario = new BillingTestModeScenario();
//# sourceMappingURL=BillingTestModeScenario.js.map