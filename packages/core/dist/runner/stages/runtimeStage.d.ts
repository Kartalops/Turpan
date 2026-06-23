/**
 * Runtime Stage — runs all runtime analyzers for Python bots, FastAPI, Node backends,
 * CLI tools, workers, and MCP servers.
 */
import type { ReviewContext } from '../../orchestrator/ReviewContext.js';
import type { StageResult } from '../../orchestrator/ReviewStage.js';
/**
 * Run the runtime analyzers for a project.
 * This stage covers Python bots, FastAPI backends, Node backends,
 * CLI tools, workers, and MCP servers.
 */
export declare function runRuntimeStage(ctx: ReviewContext): Promise<StageResult>;
//# sourceMappingURL=runtimeStage.d.ts.map