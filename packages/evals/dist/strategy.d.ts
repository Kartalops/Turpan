import type { EvalRun, StrategyBenchmark } from './types.js';
import type { EvalCase } from './types.js';
export declare function benchmarkStrategies(cases: EvalCase[], runs: EvalRun[]): StrategyBenchmark[];
export declare function selectSmallestWinningStrategy(benchmarks: StrategyBenchmark[], targets: {
    minF1: number;
    minPrecision: number;
    minRecall: number;
}): StrategyBenchmark | undefined;
//# sourceMappingURL=strategy.d.ts.map