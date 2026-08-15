import type { ModelRoute, ModelRoutingInput } from './types.js';
import { ModelRegistry } from './ModelRegistry.js';
export declare class ModelRouter {
    private readonly registry;
    constructor(registry: ModelRegistry);
    route(input: ModelRoutingInput): ModelRoute;
    private score;
}
//# sourceMappingURL=ModelRouter.d.ts.map