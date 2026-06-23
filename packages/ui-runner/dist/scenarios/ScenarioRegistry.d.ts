/**
 * ScenarioRegistry — tracks and runs all registered scenarios.
 */
import type { ProjectFingerprint } from '@turpan/core';
import type { Scenario, ScenarioResult, ScenarioContext } from './Scenario.js';
export interface RegisteredScenario {
    scenario: Scenario;
    pluginId?: string;
}
export declare class ScenarioRegistry {
    private _scenarios;
    register(scenario: Scenario, pluginId?: string): void;
    unregister(id: string): void;
    get(id: string): Scenario | undefined;
    list(): Array<{
        id: string;
        name: string;
        riskLevel: Scenario['riskLevel'];
    }>;
    /**
     * Return scenarios that support the given project fingerprint and routes.
     */
    supported(fp: ProjectFingerprint, routes: string[]): Scenario[];
    /**
     * Return scenarios by category (prefix match on id).
     */
    byCategory(category: string): Scenario[];
    /**
     * Run all supported scenarios for a project.
     */
    runAll(ctx: ScenarioContext & {
        fingerprint: ProjectFingerprint;
    }): Promise<ScenarioResult[]>;
    /**
     * Run a specific scenario by ID.
     */
    runById(id: string, ctx: ScenarioContext): Promise<ScenarioResult | null>;
    /**
     * Run a list of scenarios.
     */
    runScenarios(scenarios: Scenario[], ctx: ScenarioContext): Promise<ScenarioResult[]>;
    count(): number;
    toSummary(): {
        total: number;
        scenarios: {
            id: string;
            name: string;
            riskLevel: Scenario["riskLevel"];
        }[];
    };
}
//# sourceMappingURL=ScenarioRegistry.d.ts.map