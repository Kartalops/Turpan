/**
 * Detect Git
 * Enhanced git repository detection with more metadata
 */
export interface GitStatus {
    isGitRepo: boolean;
    branch?: string;
    commitHash?: string;
    isDirty?: boolean;
    rootDir?: string;
    tags?: string[];
    remotes?: string[];
}
export declare function detectGit(projectRoot: string): GitStatus;
/**
 * Get a short git status summary
 */
export declare function getGitSummary(status: GitStatus): string;
//# sourceMappingURL=detectGit.d.ts.map