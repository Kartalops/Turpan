/**
 * Install Check Stage
 *
 * Does NOT auto-install dependencies unless explicitly requested.
 * Reports if node_modules is missing (requires install).
 * Runs install command only if --install CLI flag is set or config.autoInstall is true.
 */
import type { ReviewContext } from '../../orchestrator/ReviewContext.js';
import type { StageResult } from '../../orchestrator/ReviewStage.js';
export interface InstallCheckOptions {
    /** Run install even if node_modules exists */
    force?: boolean;
    /** Custom install command to run */
    installCommand?: string;
}
export declare function runInstallCheck(ctx: ReviewContext, options?: InstallCheckOptions): Promise<StageResult>;
//# sourceMappingURL=installCheck.d.ts.map