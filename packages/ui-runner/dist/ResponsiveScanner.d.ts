/**
 * ResponsiveScanner — check UI behavior across viewport sizes.
 *
 * Detects:
 * - Horizontal overflow on mobile
 * - Elements that overflow viewport width
 * - Text that wraps awkwardly
 */
import type { Page, BrowserContext } from 'playwright';
import type { ResponsiveResult, ViewportConfig } from './types.js';
export declare class ResponsiveScanner {
    /**
     * Check if a page has horizontal overflow at a given viewport.
     */
    checkOverflow(page: Page, viewport: ViewportConfig): Promise<{
        hasOverflow: boolean;
        overflowPx: number;
    }>;
    /**
     * Detect which elements are causing overflow.
     */
    findOverflowElements(page: Page, threshold?: number): Promise<Array<{
        selector: string;
        overflowPx: number;
        tag: string;
    }>>;
    /**
     * Run full responsive check across multiple viewports.
     */
    scan(browser: BrowserContext, url: string, viewports: ViewportConfig[]): Promise<ResponsiveResult[]>;
}
//# sourceMappingURL=ResponsiveScanner.d.ts.map