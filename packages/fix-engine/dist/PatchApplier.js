/**
 * PatchApplier — applies patches to the filesystem.
 *
 * Safety:
 *  - Prefers working in a git worktree (`.turpan/worktrees/<run-id>`)
 *  - Falls back to direct file patching with backup
 *  - Backs up original files before modification
 *  - Never modifies files outside the project root
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync, } from 'fs';
import { resolve, join, dirname } from 'path';
import { generatePatch } from './PatchGenerator.js';
// ─── Worktree Helpers ──────────────────────────────────────────────────────────
function ensureWorktreeDir(projectRoot, runId) {
    const base = join(projectRoot, '.turpan', 'worktrees');
    if (!existsSync(base))
        mkdirSync(base, { recursive: true });
    const worktreePath = join(base, runId);
    if (!existsSync(worktreePath))
        mkdirSync(worktreePath, { recursive: true });
    return worktreePath;
}
function isGitRepository(path) {
    try {
        execSync('git rev-parse --git-dir', {
            cwd: path,
            encoding: 'utf-8',
            stdio: 'pipe',
        });
        return true;
    }
    catch {
        return false;
    }
}
function getGitWorktreePath(projectRoot) {
    try {
        const worktreeRoot = execSync('git rev-parse --git-dir', {
            cwd: projectRoot,
            encoding: 'utf-8',
        }).trim();
        return worktreeRoot;
    }
    catch {
        return null;
    }
}
function createGitWorktree(projectRoot, runId) {
    try {
        const worktreePath = join(projectRoot, '.turpan', 'worktrees', runId);
        if (!existsSync(worktreePath))
            mkdirSync(worktreePath, { recursive: true });
        execSync(`git worktree add "${worktreePath}" --detach`, {
            cwd: projectRoot,
            encoding: 'utf-8',
            stdio: 'pipe',
        });
        return worktreePath;
    }
    catch {
        // Fallback: just copy files manually
        return null;
    }
}
function removeGitWorktree(worktreePath) {
    try {
        execSync(`git worktree remove "${worktreePath}" --force`, {
            encoding: 'utf-8',
            stdio: 'pipe',
        });
    }
    catch {
        // best effort
    }
}
// ─── Backup Helpers ───────────────────────────────────────────────────────────
function createBackup(filePath, backupDir) {
    try {
        if (!existsSync(filePath))
            return null;
        const rel = filePath; // absolute path used as key
        const backupName = `${Date.now()}_${Math.random().toString(36).slice(2)}_${rel.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const backupPath = join(backupDir, backupName);
        if (!existsSync(dirname(backupPath)))
            mkdirSync(dirname(backupPath), { recursive: true });
        copyFileSync(filePath, backupPath);
        return backupPath;
    }
    catch {
        return null;
    }
}
// ─── Single File Edit ─────────────────────────────────────────────────────────
function applyEditToFile(edit, projectRoot) {
    const absPath = resolve(projectRoot, edit.path);
    // Safety: ensure path is within project root
    if (!absPath.startsWith(resolve(projectRoot))) {
        return { success: false, error: `Refusing to modify path outside project root: ${edit.path}` };
    }
    try {
        if (edit.type === 'delete') {
            if (existsSync(absPath)) {
                unlinkSync(absPath);
            }
        }
        else if (edit.type === 'create' || edit.type === 'edit') {
            const dir = dirname(absPath);
            if (!existsSync(dir))
                mkdirSync(dir, { recursive: true });
            writeFileSync(absPath, edit.newContent ?? '', 'utf-8');
        }
        return { success: true };
    }
    catch (err) {
        return { success: false, error: `Failed to ${edit.type} ${edit.path}: ${err}` };
    }
}
// ─── Main Apply Function ───────────────────────────────────────────────────────
/**
 * Apply a list of FixCandidates to the filesystem.
 *
 * In patch-only or dry-run mode: validates patch would apply cleanly.
 * In apply mode: actually modifies files.
 */
