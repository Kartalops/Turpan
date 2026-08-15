export class ModelRegistry {
    models = new Map();
    register(model) {
        this.models.set(this.key(model.provider, model.model), model);
    }
    list() {
        return [...this.models.values()];
    }
    enabled() {
        return this.list().filter((model) => model.enabled);
    }
    forProvider(provider) {
        return this.enabled().filter((model) => model.provider === provider);
    }
    get(provider, model) {
        return this.models.get(this.key(provider, model));
    }
    key(provider, model) {
        return `${provider}:${model}`;
    }
}
export function createDefaultModelRegistry() {
    const registry = new ModelRegistry();
    registry.register({
        provider: 'local',
        model: 'local-structured-reviewer',
        family: 'local',
        enabled: true,
        local: true,
        capabilities: {
            codingReasoning: 45,
            architectureReasoning: 35,
            securityReasoning: 35,
            longContext: false,
            toolUse: false,
            vision: false,
            latencyClass: 'low',
            costClass: 'low',
            contextWindow: 16000,
            structuredOutput: true,
            reliabilityScore: 65,
        },
    });
    registry.register({
        provider: 'openai-compatible',
        model: 'strong-coding',
        family: 'coding',
        enabled: true,
        local: false,
        capabilities: {
            codingReasoning: 92,
            architectureReasoning: 82,
            securityReasoning: 82,
            longContext: true,
            toolUse: true,
            vision: false,
            latencyClass: 'medium',
            costClass: 'high',
            contextWindow: 128000,
            structuredOutput: true,
            reliabilityScore: 88,
        },
    });
    registry.register({
        provider: 'anthropic-compatible',
        model: 'strong-reasoning',
        family: 'reasoning',
        enabled: true,
        local: false,
        capabilities: {
            codingReasoning: 84,
            architectureReasoning: 94,
            securityReasoning: 90,
            longContext: true,
            toolUse: true,
            vision: false,
            latencyClass: 'high',
            costClass: 'high',
            contextWindow: 200000,
            structuredOutput: true,
            reliabilityScore: 90,
        },
    });
    registry.register({
        provider: 'google-compatible',
        model: 'vision-reviewer',
        family: 'vision',
        enabled: true,
        local: false,
        capabilities: {
            codingReasoning: 75,
            architectureReasoning: 70,
            securityReasoning: 70,
            longContext: true,
            toolUse: true,
            vision: true,
            latencyClass: 'medium',
            costClass: 'medium',
            contextWindow: 100000,
            structuredOutput: true,
            reliabilityScore: 82,
        },
    });
    registry.register({
        provider: 'openai-compatible',
        model: 'cheap-fast',
        family: 'triage',
        enabled: true,
        local: false,
        capabilities: {
            codingReasoning: 55,
            architectureReasoning: 45,
            securityReasoning: 45,
            longContext: false,
            toolUse: false,
            vision: false,
            latencyClass: 'low',
            costClass: 'low',
            contextWindow: 32000,
            structuredOutput: true,
            reliabilityScore: 72,
        },
    });
    return registry;
}
//# sourceMappingURL=ModelRegistry.js.map