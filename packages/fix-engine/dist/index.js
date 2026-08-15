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
// ─── Types ────────────────────────────────────────────────────────────────────
export * from './types.js';
// ─── Policy ──────────────────────────────────────────────────────────────────
export { DEFAULT_FIX_POLICY, policyForMode, mergePolicy, isAutoApplicable, isModeAllowed, requiresConfirmation, validatePolicy, } from './FixPolicy.js';
// ─── Safe Fix Catalog ─────────────────────────────────────────────────────────
export { lookupStrategy, isFixable, filterFixable, getSafeStrategies, UNSAFE_FIX_CATEGORIES, } from './SafeFixCatalog.js';
// ─── Fix Candidate ────────────────────────────────────────────────────────────
export { createFixCandidate, createFixCandidates, filterByCategory, filterByConfidence, getAutoSafeCandidates, aggregateRequiredChecks, groupByFile, extractSnippet, } from './FixCandidate.js';
// ─── Fix Planner ─────────────────────────────────────────────────────────────
export { buildFixPlan, buildFixRunResult, summarizePlan, } from './FixPlanner.js';
// ─── Patch Generator ──────────────────────────────────────────────────────────
export { generatePatch, generateSinglePatch, formatPatchHeader, } from './PatchGenerator.js';
// ─── Patch Applier ────────────────────────────────────────────────────────────
export { applyFixCandidates, dryRunPatchApply, } from './PatchApplier.js';
// ─── Patch Verifier ───────────────────────────────────────────────────────────
export { verifyPatch, shouldRollback, } from './PatchVerifier.js';
// ─── Rollback Manager ─────────────────────────────────────────────────────────
export { rollback, saveRollbackRecord, getCurrentCommitHash, getBackupDir, listBackups, parseBackupFilename, } from './RollbackManager.js';
// ─── Report Writer ────────────────────────────────────────────────────────────
export { writeFixReport, renderFixPlanReport, renderFixResultReport } from './reportWriter.js';
// ─── Evidence-Driven Autofix ─────────────────────────────────────────────────
export * from './autofixTypes.js';
export { classifyFixEligibility } from './FixEligibility.js';
export { checkPatchBudget, summarizeUnifiedDiff } from './PatchBudget.js';
export { selectImpactedTests } from './TestSelector.js';
export { assessRegressionTest } from './RegressionTestGuard.js';
export { adversarialPatchReview } from './PatchReviewer.js';
export { scorePatchExperiment, chooseSmallestProvenPatch } from './PatchScorer.js';
export { GitWorktreeManager, runPatchExperiment, } from './WorktreeExperiment.js';
export { buildPatchEvidenceReport } from './PatchEvidenceReport.js';
//# sourceMappingURL=index.js.map