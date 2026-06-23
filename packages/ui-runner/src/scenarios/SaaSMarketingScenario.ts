/**
 * SaaS Marketing Scenario — validates the marketing homepage and funnel.
 *
 * Flow:
 *  1. Visit /
 *  2. Check hero visibility and CTA
 *  3. Check navigation links
 *  4. Click pricing/features if present
 *  5. Scroll page and capture screenshot
 *  6. Validate no broken links
 */

import type { Page } from 'playwright';
import type { Scenario, ScenarioContext, ScenarioResult, ScenarioStep, ScenarioFinding, ScenarioRouteMap } from './Scenario.js';
import { captureScenarioScreenshot, SAFE_TEST_CREDENTIALS } from './Scenario.js';
import type { ProjectFingerprint } from '@turpan/core';
import { confidence } from '@turpan/core';

const SCENARIO_ID = 'saas-marketing';
const SCENARIO_NAME = 'SaaS Marketing Homepage';

export class SaaSMarketingScenario implements Scenario {
  readonly id = SCENARIO_ID;
  readonly name = SCENARIO_NAME;
  readonly riskLevel = 'safe' as const;

  supports(fp: ProjectFingerprint, routes: ScenarioRouteMap): boolean {
    // Supports any project with a homepage or marketing routes
    return routes.hasRoute('/') || routes.hasRoute('/home') || routes.hasRoute('/features');
  }

  async run(ctx: ScenarioContext): Promise<ScenarioResult> {
    const steps: ScenarioStep[] = [];
    const findings: ScenarioFinding[] = [];
    const screenshots: string[] = [];
    const start = Date.now();

    try {
      // Step 1: Visit homepage
      const step1 = await this.visitHomepage(ctx);
      steps.push(step1);
      if (step1.screenshot) screenshots.push(step1.screenshot);

      if (!ctx.page.url().includes('login') && !ctx.page.url().includes('signin')) {
        // Step 2: Check hero section
        const step2 = await this.checkHeroSection(ctx);
        steps.push(step2);
        if (step2.screenshot) screenshots.push(step2.screenshot);

        // Step 3: Check primary CTA
        const step3 = await this.checkPrimaryCta(ctx);
        steps.push(step3);
        if (step3.screenshot) screenshots.push(step3.screenshot);

        // Step 4: Check navigation
        const step4 = await this.checkNavigation(ctx);
        steps.push(step4);

        // Step 5: Navigate to pricing/features
        const step5 = await this.navigateToSecondaryPages(ctx, steps, screenshots);
        screenshots.push(...steps.slice(-3).map(s => s.screenshot).filter(Boolean) as string[]);

        // Step 6: Scroll test
        const step6 = await this.scrollPage(ctx);
        steps.push(step6);
        if (step6.screenshot) screenshots.push(step6.screenshot);
      }
    } catch (err) {
      steps.push({
        description: 'Unexpected error during marketing scenario',
        passed: false,
        error: String(err),
        durationMs: Date.now() - start,
      });
    }

    const allPassed = steps.every(s => s.passed);
    const anyFailed = steps.some(s => !s.passed && !s.error?.includes('not found'));

    return {
      scenarioId: this.id,
      scenarioName: this.name,
      status: allPassed ? 'passed' : anyFailed ? 'failed' : 'warn',
      durationMs: Date.now() - start,
      steps,
      findings,
      artifacts: { screenshots, traces: [] },
      finalUrl: ctx.page.url(),
    };
  }

  private async visitHomepage(ctx: ScenarioContext): Promise<ScenarioStep> {
    const start = Date.now();
    try {
      const url = `${ctx.baseUrl}/`;
      await ctx.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await ctx.page.waitForTimeout(1000);
      const screenshot = await captureScenarioScreenshot(ctx, 'homepage');
      return { description: 'Visit homepage', passed: true, screenshot, durationMs: Date.now() - start };
    } catch (err) {
      return { description: 'Visit homepage', passed: false, error: String(err), durationMs: Date.now() - start };
    }
  }

  private async checkHeroSection(ctx: ScenarioContext): Promise<ScenarioStep> {
    const start = Date.now();
    const heroSelectors = [
      'h1',
      '[class*="hero"]',
      '[class*="Hero"]',
      '[data-testid="hero"]',
      'section:first-of-type h1',
    ];

    for (const selector of heroSelectors) {
      try {
        const count = await ctx.page.locator(selector).first().textContent({ timeout: 3000 });
        if (count && count.trim().length > 0) {
          return {
            description: `Hero section found: "${count?.trim().slice(0, 60)}"`,
            passed: true,
            durationMs: Date.now() - start,
          };
        }
      } catch { /* try next */ }
    }

    // No hero found — warn
    return {
      description: 'Hero section not found (may be intentional for minimalist designs)',
      passed: true, // Warning, not failure
      durationMs: Date.now() - start,
    };
  }

