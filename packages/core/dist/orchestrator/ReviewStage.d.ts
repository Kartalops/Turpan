/**
 * ReviewStage — a single unit of review work
 */
import type { Finding } from '../findings/Finding.js';
export type StageId = 'project-fingerprint' | 'install-check' | 'diff-scoped' | 'script-detection' | 'build' | 'test' | 'lint' | 'typecheck' | 'static-quality' | 'security-basic' | 'dead-code-basic' | 'ui-live-basic' | 'runtime' | 'report';
export type StageStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed';
export interface StageResult {
    stageId: StageId;
    status: StageStatus;
    findings: Finding[];
    durationMs: number;
    error?: string;
    artifacts?: Record<string, unknown>;
}
export interface ReviewStage {
    id: StageId;
    label: string;
    description: string;
    /** Whether this stage runs by default */
    default: boolean;
    /** Categories of findings this stage produces */
    categories: string[];
    /** Human-readable estimated time */
    estimatedTime?: string;
    /** Run this stage */
    run(ctx: ReviewStageContext): Promise<StageResult>;
}
export interface ReviewStageContext {
    projectRoot: string;
    runId: string;
    deepAnalysis: boolean;
    uiAnalysis: boolean;
    fixMode: boolean;
    signal?: AbortSignal;
}
/** Placeholder stage — returns empty result. Real stages implemented in next phase. */
export declare function placeholderStage(ctx: ReviewStageContext, id: StageId, label: string): Promise<StageResult>;
//# sourceMappingURL=ReviewStage.d.ts.map