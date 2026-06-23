/**
 * @turpan/fix-engine — shared types
 */

import type { Finding } from '@turpan/core';

// ─── Fix Mode ────────────────────────────────────────────────────────────────

export type FixMode =
  | 'report-only'   // default — analyze and report, no modifications
  | 'patch-only'    // generate patch diff, do not apply
  | 'apply'         // apply patch to working tree
  | 'interactive'   // ask before applying each fix
  | 'auto-safe';    // apply only safe fix categories automatically

// ─── Fix Category ────────────────────────────────────────────────────────────

export type FixCategory =
  | 'safe'        // low-risk, reversible, compiler/linter confirmed
  | 'unsafe'      // high-risk, never auto-apply
  | 'manual';     // fixable but requires human judgment

// ─── Fix Decision ────────────────────────────────────────────────────────────

export type FixDecision =
  | 'applied'
  | 'rejected'
  | 'deferred';   // awaiting user confirmation (interactive mode)

// ─── Rejection Reason ────────────────────────────────────────────────────────

export type RejectionReason =
  | 'unsafe-category'
  | 'below-confidence-threshold'
  | 'policy-blocked'
  | 'user-declined'
  | 'validation-failed'
  | 'unknown-file'
  | 'git-dirty';

// ─── Validation Check Types ──────────────────────────────────────────────────

export type ValidationCheck =
  | 'build'
  | 'typecheck'
  | 'lint'
  | 'test'
  | 'ui-test';

// ─── Validation Result ────────────────────────────────────────────────────────

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

// ─── Fix Candidate ───────────────────────────────────────────────────────────

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

// ─── Fix Policy ─────────────────────────────────────────────────────────────

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

// ─── Patch Result ────────────────────────────────────────────────────────────

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

// ─── Individual Fix Result ───────────────────────────────────────────────────

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

// ─── Rollback Record ─────────────────────────────────────────────────────────

export interface RollbackRecord {
  runId: string;
  timestamp: string;
  reason: string;
  patches: RollbackPatch[];
  validationFailed: boolean;
  appliedFingerprints: string[]; // git commit hashes before each patch
}

export interface RollbackPatch {
  filePath: string;
  originalContent: string;
  appliedContent: string;
  backupPath: string;
}

// ─── Complete Fix Run Result ─────────────────────────────────────────────────

export interface FixRunResult {
  runId: string;
  fixMode: FixMode;
  projectRoot: string;
  startedAt: string;
  completedAt?: string;
  durationMs: number;

  // Candidates
  totalCandidates: number;
  applied: FixItemResult[];
  rejected: FixItemResult[];
  deferred: FixItemResult[];

  // Patch
  patchResult: PatchResult;

  // Validation
  validation: ValidationSummary;

  // Rollback
  rollback?: RollbackRecord;

  // Output files
  fixPlanPath?: string;
  patchDiffPath?: string;
  resultJsonPath?: string;

  // Git state
  gitWasDirty: boolean;
  workedInWorktree: boolean;
}

// ─── Interactive Confirm Options ─────────────────────────────────────────────

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
