/**
 * ScreenshotManager — capture and organize UI screenshots.
 *
 * Artifacts written to:
 *   .turpan/runs/<runId>/screenshots/<viewport>/<route-slug>.png
 */
import { mkdirSync } from 'fs';
import { join } from 'path';
export class ScreenshotManager {
    baseDir;
    artifacts = [];
    constructor(baseDir) {
        this.baseDir = baseDir;
        mkdirSync(this.baseDir, { recursive: true });
    }
    /**
     * Capture a screenshot of the current page state.
     */
    async capture(page, routePath, viewport, label) {
        const slug = this.slugifyRoute(routePath);
        const viewportDir = join(this.baseDir, viewport.name);
        mkdirSync(viewportDir, { recursive: true });
        const filename = label ? `${slug}--${label}.png` : `${slug}.png`;
        const filePath = join(viewportDir, filename);
        await page.screenshot({
            path: filePath,
            fullPage: true,
            timeout: 10_000,
        });
        const artifact = {
            route: routePath,
            viewport: viewport.name,
            path: filePath,
            url: page.url(),
        };
        this.artifacts.push(artifact);
        return artifact;
    }
    /**
     * Capture a screenshot of just the visible viewport (not full page).
     */
    async captureViewport(page, routePath, viewport, label) {
        const slug = this.slugifyRoute(routePath);
        const viewportDir = join(this.baseDir, viewport.name);
        mkdirSync(viewportDir, { recursive: true });
        const filename = label ? `${slug}--${viewport.name}--${label}.png` : `${slug}--${viewport.name}.png`;
        const filePath = join(viewportDir, filename);
        await page.screenshot({
            path: filePath,
            timeout: 10_000,
        });
        const artifact = {
            route: routePath,
            viewport: viewport.name,
            path: filePath,
            url: page.url(),
        };
        this.artifacts.push(artifact);
        return artifact;
    }
    getArtifacts() { return this.artifacts; }
    slugifyRoute(route) {
        return route
            .replace(/^\//, '')
            .replace(/\//g, '__')
            .replace(/[^\w\-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '') || 'home';
    }
}
//# sourceMappingURL=ScreenshotManager.js.map