/**
 * Placeholder / Fake Implementation Analyzer
 * Detects placeholder code, TODOs treated as real code, fake implementations,
 * mock-only code, hardcoded success returns, and not-implemented patterns.
 */
import type { Analyzer, AnalyzerContext, AnalyzerResult } from '../Analyzer.js';
import type { ProjectFingerprint } from '../../project/index.js';
export declare class PlaceholderAnalyzer implements Analyzer {
    id: string;
    name: string;
    categories: string[];
    supports(fp: ProjectFingerprint): boolean;
    run(ctx: AnalyzerContext): Promise<AnalyzerResult>;
    private findSourceFiles;
}
//# sourceMappingURL=PlaceholderAnalyzer.d.ts.map