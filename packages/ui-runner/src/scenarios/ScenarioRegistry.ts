/**
 * ScenarioRegistry — tracks and runs all registered scenarios.
 */

import type { Page } from 'playwright';
import type { ViewportConfig } from '../types.js';
import type { ProjectFingerprint } from '@turpan/core';
import type { Scenario, ScenarioResult, ScenarioContext, ScenarioRouteMap } from './Scenario.js';
import { makeRouteMap } from './Scenario.js';

export interface RegisteredScenario {
  scenario: Scenario;
  pluginId?: string;
}

export class ScenarioRegistry {
  private _scenarios = new Map<string, RegisteredScenario>();

  // ── Registration ────────────────────────────────────────────────────────────

  register(scenario: Scenario, pluginId?: string): void {
    if (this._scenarios.has(scenario.id)) {
      throw new Error(`Scenario "${scenario.id}" is already registered`);
    }
    this._scenarios.set(scenario.id, { scenario, pluginId });
  }

  unregister(id: string): void {
    this._scenarios.delete(id);
  }

  get(id: string): Scenario | undefined {
    return this._scenarios.get(id)?.scenario;
  }

  list(): Array<{ id: string; name: string; riskLevel: Scenario['riskLevel'] }> {
    return [...this._scenarios.values()].map(r => ({
      id: r.scenario.id,
      name: r.scenario.name,
      riskLevel: r.scenario.riskLevel,
    }));
  }

  // ── Filtering ────────────────────────────────────────────────────────────────

  /**
   * Return scenarios that support the given project fingerprint and routes.
   */
  supported(fp: ProjectFingerprint, routes: string[]): Scenario[] {
    const routeMap = makeRouteMap(routes);
    return [...this._scenarios.values()]
      .filter(r => r.scenario.supports(fp, routeMap))
      .map(r => r.scenario);
  }

  /**
   * Return scenarios by category (prefix match on id).
   */
  byCategory(category: string): Scenario[] {
    return [...this._scenarios.values()]
      .filter(r => r.scenario.id.startsWith(category))
      .map(r => r.scenario);
  }

  // ── Execution ──────────────────────────────────────────────────────────────

  /**
   * Run all supported scenarios for a project.
   */
  async runAll(
    ctx: ScenarioContext & { fingerprint: ProjectFingerprint }
  ): Promise<ScenarioResult[]> {
    const scenarios = this.supported(ctx.fingerprint, ctx.routeMap.routes);
    return this.runScenarios(scenarios, ctx);
  }

  /**
   * Run a specific scenario by ID.
   */
  async runById(id: string, ctx: ScenarioContext): Promise<ScenarioResult | null> {
    const scenario = this.get(id);
    if (!scenario) return null;
    return scenario.run(ctx);
  }

  /**
   * Run a list of scenarios.
   */
  async runScenarios(scenarios: Scenario[], ctx: ScenarioContext): Promise<ScenarioResult[]> {
    const results: ScenarioResult[] = [];

    for (const scenario of scenarios) {
      const start = Date.now();
      try {
        const result = await scenario.run(ctx);
        results.push({ ...result, durationMs: Date.now() - start });
      } catch (err) {
        results.push({
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          status: 'failed',
          durationMs: Date.now() - start,
          steps: [{
            description: `Scenario threw: ${err}`,
            passed: false,
            error: String(err),
            durationMs: Date.now() - start,
          }],
          findings: [{
            id: `scenario-error-${scenario.id}`,
            title: `Scenario "${scenario.id}" threw an error`,
            severity: 'medium',
            category: 'ui',
            explanation: String(err),
            fixable: 'none' as const,
            confidence: 100,
            tags: ['scenario', 'error'],
          }],
          artifacts: { screenshots: [], traces: [] },
        });
      }
    }

    return results;
  }

  // ── Summary ─────────────────────────────────────────────────────────────────

  count(): number { return this._scenarios.size; }

  toSummary() {
    return {
      total: this._scenarios.size,
      scenarios: this.list(),
    };
  }
}
