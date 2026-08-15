import type { ModelRequest } from '../protocol/index.js';
import type { ContextItem, ModelRoute, SpecialistGoal, SpecialistResult } from './types.js';
import type { ModelProviderRunner } from './ModelProviderRunner.js';
export declare function buildSpecialistRequest(goal: SpecialistGoal, context: ContextItem[]): ModelRequest;
export declare class SpecialistRunner {
    private readonly runner;
    constructor(runner: ModelProviderRunner);
    run(goal: SpecialistGoal, route: ModelRoute, context: ContextItem[]): Promise<SpecialistResult>;
    runConcurrent(jobs: Array<{
        goal: SpecialistGoal;
        route: ModelRoute;
        context: ContextItem[];
    }>): Promise<SpecialistResult[]>;
}
//# sourceMappingURL=Specialists.d.ts.map