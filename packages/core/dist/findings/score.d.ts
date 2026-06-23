/**
 * Score calculation from Findings
 */
import type { Finding, Severity } from './Finding.js';
export interface ScoreBreakdown {
    overall: number;
    build_health: number;
    test_health: number;
    code_quality: number;
    security: number;
    ui_runtime: number;
    architecture: number;
    dead_code: number;
    agent_output: number;
    release_readiness: number;
}
/**
 * Calculate a 0–100 score for each dimension from a list of findings.
 * Higher score = healthier. 100 = no issues.
 */
export declare function calculateScorecard(findings: Finding[]): ScoreBreakdown;
/** Count findings by severity */
export declare function countBySeverity(findings: Finding[]): Record<Severity, number>;
/** Count findings by category */
export declare function countByCategorySimple(findings: Finding[]): Record<string, number>;
/** Return the verdict based on scorecard */
export type Verdict = 'GO' | 'CONDITIONAL_GO' | 'NO_GO' | 'INTERNAL_ONLY';
export declare function computeVerdict(scorecard: ScoreBreakdown, findings: Finding[]): Verdict;
//# sourceMappingURL=score.d.ts.map