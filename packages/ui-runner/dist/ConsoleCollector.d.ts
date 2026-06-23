/**
 * ConsoleCollector — intercept and categorize browser console output.
 *
 * Distinguishes:
 * - Runtime errors (actual JS exceptions)
 * - Hydration errors (React Next.js mismatch)
 * - Warnings vs errors
 * - Logs from the app vs from external sources
 */
import type { Page } from 'playwright';
import type { ConsoleEntry } from './types.js';
export declare class ConsoleCollector {
    private entries;
    private onEntry?;
    constructor(onEntry?: (entry: ConsoleEntry) => void);
    /**
     * Attach console listeners to a Playwright page.
     * Must be called before any navigation.
     */
    attach(page: Page): void;
    private processMessage;
    getEntries(): ConsoleEntry[];
    getErrors(): ConsoleEntry[];
    getRuntimeErrors(): ConsoleEntry[];
    getHydrationErrors(): ConsoleEntry[];
    clear(): void;
    hasErrors(): boolean;
    summary(): {
        total: number;
        errors: number;
        warnings: number;
        runtime: number;
        hydration: number;
    };
}
//# sourceMappingURL=ConsoleCollector.d.ts.map