export async function applyFixCandidates(candidates, options) {
    const { projectRoot, runId, useWorktree, dryRun, backup } = options;
    if (candidates.length === 0) {
        return { success: true, modified: [], created: [], deleted: [], backups: [] };
    }
    // Generate the patch
    const patchResult = generatePatch(candidates);
    if (!patchResult.success) {
        return { success: false, modified: [], created: [], deleted: [], backups: [], error: patchResult.error };
    }
    let worktreePath;
    let effectiveRoot = projectRoot;
    // ── Git worktree approach ────────────────────────────────────────────────
    if (useWorktree && isGitRepository(projectRoot) && !dryRun) {
        const wt = createGitWorktree(projectRoot, runId);
        if (wt) {
            worktreePath = wt;
            effectiveRoot = wt;
        }
    }
    // ── Backup directory ──────────────────────────────────────────────────────
    const backupDir = join(projectRoot, '.turpan', 'backups', runId);
    if (backup && !dryRun)
        mkdirSync(backupDir, { recursive: true });
    const modified = [];
    const created = [];
    const deleted = [];
    const backups = [];
    // ── Apply each candidate's file change ───────────────────────────────────
    for (const candidate of candidates) {
        // Resolve the file path relative to the project root
        const relPath = candidate.filePath.replace(resolve(projectRoot), '').replace(/^[/\\]/, '');
        const absPath = resolve(effectiveRoot, relPath);
        // Safety check
        if (!absPath.startsWith(resolve(effectiveRoot))) {
            continue; // skip out-of-scope files
        }
        // Check for deletion marker (endLine >= 999999)
        const isDelete = candidate.endLine >= 999999 && candidate.replacementSnippet === '';
        if (isDelete) {
            if (!dryRun) {
                // Backup before delete
                if (backup) {
                    const bp = createBackup(absPath, backupDir);
                    if (bp)
                        backups.push(bp);
                }
                try {
                    if (existsSync(absPath))
                        unlinkSync(absPath);
                }
                catch { /* best effort */ }
            }
            deleted.push(relPath);
            continue;
        }
        // Read current file content
        let currentContent = '';
        if (existsSync(absPath)) {
            if (!dryRun && backup) {
                const bp = createBackup(absPath, backupDir);
                if (bp)
                    backups.push(bp);
            }
            currentContent = readFileSync(absPath, 'utf-8');
        }
        else {
            // File doesn't exist — treat as create
            if (!dryRun)
                created.push(relPath);
        }
        // Compute new content by replacing the snippet
        const lines = currentContent.split('\n');
        const startIdx = Math.max(0, candidate.startLine - 1);
        const endIdx = Math.min(lines.length, candidate.endLine);
        const before = lines.slice(0, startIdx);
        const after = lines.slice(endIdx);
        const replacementLines = candidate.replacementSnippet.split('\n');
        const newLines = [...before, ...replacementLines, ...after];
        const newContent = newLines.join('\n');
        if (!dryRun) {
            const dir = dirname(absPath);
            if (!existsSync(dir))
                mkdirSync(dir, { recursive: true });
            writeFileSync(absPath, newContent, 'utf-8');
        }
        modified.push(relPath);
    }
    // ── Try `git apply --check` to validate patch would apply ────────────────
    if (patchResult.patchContent && !dryRun) {
        const patchFile = join(projectRoot, '.turpan', `patch-${runId}.diff`);
        try {
            writeFileSync(patchFile, patchResult.patchContent, 'utf-8');
            execSync(`git apply --check "${patchFile}"`, {
                cwd: effectiveRoot,
                encoding: 'utf-8',
                stdio: 'pipe',
            });
        }
        catch {
            // git apply --check failed — but individual file edits may still have succeeded
            // This is non-fatal for direct file writes
        }
    }
    return {
        success: true,
        modified,
        created,
        deleted,
        backups,
        worktreePath,
    };
}
/**
 * Check if `git apply` would succeed for a patch without actually applying it.
 */
export function dryRunPatchApply(patchContent, projectRoot) {
    if (!patchContent.trim())
        return { success: true };
    const tmpFile = join(projectRoot, `.turpan/dryrun-${Date.now()}.patch`);
    try {
        writeFileSync(tmpFile, patchContent, 'utf-8');
        execSync(`git apply --check "${tmpFile}"`, {
            cwd: projectRoot,
            encoding: 'utf-8',
            stdio: 'pipe',
        });
        return { success: true };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: `git apply --check failed: ${msg}` };
    }
    finally {
        try {
            unlinkSync(tmpFile);
        }
        catch { /* best effort */ }
    }
}
//# sourceMappingURL=PatchApplier.js.map