/**
 * RollbackManager — reverts applied patches when validation fails.
 *
 * Rollback strategies:
 *  1. Git worktree: simply remove the worktree
 *  2. Direct file patches: restore from backup files created before patching
 *  3. Git stash: stash current changes and restore (last resort)
 *
 * Rollback is atomic — either all files are restored or none.
 */
import type { RollbackRecord } from './types.js';
export declare function getBackupDir(projectRoot: string, runId: string): string;
export declare function listBackups(backupDir: string): string[];
/**
 * Parse a backup filename to recover the original path.
 * Format: `{timestamp}_{random}_{original_path_escaped}`
 */
export declare function parseBackupFilename(filename: string): {
    timestamp: string;
    originalPath: string;
} | null;
/**
 * Get current git commit hash (for fingerprinting pre-rollback state).
 */
export declare function getCurrentCommitHash(projectRoot: string): string;
export interface RollbackOptions {
    projectRoot: string;
    runId: string;
    reason: string;
    worktreePath?: string;
    appliedFingerprint: string;
}
export interface RollbackOutcome {
    success: boolean;
    record: RollbackRecord;
    /** Files restored from backup */
    restoredFiles: string[];
    /** Files that failed to restore */
    failedFiles: string[];
    error?: string;
}
/**
 * Roll back all changes made by a fix run.
 *
 * Tries in order:
 *  1. Remove git worktree (if used)
 *  2. Restore from .turpan/backups/<runId>/
 *  3. Git stash pop (last resort — restores all uncommitted changes)
 */
export declare function rollback(options: RollbackOptions): Promise<RollbackOutcome>;
/**
 * Save a rollback record to disk.
 */
export declare function saveRollbackRecord(record: RollbackRecord, projectRoot: string): string;
//# sourceMappingURL=RollbackManager.d.ts.map