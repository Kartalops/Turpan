import type { ModelDescriptor } from './types.js';
export declare class ModelRegistry {
    private models;
    register(model: ModelDescriptor): void;
    list(): ModelDescriptor[];
    enabled(): ModelDescriptor[];
    forProvider(provider: string): ModelDescriptor[];
    get(provider: string, model: string): ModelDescriptor | undefined;
    private key;
}
export declare function createDefaultModelRegistry(): ModelRegistry;
//# sourceMappingURL=ModelRegistry.d.ts.map