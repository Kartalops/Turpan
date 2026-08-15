import type { Evidence, Finding } from '@turpan/core';
import type { ValidationResult } from './types.js';
export type FixEligibility = 'AUTO_FIXABLE' | 'PATCH_PROPOSAL_ONLY' | 'HUMAN_REQUIRED' | 'NOT_FIXABLE';
export type ApplyMode = 'never' | 'confirmed' | 'safe';
export interface PatchBudget {
    maxFilesChanged: number;
    maxLinesChanged: number;
    maxDependencyChanges: number;
}
export interface PatchChangeSummary {
    filesChanged: string[];
    linesAdded: number;
    linesRemoved: number;
    dependencyChanges: number;
}
export interface PatchCandidate {
    id: string;
    findingId: string;
    description: string;
    unifiedDiff: string;
    changeSummary: PatchChangeSummary;
    regressionTestDiff?: string;
    generatedBy?: string;
}
export interface ReproductionCheck {
    id: string;
    command: string;
    expectedBefore: 'fail' | 'pass' | 'unknown';
    expectedAfter: 'pass' | 'fail' | 'unknown';
}
export interface ReproductionFlip {
    checkId: string;
    before: ValidationResult;
    after: ValidationResult;
    flipped: boolean;
}
export interface SelectedTest {
    id: string;
    command: string;
    reason: string;
    ladderStep: 'syntax' | 'typecheck' | 'targeted-unit' | 'reproduction' | 'integration' | 'broader-suite';
}
export interface PatchReviewConcern {
    category: 'behavior-change' | 'security-regression' | 'overfit' | 'test-gaming' | 'public-api' | 'error-handling' | 'performance' | 'race-condition' | 'complexity' | 'dependency';
    severity: 'low' | 'medium' | 'high' | 'critical';
    explanation: string;
}
export interface PatchReviewResult {
    reviewer: string;
    approved: boolean;
    concerns: PatchReviewConcern[];
}
export interface PatchExperiment {
    id: string;
    finding: Finding;
    eligibility: FixEligibility;
    candidate: PatchCandidate;
    worktreePath: string;
    testsSelected: SelectedTest[];
    validation: ValidationResult[];
    reproductionFlips: ReproductionFlip[];
    review: PatchReviewResult;
    accepted: boolean;
    score: number;
    artifacts: Evidence[];
    commandHistory: ToolCall[];
}
export interface ToolCall {
    id: string;
    tool: string;
    input: Record<string, unknown>;
    startedAt?: string;
    finishedAt?: string;
    exitCode?: number | null;
    timedOut?: boolean;
    redacted?: boolean;
}
export interface PatchEvidenceReport {
    experimentId: string;
    problem: string;
    evidenceBefore: Evidence[];
    rootCause: string;
    patch: PatchCandidate;
    whyThisPatch: string;
    filesChanged: string[];
    testsSelected: SelectedTest[];
    testsPassed: ValidationResult[];
    reproductionBeforeAfter: ReproductionFlip[];
    adversarialReview: PatchReviewResult;
    residualRisks: string[];
    confidence: number;
    applyMode: ApplyMode;
}
export interface SelfHealingPolicy {
    applyMode: ApplyMode;
    patchBudget: PatchBudget;
    maxCandidates: number;
    maxParallelExperiments: number;
    requireRegressionTest: boolean;
    requireReproductionFlip: boolean;
}
export declare const DEFAULT_SELF_HEALING_POLICY: SelfHealingPolicy;
//# sourceMappingURL=autofixTypes.d.ts.map