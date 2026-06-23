/**
 * Diff-scoped stage — runs diff-scoped security, correctness, and test-coverage
 * analyzers against the git diff when diffMode is enabled.
 */
import type { ReviewContext } from '../../orchestrator/ReviewContext.js';
import type { StageResult } from '../../orchestrator/ReviewStage.js';
export declare function runDiffScopedStage(ctx: ReviewContext): Promise<StageResult>;
//# sourceMappingURL=diffScopedStage.d.ts.map