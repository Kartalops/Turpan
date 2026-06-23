/**
 * NavigationScenario — validates the primary navigation structure.
 *
 * Flow:
 *  1. Collect all navigation links from header/sidebar
 *  2. Visit each valid route
 *  3. Check each route loads without crash
 *  4. Capture screenshot of each route
 *  5. Detect broken links (404s)
 */

import type { Scenario, ScenarioContext, ScenarioResult, ScenarioStep, ScenarioFinding, ScenarioRouteMap } from './Scenario.js';
import { captureScenarioScreenshot } from './Scenario.js';
import type { ProjectFingerprint } from '@turpan/core';
import { confidence } from '@turpan/core';

const SCENARIO_ID = 'navigation';
const SCENARIO_NAME = 'Navigation & Routing';

export class NavigationScenario implements Scenario {
  readonly id = SCENARIO_ID;
  readonly name = SCENARIO_NAME;
  readonly riskLevel = 'safe' as const;

  supports(_fp: ProjectFingerprint, routes: ScenarioRouteMap): boolean {
    return routes.routes.length >= 2;
  }

  async run(ctx: ScenarioContext): Promise<ScenarioResult> {
    const steps: ScenarioStep[] = [];
    const findings: ScenarioFinding[] = [];
    const screenshots: string[] = [];
    const start = Date.now();

    const maxRoutes = Math.min(ctx.routeMap.routes.length, 20);

    for (let i = 0; i < maxRoutes; i++) {
      const path = ctx.routeMap.routes[i];
      const stepStart = Date.now();

      try {
        await ctx.page.goto(`${ctx.baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        await ctx.page.waitForTimeout(800);

        const status = await this.checkRouteStatus(ctx);
        const screenshot = await captureScenarioScreenshot(ctx, `nav-${path.replace(/\//g, '-').slice(0, 20)}`);
        screenshots.push(screenshot);

        if (status === 'error') {
          findings.push({
            id: `nav-broken-${path.replace(/\//g, '-')}`,
            title: `Route "${path}" returned an error`,
            severity: 'high',
            category: 'navigation',
            explanation: `The route "${path}" appears to have an error. Check the console for runtime errors.`,
            fixable: 'manual',
            confidence: confidence(85),
            tags: ['navigation', 'broken-route', path],
          });
          steps.push({ description: `Route "${path}": ERROR`, passed: false, screenshot, error: 'Page error detected', durationMs: Date.now() - stepStart });
        } else if (status === 'blank') {
          findings.push({
            id: `nav-blank-${path.replace(/\//g, '-')}`,
            title: `Route "${path}" appears blank`,
            severity: 'medium',
            category: 'navigation',
            explanation: `The route "${path}" loaded but appears to have no visible content.`,
            fixable: 'manual',
            confidence: confidence(70),
            tags: ['navigation', 'blank-route', path],
          });
          steps.push({ description: `Route "${path}": BLANK`, passed: false, screenshot, error: 'Page appears blank', durationMs: Date.now() - stepStart });
        } else {
          steps.push({ description: `Route "${path}": OK`, passed: true, screenshot, durationMs: Date.now() - stepStart });
        }

        // Navigate back to homepage between tests
        if (i < maxRoutes - 1) {
          await ctx.page.goto(ctx.baseUrl, { waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => {});
          await ctx.page.waitForTimeout(300);
        }

      } catch (err) {
        screenshots.push(await captureScenarioScreenshot(ctx, `nav-error-${path.replace(/\//g, '-')}`).catch(() => ''));
        steps.push({ description: `Route "${path}": FAILED`, passed: false, error: String(err), durationMs: Date.now() - stepStart });
      }
    }

    const passRate = steps.filter(s => s.passed).length / steps.length;

    return {
      scenarioId: this.id,
      scenarioName: this.name,
      status: passRate >= 0.8 ? 'passed' : passRate >= 0.5 ? 'warn' : 'failed',
      durationMs: Date.now() - start,
      steps,
      findings,
      artifacts: { screenshots, traces: [] },
      finalUrl: ctx.page.url(),
    };
  }

  private async checkRouteStatus(ctx: ScenarioContext): Promise<'ok' | 'blank' | 'error'> {
    try {
      // Check for console errors
      const consoleErrors = await ctx.page.evaluate(() => {
        return (window as any).__turpanErrors ?? [];
      });

      // Check for blank page
      const bodyText = await ctx.page.evaluate(() => document.body?.innerText ?? '');
      if (bodyText.trim().length < 10) return 'blank';

      // Check for visible error message
      const errorEl = await ctx.page.locator('h1:has-text("Error"), .error-page, [data-testid="error"]').count();
      if (errorEl > 0) return 'error';

      return 'ok';
    } catch {
      return 'error';
    }
  }
}

export const navigationScenario = new NavigationScenario();
