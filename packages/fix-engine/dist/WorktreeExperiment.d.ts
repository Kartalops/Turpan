import type { Finding } from '@turpan/core';
import type { PatchCandidate, PatchExperiment, ReproductionCheck, SelfHealingPolicy } from './autofixTypes.js';
export interface ExperimentCommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    durationMs: number;
    timedOut?: boolean;
}
export interface ExperimentRunner {
    run(command: string, cwd: string, timeoutMs?: number): Promise<ExperimentCommandResult>;
}
export interface WorktreeManager {
    create(experimentId: string): Promise<string>;
    destroy(worktreePath: string): Promise<void>;
}
export interface PatchExperimentOptions {
    projectRoot: string;
    finding: Finding;
    candidate: PatchCandidate;
    reproductions?: ReproductionCheck[];
    policy?: Partial<SelfHealingPolicy>;
    runner: ExperimentRunner;
    worktrees?: WorktreeManager;
}
export declare class GitWorktreeManager implements WorktreeManager {
    private readonly projectRoot;
    constructor(projectRoot: string);
    create(experimentId: string): Promise<string>;
    destroy(worktreePath: string): Promise<void>;
}
export declare function runPatchExperiment(options: PatchExperimentOptions): Promise<PatchExperiment>;
//# sourceMappingURL=WorktreeExperiment.d.ts.map