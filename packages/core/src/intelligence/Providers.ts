import type { ModelRequest, ModelResponse } from '../protocol/index.js';
import type { ModelCapabilities, ModelDescriptor, ModelProvider, ProviderHealth } from './types.js';

export type ProviderTransport = <T>(
  request: ModelRequest,
  model: ModelDescriptor,
) => Promise<ModelResponse<T>>;

export class ConfiguredModelProvider implements ModelProvider {
  constructor(
    readonly id: string,
    private readonly modelCapabilities: Record<string, ModelCapabilities>,
    private readonly transport: ProviderTransport,
    private readonly costEstimator: (request: ModelRequest, model: ModelDescriptor) => number = () => 0,
  ) {}

  invoke<T = unknown>(request: ModelRequest, model: ModelDescriptor): Promise<ModelResponse<T>> {
    return this.transport<T>(request, model);
  }

  capabilities(model: string): ModelCapabilities | null {
    return this.modelCapabilities[model] ?? null;
  }

  estimateCost(request: ModelRequest, model: ModelDescriptor): number {
    return this.costEstimator(request, model);
  }

  async health(): Promise<ProviderHealth> {
    return { status: 'healthy', checkedAt: new Date().toISOString() };
  }
}

export class LocalOfflineProvider extends ConfiguredModelProvider {
  constructor(model: ModelDescriptor, result: unknown = { findings: [], confidence: 0 }) {
    super(
      model.provider,
      { [model.model]: model.capabilities },
      async <T>() => ({
        provider: model.provider,
        model: model.model,
        structuredResult: result as T,
        latencyMs: 0,
        finishReason: 'offline-local',
      }),
    );
  }
}
