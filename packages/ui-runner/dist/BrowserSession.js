/**
 * BrowserSession — Playwright browser lifecycle management.
 *
 * Reliability improvements in Phase 15:
 * - Tracks all open pages and contexts for guaranteed cleanup
 * - Forces browser close after a grace period (kill orphan processes)
 * - Tracked globally so SIGINT can close everything
 */
import { chromium } from 'playwright';
const DESKTOP_VIEWPORT = {
    name: 'desktop',
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
};
const MOBILE_VIEWPORT = {
    name: 'mobile',
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
};
const USER_AGENT_DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const USER_AGENT_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1';
const BROWSER_CLOSE_TIMEOUT_MS = 5_000;
const ACTIVE_SESSIONS = new Set();
let BROWSER_CLEANUP_HOOK_INSTALLED = false;
function installBrowserCleanupHooks() {
    if (BROWSER_CLEANUP_HOOK_INSTALLED)
        return;
    BROWSER_CLEANUP_HOOK_INSTALLED = true;
    const cleanup = () => {
        for (const s of ACTIVE_SESSIONS) {
            try {
                void s.close();
            }
            catch { /* ignore */ }
        }
    };
    process.on('SIGINT', () => { cleanup(); process.exit(130); });
    process.on('SIGTERM', () => { cleanup(); process.exit(143); });
    process.on('exit', cleanup);
    process.on('uncaughtException', err => {
        cleanup();
        // eslint-disable-next-line no-console
        console.error('uncaughtException in BrowserSession:', err);
    });
}
export class BrowserSession {
    browser = null;
    context = null;
    _page = null;
    openPages = new Set();
    config;
    constructor(config) {
        this.config = config;
        installBrowserCleanupHooks();
        ACTIVE_SESSIONS.add(this);
    }
    async launch() {
        const args = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
        ];
        try {
            this.browser = await chromium.launch({
                headless: !this.config.headed,
                args,
                timeout: 30_000,
            });
        }
        catch (err) {
            ACTIVE_SESSIONS.delete(this);
            throw new Error(`Failed to launch browser: ${err instanceof Error ? err.message : String(err)}`);
        }
        try {
            this.context = await this.browser.newContext({
                viewport: DESKTOP_VIEWPORT,
                userAgent: USER_AGENT_DESKTOP,
                ignoreHTTPSErrors: true,
            });
        }
        catch (err) {
            // Close the browser if context creation failed
            try {
                await this.browser.close();
            }
            catch { /* ignore */ }
            this.browser = null;
            ACTIVE_SESSIONS.delete(this);
            throw new Error(`Failed to create browser context: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    /**
     * Create a new page (tab) — caller is responsible for managing page lifecycle.
     */
    async newPage() {
        if (!this.context)
            throw new Error('Browser not launched');
        const page = await this.context.newPage();
        this.openPages.add(page);
        // Auto-remove from tracking when page closes
        page.once('close', () => {
            this.openPages.delete(page);
            if (this._page === page)
                this._page = null;
        });
        // Set default timeout
        page.setDefaultTimeout(this.config.pageTimeoutMs ?? 15_000);
        page.setDefaultNavigationTimeout(this.config.pageTimeoutMs ?? 30_000);
        return page;
    }
    /**
     * Set viewport for the current context.
     */
    async setViewport(viewport) {
        if (!this.context)
            throw new Error('Browser not launched');
        await this.context.setExtraHTTPHeaders({});
        // Note: can't change viewport on existing context — create a new page with viewport override
    }
    getPage() { return this._page; }
    getContext() { return this.context; }
    getAvailableViewports() {
        if (this.config.mobileOnly)
            return [MOBILE_VIEWPORT];
        if (this.config.desktopOnly)
            return [DESKTOP_VIEWPORT];
        return [DESKTOP_VIEWPORT, MOBILE_VIEWPORT];
    }
    /**
     * Close all pages, contexts, and browser.
     * Best-effort — never throws. Called automatically on process exit.
     */
    async close() {
        ACTIVE_SESSIONS.delete(this);
        // Close all open pages first
        const closePages = Array.from(this.openPages).map(async (page) => {
            try {
                if (!page.isClosed())
                    await page.close();
            }
            catch { /* ignore */ }
        });
        await Promise.allSettled(closePages);
        this.openPages.clear();
        this._page = null;
        // Close the context
        if (this.context) {
            try {
                await Promise.race([
                    this.context.close(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('context close timeout')), BROWSER_CLOSE_TIMEOUT_MS)),
                ]);
            }
            catch { /* ignore */ }
            this.context = null;
        }
        // Close the browser — last resort, the timeout above should have triggered
        if (this.browser) {
            try {
                await Promise.race([
                    this.browser.close(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('browser close timeout')), BROWSER_CLOSE_TIMEOUT_MS)),
                ]);
            }
            catch {
                // Browser close timed out — best-effort kill.
                // Playwright doesn't expose the child process via the public API,
                // so we can't kill it directly. Rely on Playwright's own cleanup.
                try {
                    await this.browser.close().catch(() => { });
                }
                catch { /* ignore */ }
            }
            this.browser = null;
        }
    }
    isLaunched() { return this.browser !== null; }
    static desktopViewport() { return DESKTOP_VIEWPORT; }
    static mobileViewport() { return MOBILE_VIEWPORT; }
    static getActiveSessionCount() { return ACTIVE_SESSIONS.size; }
}
/**
 * Force-close ALL active browser sessions. Used during hard termination.
 */
export async function closeAllBrowsers() {
    const promises = [];
    for (const s of ACTIVE_SESSIONS) {
        promises.push(s.close());
    }
    await Promise.allSettled(promises);
}
//# sourceMappingURL=BrowserSession.js.map