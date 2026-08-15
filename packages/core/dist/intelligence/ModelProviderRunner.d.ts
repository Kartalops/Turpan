import type { ModelRequest, ModelResponse } from '../protocol/index.js';
import type { ModelProvider, ModelRoute, ModelPolicy, PrivacyPolicy } from './types.js';
export declare class ProviderCircuitBreaker {
    private readonly threshold;
    private failures;
    constructor(threshold?: number);
    recordSuccess(provider: string): void;
    recordFailure(provider: string): void;
    isOpen(provider: string): boolean;
}
export declare class ModelProviderRunner {
    private readonly providers;
    private readonly policy;
    private readonly privacy;
    private readonly circuitBreaker;
    private calls;
    private estimatedCost;
    constructor(providers: Map<string, ModelProvider>, policy: ModelPolicy, privacy: PrivacyPolicy, circuitBreaker?: ProviderCircuitBreaker);
    invoke<T>(route: ModelRoute, request: ModelRequest): Promise<ModelResponse<T>>;
    private enforceBudget;
    private withTimeout;
}
//# sourceMappingURL=ModelProviderRunner.d.ts.map