import type { ModelRequest, ModelResponse } from '../protocol/index.js';
import type { ModelProvider, ModelRoute, ModelPolicy, PrivacyPolicy } from './types.js';
import { assertProviderAllowed, redactModelRequest } from './PrivacyPolicy.js';

export class ProviderCircuitBreaker {
  private failures = new Map<string, number>();

  constructor(private readonly threshold = 2) {}

  recordSuccess(provider: string): void {
    this.failures.set(provider, 0);
  }

  recordFailure(provider: string): void {
    this.failures.set(provider, (this.failures.get(provider) ?? 0) + 1);
  }

  isOpen(provider: string): boolean {
    return (this.failures.get(provider) ?? 0) >= this.threshold;
  }
}

export class ModelProviderRunner {
  private calls = 0;
  private estimatedCost = 0;

  constructor(
    private readonly providers: Map<string, ModelProvider>,
    private readonly policy: ModelPolicy,
    private readonly privacy: PrivacyPolicy,
    private readonly circuitBreaker = new ProviderCircuitBreaker(),
  ) {}

  async invoke<T>(route: ModelRoute, request: ModelRequest): Promise<ModelResponse<T>> {
    this.enforceBudget();
    const attempts = [route.primary, ...route.fallbacks];
    let lastError: unknown;

    for (const model of attempts) {
      const provider = this.providers.get(model.provider);
      if (!provider || this.circuitBreaker.isOpen(model.provider)) continue;
      assertProviderAllowed(this.privacy, model.provider);

      const safeRequest = redactModelRequest(request, this.privacy);
      const cost = provider.estimateCost?.(safeRequest, model) ?? 0;
      if (this.estimatedCost + cost > this.policy.maxEstimatedCostUsd) {
        throw new Error('Model budget exhausted');
      }

      try {
        const response = await this.withTimeout(
          safeRequest.timeoutMs ?? 30_000,
          provider.invoke<T>(safeRequest, model),
        );
        this.calls += 1;
        this.estimatedCost += cost;
        this.circuitBreaker.recordSuccess(model.provider);
        return {
          ...response,
          retryMetadata: {
            attempts: 1,
            fallbackUsed: model !== route.primary,
            ...response.retryMetadata,
          },
        };
      } catch (error) {
        lastError = error;
        this.calls += 1;
        this.circuitBreaker.recordFailure(model.provider);
        if (this.calls >= this.policy.maxModelCalls) break;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('All model providers failed');
  }

  private enforceBudget(): void {
    if (this.calls >= this.policy.maxModelCalls) {
      throw new Error('Model call limit exhausted');
    }
    if (this.estimatedCost >= this.policy.maxEstimatedCostUsd) {
      throw new Error('Model budget exhausted');
    }
  }

  private withTimeout<T>(timeoutMs: number, promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Model request timed out after ${timeoutMs}ms`)), timeoutMs);
      promise.then(resolve).catch(reject).finally(() => clearTimeout(timer));
    });
  }
}
