/**
 * Script Detection Stage
 *
 * Validates that detected scripts actually exist in package.json
 * and checks for suspicious/missing scripts.
 */
import type { ReviewContext } from '../../orchestrator/ReviewContext.js';
import type { StageResult } from '../../orchestrator/ReviewStage.js';
export declare function runScriptDetection(ctx: ReviewContext): Promise<StageResult>;
//# sourceMappingURL=scriptDetection.d.ts.map