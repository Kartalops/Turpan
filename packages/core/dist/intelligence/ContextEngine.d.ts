import type { ContextItem, ContextSelectionInput } from './types.js';
export declare class ContextEngine {
    private summaryCache;
    select(input: ContextSelectionInput): ContextItem[];
    summarize(content: string, id: string): ContextItem;
    private fileItem;
    private item;
    private isTestFile;
    private hash;
}
//# sourceMappingURL=ContextEngine.d.ts.map