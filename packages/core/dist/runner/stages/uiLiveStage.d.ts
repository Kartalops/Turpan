/**
 * uiLiveStage — runs live UI tests with the scenario library.
 *
 * Uses @turpan/ui-runner to:
 *  1. Start the dev server (or use provided URL)
 *  2. Discover routes
 *  3. Run viewport tests (desktop + mobile)
 *  4. Execute the Real Scenario Library (auth, billing, dashboard, etc.)
 *  5. Produce structured findings
 */
import type { ReviewContext } from '../../orchestrator/ReviewContext.js';
import type { StageResult } from '../../orchestrator/ReviewStage.js';
export interface UiLiveStageOptions {
    /** URL to test — skips server start if provided */
    url?: string;
    /** Run in headed browser */
    headed?: boolean;
    /** Only test mobile viewport */
    mobileOnly?: boolean;
    /** Only test desktop viewport */
    desktopOnly?: boolean;
    /** Scenario IDs to run (omit for all supported) */
    scenarios?: string[];
    /** Skip scenario library execution */
    skipScenarios?: boolean;
}
export declare function runUiLiveStage(ctx: ReviewContext, opts?: UiLiveStageOptions): Promise<StageResult>;
//# sourceMappingURL=uiLiveStage.d.ts.map