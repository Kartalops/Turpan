/**
 * AccessibilityScanner — basic deterministic accessibility checks.
 *
 * Checks (no external tools required):
 * - Images missing alt text
 * - Buttons/links missing accessible names
 * - Form inputs missing labels
 * - Headings skipped (h1 → h3)
 * - Focusable elements missing visible focus styles
 * - ARIA attributes used incorrectly
 */
import type { Page } from 'playwright';
import type { AccessibilityResult, ViewportConfig } from './types.js';
export declare class AccessibilityScanner {
    /**
     * Run a basic accessibility scan on the page.
     * Returns issues sorted by severity.
     */
    scan(page: Page, viewport: ViewportConfig): Promise<AccessibilityResult>;
    private checkImages;
    private checkButtons;
    private checkFormInputs;
    private checkHeadings;
    private checkAria;
}
//# sourceMappingURL=AccessibilityScanner.d.ts.map