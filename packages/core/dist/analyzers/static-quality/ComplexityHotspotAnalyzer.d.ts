/**
 * Complexity Hotspot Analyzer
 * Detects files, functions, and components that exceed complexity thresholds.
 * Flags: too-large files, too-large functions, too-large React components,
 * too-many nested conditionals.
 */
import type { Analyzer, AnalyzerContext, AnalyzerResult } from '../Analyzer.js';
import type { ProjectFingerprint } from '../../project/index.js';
export declare class ComplexityHotspotAnalyzer implements Analyzer {
    id: string;
    name: string;
    categories: string[];
    supports(fp: ProjectFingerprint): boolean;
    run(ctx: AnalyzerContext): Promise<AnalyzerResult>;
    private findSourceFiles;
    private extractFunctions;
    private findMatchingBrace;
    private cyclomaticComplexity;
    private findNestedConditionals;
}
//# sourceMappingURL=ComplexityHotspotAnalyzer.d.ts.map