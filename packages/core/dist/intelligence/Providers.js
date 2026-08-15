export class ConfiguredModelProvider {
    id;
    modelCapabilities;
    transport;
    costEstimator;
    constructor(id, modelCapabilities, transport, costEstimator = () => 0) {
        this.id = id;
        this.modelCapabilities = modelCapabilities;
        this.transport = transport;
        this.costEstimator = costEstimator;
    }
    invoke(request, model) {
        return this.transport(request, model);
    }
    capabilities(model) {
        return this.modelCapabilities[model] ?? null;
    }
    estimateCost(request, model) {
        return this.costEstimator(request, model);
    }
    async health() {
        return { status: 'healthy', checkedAt: new Date().toISOString() };
    }
}
export class LocalOfflineProvider extends ConfiguredModelProvider {
    constructor(model, result = { findings: [], confidence: 0 }) {
        super(model.provider, { [model.model]: model.capabilities }, async () => ({
            provider: model.provider,
            model: model.model,
            structuredResult: result,
            latencyMs: 0,
            finishReason: 'offline-local',
        }));
    }
}
//# sourceMappingURL=Providers.js.map