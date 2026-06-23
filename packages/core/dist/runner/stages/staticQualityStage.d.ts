/**
 * Static Quality Stage — runs all static quality analyzers
 * Handles: static-quality, dead-code-basic, security-basic StageIds
 */
import type { ReviewContext } from '../../orchestrator/ReviewContext.js';
import type { StageResult, StageId } from '../../orchestrator/ReviewStage.js';
/**
 * Run the static quality / dead-code / security analyzers.
 * Acts as a single stage that fans out to multiple analyzers.
 */
export declare function runStaticQualityStage(ctx: ReviewContext, stageId?: StageId): Promise<StageResult>;
//# sourceMappingURL=staticQualityStage.d.ts.map