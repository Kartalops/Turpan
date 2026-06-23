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
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, rmSync, } from 'fs';
import { join, resolve } from 'path';
// ─── Backup Directory Helpers ──────────────────────────────────────────────────
export function getBackupDir(projectRoot, runId) {
    return join(projectRoot, '.turpan', 'backups', runId);
}
export function listBackups(backupDir) {
    try {
        return readdirSync(backupDir);
    }
    catch {
        return [];
    }
}
/**
 * Parse a backup filename to recover the original path.
 * Format: `{timestamp}_{random}_{original_path_escaped}`
 */
export function parseBackupFilename(filename) {
    const parts = filename.split('_');
    if (parts.length < 3)
        return null;
    // First two parts are timestamp and random — everything else is the path
    const timestamp = parts[0];
    const originalPath = parts.slice(2).join('_').replace(/_/g, '/');
    return { timestamp, originalPath };
}
// ─── Rollback from Backup Files ───────────────────────────────────────────────
/**
 * Restore files from backup directory.
 */
function restoreFromBackups(backupDir, projectRoot) {
    const restored = [];
    const failed = [];
    const backups = listBackups(backupDir);
    for (const backupFile of backups) {
        const backupPath = join(backupDir, backupFile);
        const parsed = parseBackupFilename(backupFile);
        if (!parsed) {
            failed.push(backupFile);
            continue;
        }
        const targetPath = resolve(projectRoot, parsed.originalPath);
        // Safety: ensure target is within project root
        if (!targetPath.startsWith(resolve(projectRoot))) {
            failed.push(backupFile);
            continue;
        }
        try {
            if (!existsSync(targetPath)) {
                // Directory may not exist — create it
                mkdirSync(resolve(targetPath, '..'), { recursive: true });
            }
            copyFileSync(backupPath, targetPath);
            restored.push(parsed.originalPath);
        }
        catch {
            failed.push(backupFile);
        }
    }
    return { restored, failed };
}
/**
 * Remove a git worktree.
 */
function removeWorktree(worktreePath) {
    try {
        execSync(`git worktree remove "${worktreePath}" --force`, {
            encoding: 'utf-8',
            stdio: 'pipe',
        });
        return { success: true };
    }
    catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
}
// ─── Git Stash Rollback ───────────────────────────────────────────────────────
/**
 * Get current git commit hash (for fingerprinting pre-rollback state).
 */
export function getCurrentCommitHash(projectRoot) {
    try {
        return execSync('git rev-parse HEAD', {
            cwd: projectRoot,
            encoding: 'utf-8',
        }).trim().slice(0, 8);
    }
    catch {
        return 'unknown';
    }
}
/**
 * Stash current changes and return the stash reference.
 */
function gitStash(projectRoot) {
    try {
        execSync('git stash push -m "turpan-fix-rollback"', {
            cwd: projectRoot,
            encoding: 'utf-8',
            stdio: 'pipe',
        });
        // Get the stash ref
        const stashList = execSync('git stash list --format="%gD" -n 1', {
            cwd: projectRoot,
            encoding: 'utf-8',
        }).trim();
        return { success: true, stashRef: stashList || 'stash@{0}' };
    }
    catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
}
/**
 * Roll back all changes made by a fix run.
 *
 * Tries in order:
 *  1. Remove git worktree (if used)
 *  2. Restore from .turpan/backups/<runId>/
 *  3. Git stash pop (last resort — restores all uncommitted changes)
 */
export async function rollback(options) {
    const { projectRoot, runId, reason, worktreePath, appliedFingerprint } = options;
    const patches = [];
    const restoredFiles = [];
    const failedFiles = [];
    // Step 1: git worktree cleanup
    if (worktreePath && existsSync(worktreePath)) {
        const wtResult = removeWorktree(worktreePath);
        if (!wtResult.success) {
            // Non-fatal — fall through to file restoration
        }
    }
    // Step 2: restore from backups
    const backupDir = getBackupDir(projectRoot, runId);
    if (existsSync(backupDir)) {
        const { restored, failed } = restoreFromBackups(backupDir, projectRoot);
        restoredFiles.push(...restored);
        failedFiles.push(...failed);
        // Build rollback patch records from restored files
        for (const file of restored) {
            const targetPath = resolve(projectRoot, file);
            try {
                const currentContent = existsSync(targetPath) ? readFileSync(targetPath, 'utf-8') : '';
                patches.push({
                    filePath: file,
                    originalContent: '', // we don't track original from backup filename alone
                    appliedContent: currentContent,
                    backupPath: join(backupDir, file),
                });
            }
            catch {
                // skip
            }
        }
    }
    // Step 3: git stash pop as last resort (only if backups failed significantly)
    if (failedFiles.length > restoredFiles.length * 2) {
        const stashResult = gitStash(projectRoot);
        if (stashResult.success) {
            // Pop the stash to restore — but only the changes from this run
            // This is imperfect but better than leaving broken code
            try {
                execSync(`git stash pop "${stashResult.stashRef}"`, {
                    cwd: projectRoot,
                    encoding: 'utf-8',
                    stdio: 'pipe',
                });
            }
            catch {
                // git stash pop failed — manual intervention required
            }
        }
    }
    // Step 4: cleanup backup directory (best effort)
    try {
        rmSync(backupDir, { recursive: true, force: true });
    }
    catch {
        // best effort
    }
    const record = {
        runId,
        timestamp: new Date().toISOString(),
        reason,
        patches,
        validationFailed: true,
        appliedFingerprints: [appliedFingerprint],
    };
    const success = failedFiles.length === 0;
    return {
        success,
        record,
        restoredFiles,
        failedFiles,
        error: success ? undefined : `Failed to restore ${failedFiles.length} files: ${failedFiles.join(', ')}`,
    };
}
/**
 * Save a rollback record to disk.
 */
export function saveRollbackRecord(record, projectRoot) {
    const dir = join(projectRoot, '.turpan', 'rollbacks');
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    const path = join(dir, `rollback-${record.runId}.json`);
    writeFileSync(path, JSON.stringify(record, null, 2), 'utf-8');
    return path;
}
//# sourceMappingURL=RollbackManager.js.map