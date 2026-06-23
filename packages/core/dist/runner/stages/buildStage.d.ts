/**
 * Build Stage — runs detected build commands safely.
 */
import type { ReviewContext } from '../../orchestrator/ReviewContext.js';
import type { StageResult } from '../../orchestrator/ReviewStage.js';
export declare function runBuildStage(ctx: ReviewContext, options?: {
    timeoutMs?: number;
    skipBuild?: boolean;
}): Promise<StageResult>;
//# sourceMappingURL=buildStage.d.ts.map