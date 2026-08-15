import { assertProviderAllowed, redactModelRequest } from './PrivacyPolicy.js';
export class ProviderCircuitBreaker {
    threshold;
    failures = new Map();
    constructor(threshold = 2) {
        this.threshold = threshold;
    }
    recordSuccess(provider) {
        this.failures.set(provider, 0);
    }
    recordFailure(provider) {
        this.failures.set(provider, (this.failures.get(provider) ?? 0) + 1);
    }
    isOpen(provider) {
        return (this.failures.get(provider) ?? 0) >= this.threshold;
    }
}
export class ModelProviderRunner {
    providers;
    policy;
    privacy;
    circuitBreaker;
    calls = 0;
    estimatedCost = 0;
    constructor(providers, policy, privacy, circuitBreaker = new ProviderCircuitBreaker()) {
        this.providers = providers;
        this.policy = policy;
        this.privacy = privacy;
        this.circuitBreaker = circuitBreaker;
    }
    async invoke(route, request) {
        this.enforceBudget();
        const attempts = [route.primary, ...route.fallbacks];
        let lastError;
        for (const model of attempts) {
            const provider = this.providers.get(model.provider);
            if (!provider || this.circuitBreaker.isOpen(model.provider))
                continue;
            assertProviderAllowed(this.privacy, model.provider);
            const safeRequest = redactModelRequest(request, this.privacy);
            const cost = provider.estimateCost?.(safeRequest, model) ?? 0;
            if (this.estimatedCost + cost > this.policy.maxEstimatedCostUsd) {
                throw new Error('Model budget exhausted');
            }
            try {
                const response = await this.withTimeout(safeRequest.timeoutMs ?? 30_000, provider.invoke(safeRequest, model));
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
            }
            catch (error) {
                lastError = error;
                this.calls += 1;
                this.circuitBreaker.recordFailure(model.provider);
                if (this.calls >= this.policy.maxModelCalls)
                    break;
            }
        }
        throw lastError instanceof Error ? lastError : new Error('All model providers failed');
    }
    enforceBudget() {
        if (this.calls >= this.policy.maxModelCalls) {
            throw new Error('Model call limit exhausted');
        }
        if (this.estimatedCost >= this.policy.maxEstimatedCostUsd) {
            throw new Error('Model budget exhausted');
        }
    }
    withTimeout(timeoutMs, promise) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`Model request timed out after ${timeoutMs}ms`)), timeoutMs);
            promise.then(resolve).catch(reject).finally(() => clearTimeout(timer));
        });
    }
}
//# sourceMappingURL=ModelProviderRunner.js.map