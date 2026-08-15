const CHEAP_TASKS = new Set([
    'repo-mapping',
    'file-classification',
    'finding-deduplication',
]);
export class ModelRouter {
    registry;
    constructor(registry) {
        this.registry = registry;
    }
    route(input) {
        const candidates = this.registry.enabled()
            .filter((model) => input.availableProviders.includes(model.provider))
            .filter((model) => !input.visionRequired || model.capabilities.vision)
            .filter((model) => model.capabilities.contextWindow >= input.requiredContextSize)
            .filter((model) => input.budget?.maxEstimatedCostUsd === undefined || model.capabilities.costClass !== 'high' || input.mode !== 'fast');
        if (candidates.length === 0) {
            throw new Error(`No available model can satisfy task ${input.taskType}`);
        }
        const scored = candidates
            .map((model) => ({ model, score: this.score(model, input) }))
            .sort((a, b) => b.score - a.score);
        return {
            primary: scored[0].model,
            fallbacks: scored.slice(1).map((entry) => entry.model),
            reason: `Selected ${scored[0].model.provider}/${scored[0].model.model} for ${input.taskType} with score ${scored[0].score}`,
        };
    }
    score(model, input) {
        let score = model.capabilities.reliabilityScore;
        if (CHEAP_TASKS.has(input.taskType)) {
            score += model.capabilities.costClass === 'low' ? 40 : -20;
            score += model.capabilities.latencyClass === 'low' ? 20 : 0;
        }
        if (input.taskType === 'correctness-review')
            score += model.capabilities.codingReasoning;
        if (input.taskType === 'architecture-review')
            score += model.capabilities.architectureReasoning;
        if (input.taskType === 'security-review' || input.taskType === 'finding-verification') {
            score += model.capabilities.securityReasoning;
        }
        if (input.visionRequired || input.browserArtifactsExist)
            score += model.capabilities.vision ? 80 : -100;
        if (input.riskLevel === 'critical' || input.riskLevel === 'high')
            score += model.capabilities.reliabilityScore;
        if (input.requiredContextSize > 32000 && model.capabilities.longContext)
            score += 50;
        if (input.previousModelConfidence !== undefined && input.previousModelConfidence < 70) {
            score += model.family === 'reasoning' ? 35 : 0;
        }
        if (input.latencyPreference === 'low')
            score += model.capabilities.latencyClass === 'low' ? 25 : -10;
        if (input.budget?.maxEstimatedCostUsd !== undefined) {
            score += model.capabilities.costClass === 'low' ? 20 : model.capabilities.costClass === 'medium' ? 5 : -25;
        }
        return score;
    }
}
//# sourceMappingURL=ModelRouter.js.map