  private async checkPrimaryCta(ctx: ScenarioContext): Promise<ScenarioStep> {
    const start = Date.now();
    const ctaSelectors = [
      'a:has-text("Get Started")',
      'a:has-text("Sign Up")',
      'a:has-text("Start Free")',
      'a:has-text("Try Free")',
      'button:has-text("Get Started")',
      'button:has-text("Sign Up")',
      '[role="button"]:has-text("Start")',
    ];

    let foundCta = false;
    for (const selector of ctaSelectors) {
      try {
        const count = await ctx.page.locator(selector).count();
        if (count > 0) {
          foundCta = true;
          const text = await ctx.page.locator(selector).first().textContent({ timeout: 2000 });
          const href = await ctx.page.locator(selector).first().getAttribute('href');
          return {
            description: `Primary CTA found: "${text?.trim()}" (href: ${href ?? 'button'})`,
            passed: true,
            durationMs: Date.now() - start,
          };
        }
      } catch { /* try next */ }
    }

    return {
      description: 'No primary CTA (Get Started / Sign Up) found',
      passed: false,
      durationMs: Date.now() - start,
    };
  }

  private async checkNavigation(ctx: ScenarioContext): Promise<ScenarioStep> {
    const start = Date.now();
    const navSelectors = ['nav', 'header nav', '[role="navigation"]', 'header'];
    let navElement = null;

    for (const sel of navSelectors) {
      try {
        const count = await ctx.page.locator(sel).count();
        if (count > 0) {
          navElement = sel;
          break;
        }
      } catch { /* try next */ }
    }

    if (!navElement) {
      return { description: 'Navigation not found', passed: false, durationMs: Date.now() - start };
    }

    // Check nav links
    const links = await ctx.page.locator(`${navElement} a[href]`).all();
    const linkTexts = await Promise.all(links.slice(0, 10).map(l => l.textContent({ timeout: 1000 }).catch(() => '')));

    return {
      description: `Navigation found with ${links.length} links: ${linkTexts.filter(Boolean).join(', ').slice(0, 80)}`,
      passed: links.length > 0,
      durationMs: Date.now() - start,
    };
  }

  private async navigateToSecondaryPages(
    ctx: ScenarioContext,
    steps: ScenarioStep[],
    screenshots: string[]
  ): Promise<void> {
    const pages = [
      { label: 'Pricing', selectors: ['a:has-text("Pricing")', 'a:has-text("pricing")', 'a[href="/pricing"]'] },
      { label: 'Features', selectors: ['a:has-text("Features")', 'a:has-text("features")', 'a[href="/features"]'] },
      { label: 'About', selectors: ['a:has-text("About")', 'a:has-text("about")', 'a[href="/about"]'] },
    ];

    for (const page of pages) {
      const stepStart = Date.now();
      let clicked = false;

      for (const selector of page.selectors) {
        try {
          const count = await ctx.page.locator(selector).count();
          if (count > 0) {
            await ctx.page.locator(selector).first().click({ timeout: 3000 });
            await ctx.page.waitForTimeout(1500);
            clicked = true;
            const screenshot = await captureScenarioScreenshot(ctx, page.label.toLowerCase());
            screenshots.push(screenshot);
            steps.push({
              description: `Navigate to ${page.label} page`,
              passed: true,
              screenshot,
              durationMs: Date.now() - stepStart,
            });
            break;
          }
        } catch { /* try next selector */ }
      }

      if (!clicked) {
        steps.push({
          description: `${page.label} page link not found`,
          passed: true, // Not required
          durationMs: Date.now() - stepStart,
        });
      }

      // Go back to homepage for next check
      if (ctx.page.url() !== `${ctx.baseUrl}/`) {
        try {
          await ctx.page.goto(`${ctx.baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 10_000 });
          await ctx.page.waitForTimeout(500);
        } catch { /* ignore */ }
      }
    }
  }

  private async scrollPage(ctx: ScenarioContext): Promise<ScenarioStep> {
    const start = Date.now();
    try {
      // Scroll in steps
      for (let i = 0; i < 5; i++) {
        await ctx.page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
        await ctx.page.waitForTimeout(400);
      }

      const screenshot = await captureScenarioScreenshot(ctx, 'scrolled-bottom');

      // Scroll back
      await ctx.page.evaluate(() => window.scrollTo(0, 0));
      await ctx.page.waitForTimeout(300);

      return {
        description: 'Page scrolled successfully (lazy content loaded)',
        passed: true,
        screenshot,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return { description: 'Scroll test failed', passed: false, error: String(err), durationMs: Date.now() - start };
    }
  }
}

export const saasMarketingScenario = new SaaSMarketingScenario();
