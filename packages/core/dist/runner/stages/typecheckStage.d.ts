/**
 * Typecheck Stage — runs TypeScript type checking.
 *
 * Tries detected typecheck commands first; falls back to `tsc --noEmit`
 * if TypeScript is detected in the project.
 */
import type { ReviewContext } from '../../orchestrator/ReviewContext.js';
import type { StageResult } from '../../orchestrator/ReviewStage.js';
export declare function runTypecheckStage(ctx: ReviewContext, options?: {
    timeoutMs?: number;
    skipTypecheck?: boolean;
}): Promise<StageResult>;
//# sourceMappingURL=typecheckStage.d.ts.map