/**
 * BrowserSession — Playwright browser lifecycle management.
 *
 * Reliability improvements in Phase 15:
 * - Tracks all open pages and contexts for guaranteed cleanup
 * - Forces browser close after a grace period (kill orphan processes)
 * - Tracked globally so SIGINT can close everything
 */
import { type Page, type BrowserContext } from 'playwright';
import type { ViewportConfig, UiRunnerConfig } from './types.js';
export declare class BrowserSession {
    private browser;
    private context;
    private _page;
    private openPages;
    private config;
    constructor(config: UiRunnerConfig);
    launch(): Promise<void>;
    /**
     * Create a new page (tab) — caller is responsible for managing page lifecycle.
     */
    newPage(): Promise<Page>;
    /**
     * Set viewport for the current context.
     */
    setViewport(viewport: ViewportConfig): Promise<void>;
    getPage(): Page | null;
    getContext(): BrowserContext | null;
    getAvailableViewports(): ViewportConfig[];
    /**
     * Close all pages, contexts, and browser.
     * Best-effort — never throws. Called automatically on process exit.
     */
    close(): Promise<void>;
    isLaunched(): boolean;
    static desktopViewport(): ViewportConfig;
    static mobileViewport(): ViewportConfig;
    static getActiveSessionCount(): number;
}
/**
 * Force-close ALL active browser sessions. Used during hard termination.
 */
export declare function closeAllBrowsers(): Promise<void>;
//# sourceMappingURL=BrowserSession.d.ts.map