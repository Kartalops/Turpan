export interface GitInfo {
    branch: string;
    commitHash: string;
    isDirty: boolean;
    rootDir: string;
}
export declare function getGitInfo(projectPath: string): GitInfo | null;
export declare function isGitRepository(path: string): boolean;
//# sourceMappingURL=index.d.ts.map