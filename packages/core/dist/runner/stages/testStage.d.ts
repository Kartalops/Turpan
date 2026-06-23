/**
 * Test Stage — runs detected test commands safely.
 */
import type { ReviewContext } from '../../orchestrator/ReviewContext.js';
import type { StageResult } from '../../orchestrator/ReviewStage.js';
export declare function runTestStage(ctx: ReviewContext, options?: {
    timeoutMs?: number;
    skipTests?: boolean;
}): Promise<StageResult>;
//# sourceMappingURL=testStage.d.ts.map