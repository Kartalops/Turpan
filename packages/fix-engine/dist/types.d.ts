/**
 * @turpan/fix-engine — shared types
 */
import type { Finding } from '@turpan/core';
export type FixMode = 'report-only' | 'patch-only' | 'apply' | 'interactive' | 'auto-safe';
export type FixCategory = 'safe' | 'unsafe' | 'manual';
export type FixDecision = 'applied' | 'rejected' | 'deferred';
export type RejectionReason = 'unsafe-category' | 'below-confidence-threshold' | 'policy-blocked' | 'user-declined' | 'validation-failed' | 'unknown-file' | 'git-dirty';
export type ValidationCheck = 'build' | 'typecheck' | 'lint' | 'test' | 'ui-test';
export interface ValidationResult {
    check: ValidationCheck;
    passed: boolean;
    durationMs: number;
    output?: string;
    error?: string;
}
export interface ValidationSummary {
    allPassed: boolean;
    results: ValidationResult[];
    totalDurationMs: number;
}
export interface FixCandidate {
    /** Stable ID for this candidate */
    id: string;
    /** The finding this candidate addresses */
    finding: Finding;
    /** Category classification */
    category: FixCategory;
    /** Short description of the fix action */
    description: string;
    /** Absolute path to the file to modify */
    filePath: string;
    /** Original source snippet (for rollback) */
    originalSnippet: string;
    /** Replacement snippet */
    replacementSnippet: string;
    /** Start line in file (1-based) */
    startLine: number;
    /** End line in file (1-based) */
    endLine: number;
    /** Risk level of this fix */
    risk: 'critical' | 'high' | 'medium' | 'low';
    /** Whether this fix is fully reversible */
    reversible: boolean;
    /** Confidence that the fix is correct (0–100) */
    confidence: number;
    /** What must be validated after applying this fix */
    requiredChecks: ValidationCheck[];
    /** Auto-apply in auto-safe mode */
    autoSafe: boolean;
    /** Fields needed for the unified diff */
    diffHunkHeader?: string;
}
export interface FixPolicy {
    /** Fix modes allowed in this policy */
    allowedModes: FixMode[];
    /** Categories that can be auto-applied (in auto-safe mode) */
    autoSafeCategories: FixCategory[];
    /** Minimum confidence threshold (0–100) to be considered auto-safe */
    minConfidenceThreshold: number;
    /** Fix categories that are always blocked */
    blockedCategories: FixCategory[];
    /** Explicitly allow introducing new dependencies */
    allowNewDependencies: boolean;
    /** Maximum file size (KB) to consider for deletion fixes */
    maxDeletionFileSizeKb: number;
    /** Require git working tree to be clean before applying */
    requireCleanGitTree: boolean;
}
export interface PatchResult {
    /** Whether the patch was created successfully */
    success: boolean;
    /** Unified diff content */
    diff?: string;
    /** Files modified */
    filesModified: string[];
    /** Files created */
    filesCreated: string[];
    /** Files deleted */
    filesDeleted: string[];
    /** Patch content as a single string */
    patchContent: string;
    /** Error message if failed */
    error?: string;
}
export interface FixItemResult {
    candidateId: string;
    findingId: string;
    decision: FixDecision;
    rejectionReason?: RejectionReason;
    appliedAt?: string;
    validation?: ValidationSummary;
    /** The actual patch diff for this single fix */
    diff?: string;
}
export interface RollbackRecord {
    runId: string;
    timestamp: string;
    reason: string;
    patches: RollbackPatch[];
    validationFailed: boolean;
    appliedFingerprints: string[];
}
export interface RollbackPatch {
    filePath: string;
    originalContent: string;
    appliedContent: string;
    backupPath: string;
}
export interface FixRunResult {
    runId: string;
    fixMode: FixMode;
    projectRoot: string;
    startedAt: string;
    completedAt?: string;
    durationMs: number;
    totalCandidates: number;
    applied: FixItemResult[];
    rejected: FixItemResult[];
    deferred: FixItemResult[];
    patchResult: PatchResult;
    validation: ValidationSummary;
    rollback?: RollbackRecord;
    fixPlanPath?: string;
    patchDiffPath?: string;
    resultJsonPath?: string;
    gitWasDirty: boolean;
    workedInWorktree: boolean;
}
export interface InteractiveConfirm {
    type: 'confirm';
    candidate: FixCandidate;
    prompt: string;
}
export interface InteractiveResult {
    action: 'apply' | 'skip' | 'abort';
    candidateId: string;
    reason?: string;
}
//# sourceMappingURL=types.d.ts.map