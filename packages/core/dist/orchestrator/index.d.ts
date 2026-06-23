export * from './ReviewOrchestrator.js';
export * from './ReviewPlan.js';
export * from './ReviewStage.js';
export * from './ReviewContext.js';
export interface OrchestratorOptions {
    projectPath: string;
    isInteractive?: boolean;
    deepAnalysis?: boolean;
    uiAnalysis?: boolean;
    fixMode?: boolean;
    install?: boolean;
    timeoutMs?: number;
    skipBuild?: boolean;
    skipTests?: boolean;
    skipLint?: boolean;
    skipTypecheck?: boolean;
    skipStaticQuality?: boolean;
    skipSecurity?: boolean;
    skipDeadCode?: boolean;
    skipUi?: boolean;
    skipRuntime?: boolean;
    /** Comma-separated scenario IDs for UI testing (e.g. auth,marketing) */
    uiScenarios?: string[];
    /** Skip scenario library execution in UI tests */
    skipScenarios?: boolean;
    /** Plugin IDs to enable for this run */
    plugins?: string[];
    /** Enable dependency audit (CVE scanning + license audit) */
    dependencyAudit?: boolean;
    /** Enable online CVE scanning (OSV/npm audit) — requires dependencyAudit=true */
    dependencyAuditOnline?: boolean;
    /** AbortSignal for cancellation */
    signal?: AbortSignal;
    /** Diff-review mode: focus on changed files from a git diff */
    diffMode?: boolean;
    /** Git diff result — required when diffMode is true */
    diffResult?: import('@turpan/git-diff').GitDiffResult;
    /** Base ref for diff review (e.g. main, origin/main) */
    diffBaseRef?: string;
    /** Target ref for diff review (e.g. HEAD, feature branch) */
    diffTargetRef?: string;
}
/**
 * Main entry point used by the CLI.
 * Detects fingerprint, runs the orchestrator, writes reports.
 */
export declare function runAnalysis(options: OrchestratorOptions): Promise<string>;
/**
 * Plan-only: print the stages that WOULD run without executing them.
 */
export declare function planAnalysis(projectPath: string, options?: {
    deepAnalysis?: boolean;
    uiAnalysis?: boolean;
}): Promise<void>;
export declare function runDoctorCheck(): Promise<{
    ok: boolean;
    checks: Array<{
        name: string;
        ok: boolean;
        message: string;
    }>;
}>;
//# sourceMappingURL=index.d.ts.map