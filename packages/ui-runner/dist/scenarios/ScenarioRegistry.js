/**
 * ScenarioRegistry — tracks and runs all registered scenarios.
 */
import { makeRouteMap } from './Scenario.js';
export class ScenarioRegistry {
    _scenarios = new Map();
    // ── Registration ────────────────────────────────────────────────────────────
    register(scenario, pluginId) {
        if (this._scenarios.has(scenario.id)) {
            throw new Error(`Scenario "${scenario.id}" is already registered`);
        }
        this._scenarios.set(scenario.id, { scenario, pluginId });
    }
    unregister(id) {
        this._scenarios.delete(id);
    }
    get(id) {
        return this._scenarios.get(id)?.scenario;
    }
    list() {
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
    supported(fp, routes) {
        const routeMap = makeRouteMap(routes);
        return [...this._scenarios.values()]
            .filter(r => r.scenario.supports(fp, routeMap))
            .map(r => r.scenario);
    }
    /**
     * Return scenarios by category (prefix match on id).
     */
    byCategory(category) {
        return [...this._scenarios.values()]
            .filter(r => r.scenario.id.startsWith(category))
            .map(r => r.scenario);
    }
    // ── Execution ──────────────────────────────────────────────────────────────
    /**
     * Run all supported scenarios for a project.
     */
    async runAll(ctx) {
        const scenarios = this.supported(ctx.fingerprint, ctx.routeMap.routes);
        return this.runScenarios(scenarios, ctx);
    }
    /**
     * Run a specific scenario by ID.
     */
    async runById(id, ctx) {
        const scenario = this.get(id);
        if (!scenario)
            return null;
        return scenario.run(ctx);
    }
    /**
     * Run a list of scenarios.
     */
    async runScenarios(scenarios, ctx) {
        const results = [];
        for (const scenario of scenarios) {
            const start = Date.now();
            try {
                const result = await scenario.run(ctx);
                results.push({ ...result, durationMs: Date.now() - start });
            }
            catch (err) {
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
                            fixable: 'none',
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
    count() { return this._scenarios.size; }
    toSummary() {
        return {
            total: this._scenarios.size,
            scenarios: this.list(),
        };
    }
}
//# sourceMappingURL=ScenarioRegistry.js.map