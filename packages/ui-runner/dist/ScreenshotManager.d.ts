/**
 * ScreenshotManager — capture and organize UI screenshots.
 *
 * Artifacts written to:
 *   .turpan/runs/<runId>/screenshots/<viewport>/<route-slug>.png
 */
import type { Page } from 'playwright';
import type { ScreenshotArtifact, ViewportConfig } from './types.js';
export declare class ScreenshotManager {
    private baseDir;
    private artifacts;
    constructor(baseDir: string);
    /**
     * Capture a screenshot of the current page state.
     */
    capture(page: Page, routePath: string, viewport: ViewportConfig, label?: string): Promise<ScreenshotArtifact>;
    /**
     * Capture a screenshot of just the visible viewport (not full page).
     */
    captureViewport(page: Page, routePath: string, viewport: ViewportConfig, label?: string): Promise<ScreenshotArtifact>;
    getArtifacts(): ScreenshotArtifact[];
    private slugifyRoute;
}
//# sourceMappingURL=ScreenshotManager.d.ts.map