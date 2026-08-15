import type { BrowserObservation, UiAction, UiStateGraph } from './types.js';
import { SafeExplorationPolicy } from './SafeExplorationPolicy.js';
export interface SemanticBrowser {
    openPage(url: string): Promise<BrowserObservation>;
    inspectPage(): Promise<BrowserObservation>;
    click(action: UiAction): Promise<BrowserObservation>;
    type(action: UiAction): Promise<BrowserObservation>;
    select(action: UiAction): Promise<BrowserObservation>;
    submit(action: UiAction): Promise<BrowserObservation>;
    back(): Promise<BrowserObservation>;
    reload(): Promise<BrowserObservation>;
    waitFor(label: string, timeoutMs: number): Promise<BrowserObservation>;
    readConsole(): Promise<string[]>;
    readNetwork(): Promise<BrowserObservation['networkErrors']>;
    takeScreenshot(label: string): Promise<string>;
    getAccessibilityTree(): Promise<unknown>;
}
export declare class BrowserAgent {
    private readonly browser;
    private readonly policy;
    constructor(browser: SemanticBrowser, policy?: SafeExplorationPolicy);
    explore(startUrl: string, options: {
        maxStates: number;
    }): Promise<UiStateGraph>;
    private perform;
}
//# sourceMappingURL=BrowserAgent.d.ts.map