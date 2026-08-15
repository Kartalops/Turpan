import { computeQualityMetrics } from './metrics.js';
export function benchmarkStrategies(cases, runs) {
    const strategies = [...new Set(runs.map((run) => run.strategy))];
    return strategies.map((strategy) => {
        const strategyRuns = runs.filter((run) => run.strategy === strategy);
        const totals = strategyRuns.reduce((sum, run) => ({
            latencyMs: sum.latencyMs + run.stats.runtimeDurationMs,
            cost: sum.cost + run.stats.estimatedCostUsd,
            modelCalls: sum.modelCalls + run.stats.modelCalls,
        }), { latencyMs: 0, cost: 0, modelCalls: 0 });
        return {
            strategy,
            metrics: computeQualityMetrics(cases, strategyRuns),
            latencyMs: totals.latencyMs,
            estimatedCostUsd: totals.cost,
            modelCalls: totals.modelCalls,
        };
    }).sort((a, b) => {
        if (b.metrics.f1 !== a.metrics.f1)
            return b.metrics.f1 - a.metrics.f1;
        if (a.estimatedCostUsd !== b.estimatedCostUsd)
            return a.estimatedCostUsd - b.estimatedCostUsd;
        return a.latencyMs - b.latencyMs;
    });
}
export function selectSmallestWinningStrategy(benchmarks, targets) {
    return benchmarks
        .filter((benchmark) => benchmark.metrics.f1 >= targets.minF1 &&
        benchmark.metrics.precision >= targets.minPrecision &&
        benchmark.metrics.recall >= targets.minRecall)
        .sort((a, b) => {
        if (a.estimatedCostUsd !== b.estimatedCostUsd)
            return a.estimatedCostUsd - b.estimatedCostUsd;
        if (a.modelCalls !== b.modelCalls)
            return a.modelCalls - b.modelCalls;
        return a.latencyMs - b.latencyMs;
    })[0];
}
//# sourceMappingURL=strategy.js.map