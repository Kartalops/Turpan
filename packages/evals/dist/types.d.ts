export type EvalSuiteKind = 'unit' | 'integration' | 'agent-capability' | 'review-quality' | 'runtime' | 'browser' | 'patch';
export type EvalCategory = 'SECURITY' | 'CORRECTNESS' | 'UI' | 'CLI' | 'ARCHITECTURE' | 'TEST_QUALITY' | 'DEPENDENCIES' | 'PROMPT_INJECTION' | 'PERFORMANCE';
export type EvalSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export interface GoldenDefect {
    id: string;
    category: EvalCategory;
    severity: EvalSeverity;
    title: string;
    fixture: string;
    expectedSignals: string[];
    expectedFiles?: string[];
    language?: string;
}
export interface EvalCase {
    id: string;
    suite: EvalSuiteKind;
    fixture: string;
    description: string;
    defects: GoldenDefect[];
    adversarialTraits?: string[];
}
export interface EvalFinding {
    id: string;
    title: string;
    category: EvalCategory | string;
    severity: EvalSeverity;
    confidence: number;
    files?: string[];
    matchedDefectIds?: string[];
    timeToFindingMs?: number;
    evidenceKinds?: string[];
}
export interface EvalRunStats {
    modelCalls: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    runtimeDurationMs: number;
    browserActions: number;
    reproductionAttempts: number;
    reproductionSuccesses: number;
    patchAttempts: number;
    patchSuccesses: number;
    patchRegressions: number;
    verifierReviews: number;
    verifierRejections: number;
}
export interface EvalRun {
    id: string;
    caseId: string;
    strategy: string;
    findings: EvalFinding[];
    stats: EvalRunStats;
    crashed?: boolean;
}
export interface ConfusionCounts {
    truePositive: number;
    falsePositive: number;
    falseNegative: number;
}
export interface QualityMetrics extends ConfusionCounts {
    precision: number;
    recall: number;
    f1: number;
    falsePositiveRate: number;
    falseNegativeRate: number;
}
export interface CalibrationBucket {
    lowerInclusive: number;
    upperExclusive: number;
    count: number;
    accuracy: number;
    averageConfidence: number;
    calibrationError: number;
}
export interface StrategyBenchmark {
    strategy: string;
    metrics: QualityMetrics;
    latencyMs: number;
    estimatedCostUsd: number;
    modelCalls: number;
}
export interface V1QualityGates {
    criticalSecurityRecall: number;
    highSeverityPrecision: number;
    maxOverallFalsePositiveRate: number;
    minReproductionSuccessRate: number;
    minPatchSuccessRate: number;
    maxPatchRegressionRate: number;
    maxCrashRate: number;
}
export interface GateResult {
    gate: keyof V1QualityGates;
    target: number;
    actual: number;
    passed: boolean;
}
//# sourceMappingURL=types.d.ts.map