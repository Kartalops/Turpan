import type { CalibrationBucket, EvalCase, EvalFinding, EvalRun, EvalSeverity, GateResult, QualityMetrics, V1QualityGates } from './types.js';
export declare function computeQualityMetrics(cases: EvalCase[], runs: EvalRun[]): QualityMetrics;
export declare function computeQualityBySeverity(cases: EvalCase[], runs: EvalRun[]): Record<EvalSeverity, QualityMetrics>;
export declare function computeQualityByCategory(cases: EvalCase[], runs: EvalRun[]): Record<string, QualityMetrics>;
export declare function computeCalibration(findings: EvalFinding[], bucketSize?: number): CalibrationBucket[];
export declare function evaluateV1Gates(cases: EvalCase[], runs: EvalRun[], gates: V1QualityGates): GateResult[];
//# sourceMappingURL=metrics.d.ts.map