/**
 * Lint Stage — runs detected lint commands safely.
 */
import type { ReviewContext } from '../../orchestrator/ReviewContext.js';
import type { StageResult } from '../../orchestrator/ReviewStage.js';
export declare function runLintStage(ctx: ReviewContext, options?: {
    timeoutMs?: number;
    skipLint?: boolean;
}): Promise<StageResult>;
//# sourceMappingURL=lintStage.d.ts.map