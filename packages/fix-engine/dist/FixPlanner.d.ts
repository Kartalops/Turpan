/**
 * FixPlanner — orchestrates the complete fix workflow.
 *
 * Workflow:
 *  1. Load findings
 *  2. Select fixable findings
 *  3. Generate FixCandidates
 *  4. Apply FixPolicy (filter/reject)
 *  5. Produce FixPlan
 */
import type { Finding } from '@turpan/core';
import type { FixMode, FixPolicy, FixCandidate, FixRunResult, PatchResult, ValidationSummary, RollbackRecord, ValidationCheck } from './types.js';
export interface FixPlannerConfig {
    projectRoot: string;
    fixMode: FixMode;
    findings: Finding[];
    policyOverrides?: Partial<FixPolicy>;
    validationChecks?: ValidationCheck[];
    signal?: AbortSignal;
}
export interface FixPlan {
    runId: string;
    fixMode: FixMode;
    projectRoot: string;
    policy: FixPolicy;
    candidates: FixCandidate[];
    applied: FixCandidate[];
    rejected: FixCandidate[];
    deferred: FixCandidate[];
    requiredChecks: ValidationCheck[];
    gitDirty: boolean;
    generatedAt: string;
}
export interface PlanResult {
    plan: FixPlan;
    fixRunResult: FixRunResult;
}
/**
 * Build a FixPlan from findings, applying policy rules.
 */
export declare function buildFixPlan(config: FixPlannerConfig): FixPlan;
/**
 * Build the full FixRunResult from a FixPlan.
 * This is the complete output including patch, validation, and rollback info.
 */
export declare function buildFixRunResult(plan: FixPlan, patchResult: PatchResult, validation: ValidationSummary, options: {
    gitDirty: boolean;
    workedInWorktree: boolean;
    fixPlanPath?: string;
    patchDiffPath?: string;
    resultJsonPath?: string;
    rollback?: RollbackRecord;
}): FixRunResult;
/**
 * Summarize a FixPlan in human-readable form.
 */
export declare function summarizePlan(plan: FixPlan): string;
//# sourceMappingURL=FixPlanner.d.ts.map