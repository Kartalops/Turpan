/**
 * @turpan/fix-engine — Safe Fix Engine
 *
 * Finding-driven, minimal, reversible code fixes.
 *
 * Core workflow:
 *  FixPlanner.buildFixPlan() → FixPlan
 *  PatchGenerator.generatePatch() → unified diff
 *  PatchApplier.applyFixCandidates() → ApplyResult
 *  PatchVerifier.verifyPatch() → ValidationSummary
 *  RollbackManager.rollback() → RollbackOutcome
 *
 * Fix modes:
 *  report-only  — analyze and report, no modifications (default)
 *  patch-only   — generate patch diff, do not apply
 *  apply        — apply patch to working tree
 *  interactive  — ask before applying each fix
 *  auto-safe    — apply only safe fix categories automatically
 */
export * from './types.js';
export { DEFAULT_FIX_POLICY, policyForMode, mergePolicy, isAutoApplicable, isModeAllowed, requiresConfirmation, validatePolicy, } from './FixPolicy.js';
export type { FixPolicy } from './types.js';
export { lookupStrategy, isFixable, filterFixable, getSafeStrategies, UNSAFE_FIX_CATEGORIES, } from './SafeFixCatalog.js';
export type { FixStrategy, FixReplacement } from './SafeFixCatalog.js';
export { createFixCandidate, createFixCandidates, filterByCategory, filterByConfidence, getAutoSafeCandidates, aggregateRequiredChecks, groupByFile, extractSnippet, } from './FixCandidate.js';
export { buildFixPlan, buildFixRunResult, summarizePlan, } from './FixPlanner.js';
export type { FixPlannerConfig, FixPlan, PlanResult } from './FixPlanner.js';
export { generatePatch, generateSinglePatch, formatPatchHeader, } from './PatchGenerator.js';
export type { PatchResult } from './types.js';
export { applyFixCandidates, dryRunPatchApply, } from './PatchApplier.js';
export type { ApplyOptions, ApplyResult } from './PatchApplier.js';
export { verifyPatch, shouldRollback, } from './PatchVerifier.js';
export type { VerifyOptions } from './PatchVerifier.js';
export type { ValidationSummary, ValidationResult } from './types.js';
export { rollback, saveRollbackRecord, getCurrentCommitHash, getBackupDir, listBackups, parseBackupFilename, } from './RollbackManager.js';
export type { RollbackOptions, RollbackOutcome } from './RollbackManager.js';
export { writeFixReport, renderFixPlanReport, renderFixResultReport } from './reportWriter.js';
export type { ReportPaths } from './reportWriter.js';
//# sourceMappingURL=index.d.ts.map