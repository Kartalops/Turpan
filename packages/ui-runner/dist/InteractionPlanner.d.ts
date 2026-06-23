/**
 * InteractionPlanner — plans and executes realistic user interactions on a page.
 *
 * Philosophy: human-like QA — not a test runner.
 * - Scroll through the page to lazy-load content
 * - Click visible navigation links
 * - Open dropdowns and modals
 * - Fill forms with safe test data (no destructive submissions)
 * - Detect if buttons are wired or no-op
 *
 * Safety rules:
 * - No destructive actions (delete, payment submission)
 * - No real auth — only detect if login form exists and is wired
 * - No external payment flows
 */
import type { Page } from 'playwright';
import type { InteractionStep, InteractionResult, ViewportConfig } from './types.js';
export declare class InteractionPlanner {
    private steps;
    private results;
    private page;
    private viewport;
    /**
     * Plan interactions for a given page.
     * Analyzes the DOM to determine what interactions are possible.
     */
    plan(page: Page | null, viewport: ViewportConfig): Promise<InteractionStep[]>;
    /**
     * Execute a planned interaction and record the result.
     */
    execute(step: InteractionStep): Promise<InteractionResult>;
    private executeScroll;
    private executeClick;
    private executeFill;
    private executeHover;
    private isSelectorDestructive;
    private isPaymentButton;
    private planCtaClicks;
    private planDropdownOpens;
    private planModalOpens;
    private planFormInteractions;
    getResults(): InteractionResult[];
    getFailures(): InteractionResult[];
    summary(): {
        total: number;
        succeeded: number;
        failed: number;
    };
}
//# sourceMappingURL=InteractionPlanner.d.ts.map