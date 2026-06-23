/**
 * @turpan/git-diff — Read-only git diff types
 */
type ChangeType = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
interface ChangedFile {
    /** Absolute or repo-relative path */
    path: string;
    changeType: ChangeType;
    /** Lines added / deleted (from git diff --numstat) */
    linesAdded: number;
    linesDeleted: number;
    /** For renames: the original path */
    oldPath?: string;
    /** Binary file indicator */
    binary: boolean;
    /** Score (for renames/copies, 0-100) */
    score?: number;
}
interface DiffHunk {
    filePath: string;
    hunkIndex: number;
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: DiffLine[];
}
type DiffLineType = 'context' | 'added' | 'deleted';
interface DiffLine {
    type: DiffLineType;
    content: string;
    oldLineNumber?: number;
    newLineNumber?: number;
}
type FileOwnership = 'frontend' | 'backend' | 'shared' | 'config' | 'test' | 'docs' | 'infra' | 'unknown';
interface FileOwnershipHint {
    file: string;
    ownership: FileOwnership;
    confidence: number;
}
interface ChangedRoute {
    route: string;
    method?: string;
    file: string;
    changeType: ChangeType;
}
interface ChangedApi {
    path: string;
    method?: string;
    file: string;
    changeType: ChangeType;
}
interface ChangedComponent {
    name: string;
    file: string;
    changeType: ChangeType;
}
interface DiffStats {
    totalFiles: number;
    filesAdded: number;
    filesModified: number;
    filesDeleted: number;
    filesRenamed: number;
    totalLinesAdded: number;
    totalLinesDeleted: number;
    totalAdditions: number;
    totalDeletions: number;
}
interface DiffRiskLevel {
    level: 'low' | 'medium' | 'high' | 'critical';
    reasons: string[];
    files: string[];
}
interface GitDiffResult {
    baseRef: string;
    targetRef: string;
    /** Ordered list of changed files */
    files: ChangedFile[];
    hunks: DiffHunk[];
    stats: DiffStats;
    ownership: FileOwnershipHint[];
    changedRoutes: ChangedRoute[];
    changedApis: ChangedApi[];
    changedComponents: ChangedComponent[];
    riskLevel: DiffRiskLevel;
    /** True if the working tree had uncommitted changes */
    hasWorkingTreeChanges: boolean;
    /** True if refs don't exist in repo */
    refError?: string;
    /** Only present when getDiff is called on non-git-dir (always undefined in normal use) */
    _test?: never;
}
interface DiffReviewRecommendation {
    decision: 'approve' | 'request_changes' | 'block_merge';
    confidence: 'high' | 'medium' | 'low';
    summary: string;
    reasons: string[];
    findings: DiffFinding[];
}
interface DiffFinding {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    category: string;
    title: string;
    explanation: string;
    file?: string;
    line?: number;
    diffLines?: DiffLine[];
    introducedBy: 'added' | 'modified' | 'deleted' | 'renamed';
}

/**
 * GitDiffEngine — read-only git diff detection and analysis.
 * SAFETY: This module NEVER modifies git state. All operations are read-only.
 * Forbidden: git commit, push, reset, rebase, merge, checkout, stash, clean.
 */

declare function isPathAffectedByDiff(diff: GitDiffResult, filePath: string): boolean;
declare function computeDiffRecommendation(diff: GitDiffResult, additionalFindings?: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    id: string;
    title: string;
}>): DiffReviewRecommendation;
declare class GitDiffEngine {
    private cwd;
    constructor(cwd: string);
    getDiff(baseRef: string, targetRef: string): GitDiffResult;
    isAffected(diff: GitDiffResult, filePath: string): boolean;
    deriveRecommendation(diff: GitDiffResult): DiffReviewRecommendation;
    getChangedFiles(baseRef: string, targetRef: string): ChangedFile[];
    getAvailableRefs(): {
        branches: string[];
        tags: string[];
        current: string;
    };
    private parseHunks;
}

export { type ChangeType, type ChangedApi, type ChangedComponent, type ChangedFile, type ChangedRoute, type DiffFinding, type DiffHunk, type DiffLine, type DiffLineType, type DiffReviewRecommendation, type DiffRiskLevel, type DiffStats, type FileOwnership, type FileOwnershipHint, GitDiffEngine, type GitDiffResult, computeDiffRecommendation, isPathAffectedByDiff };
