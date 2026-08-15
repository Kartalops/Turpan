import type { ModelRequest, ModelResponse } from '../protocol/index.js';
import type { ModelCapabilities, ModelDescriptor, ModelProvider, ProviderHealth } from './types.js';
export type ProviderTransport = <T>(request: ModelRequest, model: ModelDescriptor) => Promise<ModelResponse<T>>;
export declare class ConfiguredModelProvider implements ModelProvider {
    readonly id: string;
    private readonly modelCapabilities;
    private readonly transport;
    private readonly costEstimator;
    constructor(id: string, modelCapabilities: Record<string, ModelCapabilities>, transport: ProviderTransport, costEstimator?: (request: ModelRequest, model: ModelDescriptor) => number);
    invoke<T = unknown>(request: ModelRequest, model: ModelDescriptor): Promise<ModelResponse<T>>;
    capabilities(model: string): ModelCapabilities | null;
    estimateCost(request: ModelRequest, model: ModelDescriptor): number;
    health(): Promise<ProviderHealth>;
}
export declare class LocalOfflineProvider extends ConfiguredModelProvider {
    constructor(model: ModelDescriptor, result?: unknown);
}
//# sourceMappingURL=Providers.d.ts.map