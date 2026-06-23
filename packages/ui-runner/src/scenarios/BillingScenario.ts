/**
 * BillingScenario — validates billing and pricing UI without making real payments.
 *
 * Safety guarantees:
 * - NO real credit card entry
 * - NO real payment submission
 * - No checkout flow completion
 * - Validates only that pricing pages render and buttons are visible
 * - Detects broken/unwired checkout buttons
 */

import type { Scenario, ScenarioContext, ScenarioResult, ScenarioStep, ScenarioFinding, ScenarioRouteMap } from './Scenario.js';
import { captureScenarioScreenshot, SAFE_TEST_CREDENTIALS } from './Scenario.js';
import { detectFakeCheckout } from './Scenario.js';
import type { ProjectFingerprint } from '@turpan/core';
import { confidence } from '@turpan/core';

const SCENARIO_ID = 'billing';
const SCENARIO_NAME = 'Billing & Pricing';

export class BillingScenario implements Scenario {
  readonly id = SCENARIO_ID;
  readonly name = SCENARIO_NAME;
  readonly riskLevel = 'low' as const;

  supports(fp: ProjectFingerprint, routes: ScenarioRouteMap): boolean {
    return (
      routes.hasRoute('/pricing') ||
      routes.hasRoute('/plans') ||
      routes.hasRoute('/billing') ||
      routes.hasRoute('/checkout') ||
      routes.hasRoute('/subscribe')
    );
  }

  async run(ctx: ScenarioContext): Promise<ScenarioResult> {
    const steps: ScenarioStep[] = [];
    const findings: ScenarioFinding[] = [];
    const screenshots: string[] = [];
    const start = Date.now();

    try {
      // Step 1: Visit pricing page
      await this.visitPricingPage(ctx, steps, screenshots);

      // Step 2: Check pricing cards
      const cardFindings = await this.checkPricingCards(ctx, steps, screenshots);
      findings.push(...cardFindings);

      // Step 3: Check plan comparison table
      await this.checkComparisonTable(ctx, steps, screenshots);

      // Step 4: Detect broken checkout buttons
      const checkoutFindings = await this.checkCheckoutButtons(ctx, steps, screenshots);
      findings.push(...checkoutFindings);

      // Step 5: Billing account page (if logged in)
      await this.visitBillingAccount(ctx, steps, screenshots);

    } catch (err) {
      steps.push({ description: 'Unexpected error in billing scenario', passed: false, error: String(err), durationMs: Date.now() - start });
    }

    return {
      scenarioId: this.id,
      scenarioName: this.name,
      status: findings.some(f => f.severity === 'critical') ? 'failed' : steps.every(s => s.passed) ? 'passed' : 'warn',
      durationMs: Date.now() - start,
      steps,
      findings,
      artifacts: { screenshots, traces: [] },
      finalUrl: ctx.page.url(),
    };
  }

