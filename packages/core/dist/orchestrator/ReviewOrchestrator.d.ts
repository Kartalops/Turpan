/**
 * ReviewOrchestrator — drives the full review pipeline
 */
import type { ProjectFingerprint } from '../project/index.js';
import type { TurpanConfig } from '@turpan/shared';
import type { ReviewPlan } from './ReviewPlan.js';
import type { StageId } from './ReviewStage.js';
import { type ScoreBreakdown } from '../findings/score.js';
import { type Finding } from '../findings/Finding.js';
export interface OrchestratorConfig {
    projectPath: string;
    fingerprint: ProjectFingerprint;
    config: TurpanConfig;
    deepAnalysis?: boolean;
    uiAnalysis?: boolean;
    fixMode?: boolean;
    signal?: AbortSignal;
    /** Override which stages run. If not set, all applicable stages from ReviewPlan run. */
    stageOverrides?: StageId[];
    /** Run install even if node_modules exists */
    install?: boolean;
    /** Timeout per command in ms (default: 120_000) */
    timeoutMs?: number;
    /** Skip build stage */
    skipBuild?: boolean;
    /** Skip test stage */
    skipTests?: boolean;
    /** Skip lint stage */
    skipLint?: boolean;
    /** Skip typecheck stage */
    skipTypecheck?: boolean;
    /** Skip UI analysis stage */
    skipUi?: boolean;
    /** Skip runtime analysis stage */
    skipRuntime?: boolean;
    /** Plugin IDs to load for this review (overrides auto-detection) */
    plugins?: string[];
    /** Scenario IDs for UI testing */
    uiScenarios?: string[];
    /** Skip scenario library execution */
    skipScenarios?: boolean;
    /** Diff-review mode: focus on changed files from a git diff */
    diffMode?: boolean;
    /** The git diff result — required when diffMode is true */
    diffResult?: import('@turpan/git-diff').GitDiffResult;
}
export interface OrchestratorResult {
    runId: string;
    projectRoot: string;
    plan: ReviewPlan;
    scorecard: ScoreBreakdown;
    verdict: 'GO' | 'CONDITIONAL_GO' | 'NO_GO' | 'INTERNAL_ONLY';
    findings: Finding[];
    stageResults: Array<{
        stageId: string;
        status: string;
        durationMs: number;
        findingCount: number;
        error?: string;
    }>;
    durationMs: number;
}
/**
 * Run the full review pipeline and return structured results.
 */
export declare function runReview(orchConfig: OrchestratorConfig): Promise<OrchestratorResult>;
/**
 * Plan-only: generate and return the ReviewPlan without running stages.
 */
export declare function planReview(projectPath: string, fingerprint: ProjectFingerprint, config: TurpanConfig, options?: {
    deepAnalysis?: boolean;
    uiAnalysis?: boolean;
    fixMode?: boolean;
}): ReviewPlan;
//# sourceMappingURL=ReviewOrchestrator.d.ts.map