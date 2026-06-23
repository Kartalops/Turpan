/**
 * PatchApplier — applies patches to the filesystem.
 *
 * Safety:
 *  - Prefers working in a git worktree (`.turpan/worktrees/<run-id>`)
 *  - Falls back to direct file patching with backup
 *  - Backs up original files before modification
 *  - Never modifies files outside the project root
 */
import type { FixCandidate } from './types.js';
export interface ApplyOptions {
    /** Working directory for the project */
    projectRoot: string;
    /** Run ID for worktree naming */
    runId: string;
    /** Whether to work in a git worktree (recommended) */
    useWorktree: boolean;
    /** Whether to apply to the actual working tree (false = dry run) */
    dryRun: boolean;
    /** Whether to create backup files */
    backup: boolean;
}
export interface ApplyResult {
    success: boolean;
    /** Files that were modified */
    modified: string[];
    /** Files that were created */
    created: string[];
    /** Files that were deleted */
    deleted: string[];
    /** Backups created */
    backups: string[];
    /** Worktree path if used */
    worktreePath?: string;
    /** Error if failed */
    error?: string;
}
/**
 * Apply a list of FixCandidates to the filesystem.
 *
 * In patch-only or dry-run mode: validates patch would apply cleanly.
 * In apply mode: actually modifies files.
 */
export declare function applyFixCandidates(candidates: FixCandidate[], options: ApplyOptions): Promise<ApplyResult>;
/**
 * Check if `git apply` would succeed for a patch without actually applying it.
 */
export declare function dryRunPatchApply(patchContent: string, projectRoot: string): {
    success: boolean;
    error?: string;
};
//# sourceMappingURL=PatchApplier.d.ts.map