  private async visitPricingPage(ctx: ScenarioContext, steps: ScenarioStep[], screenshots: string[]): Promise<void> {
    const start = Date.now();
    const pricingPaths = ['/pricing', '/plans', '/plan', '/subscribe'];

    for (const path of pricingPaths) {
      if (ctx.routeMap.hasRoute(path)) {
        try {
          await ctx.page.goto(`${ctx.baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
          await ctx.page.waitForTimeout(1000);
          const screenshot = await captureScenarioScreenshot(ctx, 'pricing-page');
          screenshots.push(screenshot);
          steps.push({ description: `Pricing page loaded: ${path}`, passed: true, screenshot, durationMs: Date.now() - start });
          return;
        } catch { /* try next */ }
      }
    }

    steps.push({ description: 'No dedicated pricing page found', passed: true, durationMs: Date.now() - start });
  }

  private async checkPricingCards(ctx: ScenarioContext, steps: ScenarioStep[], screenshots: string[]): Promise<ScenarioFinding[]> {
    const findings: ScenarioFinding[] = [];
    const start = Date.now();

    const cardSelectors = [
      '[data-plan]',
      '.pricing-card',
      '.plan-card',
      '.price-card',
      '[class*="pricing"]',
      '[class*="plan"]',
      'section li',
    ];

    const pricingTexts: string[] = [];
    for (const sel of cardSelectors) {
      try {
        const cards = await ctx.page.locator(sel).all();
        for (const card of cards.slice(0, 5)) {
          const text = await card.textContent({ timeout: 2000 }).catch(() => '');
          if (text && text.trim().length > 20) {
            pricingTexts.push(text.trim().slice(0, 100));
          }
        }
        if (pricingTexts.length > 0) break;
      } catch { /* ignore */ }
    }

    const hasPrice = pricingTexts.some(t => /\$[\d,]+/.test(t) || /[\d,]+(?:USD|EUR|GBP)/i.test(t));
    const hasPlanNames = pricingTexts.some(t => /free|starter|pro|enterprise|team/i.test(t));

    if (pricingTexts.length > 0) {
      steps.push({
        description: `Pricing cards found (${pricingTexts.length} items). Price visible: ${hasPrice}, Plan names: ${hasPlanNames}`,
        passed: hasPrice || hasPlanNames,
        durationMs: Date.now() - start,
      });
    } else {
      findings.push({
        id: 'billing-no-pricing',
        title: 'Pricing information not found',
        severity: 'medium',
        category: 'billing',
        explanation: 'Could not detect any pricing information on the pricing page. Users need clear pricing to convert.',
        fixable: 'manual',
        confidence: confidence(75),
        tags: ['billing', 'missing-content'],
      });
      steps.push({ description: 'No pricing cards found', passed: false, durationMs: Date.now() - start });
    }

    return findings;
  }

  private async checkComparisonTable(ctx: ScenarioContext, steps: ScenarioStep[], screenshots: string[]): Promise<void> {
    const start = Date.now();

    const tableSelectors = ['table', '[role="table"]', '.comparison-table', '.features-table'];

    for (const sel of tableSelectors) {
      try {
        const count = await ctx.page.locator(sel).count();
        if (count > 0) {
          const screenshot = await captureScenarioScreenshot(ctx, 'comparison-table');
          screenshots.push(screenshot);
          steps.push({ description: 'Plan comparison table found', passed: true, screenshot, durationMs: Date.now() - start });
          return;
        }
      } catch { /* ignore */ }
    }

    steps.push({ description: 'No comparison table found (optional)', passed: true, durationMs: Date.now() - start });
  }

  private async checkCheckoutButtons(ctx: ScenarioContext, steps: ScenarioStep[], screenshots: string[]): Promise<ScenarioFinding[]> {
    const findings: ScenarioFinding[] = [];
    const start = Date.now();

    const checkoutSelectors = [
      'button:has-text("Subscribe")',
      'button:has-text("Get Started")',
      'button:has-text("Start Free")',
      'button:has-text("Upgrade")',
      'a:has-text("Subscribe")',
      'a:has-text("Get Started")',
      '[role="button"]:has-text("Start")',
      'button:has-text("Buy")',
    ];

    const paymentSelectors = [
      'button:has-text("Pay")',
      'button:has-text("Pay Now")',
      'button:has-text("Checkout")',
      'button:has-text("Purchase")',
      'a:has-text("Checkout")',
      'a:has-text("Pay")',
    ];

    // Check if payment buttons are real (wired)
    for (const sel of paymentSelectors) {
      try {
        const count = await ctx.page.locator(sel).count();
        if (count > 0) {
          const check = await detectFakeCheckout(ctx, sel);
          if (check.isFake) {
            findings.push({
              id: 'billing-unwired-checkout',
              title: 'Payment/checkout button may not be wired',
              severity: 'medium',
              category: 'billing',
              explanation: `Button matching "${sel}" appears to not be wired: ${check.reason}`,
              fixable: 'manual',
              confidence: confidence(70),
              tags: ['billing', 'unwired-button'],
            });
          }
          break;
        }
      } catch { /* ignore */ }
    }

    // Check CTA buttons
    let ctaCount = 0;
    for (const sel of checkoutSelectors) {
      try {
        ctaCount += await ctx.page.locator(sel).count();
      } catch { /* ignore */ }
    }

    steps.push({
      description: ctaCount > 0 ? `Found ${ctaCount} CTA/payment button(s)` : 'No CTA buttons found',
      passed: true,
      durationMs: Date.now() - start,
    });

    return findings;
  }

  private async visitBillingAccount(ctx: ScenarioContext, steps: ScenarioStep[], screenshots: string[]): Promise<void> {
    const start = Date.now();
    const billingPaths = ['/billing', '/account/billing', '/settings/billing', '/subscription'];

    for (const path of billingPaths) {
      if (ctx.routeMap.hasRoute(path)) {
        try {
          await ctx.page.goto(`${ctx.baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
          await ctx.page.waitForTimeout(800);
          const screenshot = await captureScenarioScreenshot(ctx, 'billing-account');
          screenshots.push(screenshot);

          // Check for plan info
          const hasPlan = await ctx.page.locator('[class*="plan"], [data-plan], .current-plan').count() > 0;
          const hasCancel = await ctx.page.locator('button:has-text("Cancel"), a:has-text("Cancel")').count() > 0;

          steps.push({
            description: `Billing account page found. Plan info: ${hasPlan}, Cancel option: ${hasCancel}`,
            passed: true,
            screenshot,
            durationMs: Date.now() - start,
          });
          return;
        } catch { /* try next */ }
      }
    }

    steps.push({ description: 'No billing account page found (may require auth)', passed: true, durationMs: Date.now() - start });
  }
}

export const billingScenario = new BillingScenario();
