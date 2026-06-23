/**
 * Unused Export Analyzer
 * Detects exported functions/components that appear to never be imported elsewhere.
 * Conservative mode: only reports exports with high confidence of being unused.
 * Uses import graph analysis across all source files.
 */
import type { Analyzer, AnalyzerContext, AnalyzerResult } from '../Analyzer.js';
import type { ProjectFingerprint } from '../../project/index.js';
export declare class UnusedExportAnalyzer implements Analyzer {
    id: string;
    name: string;
    categories: string[];
    supports(fp: ProjectFingerprint): boolean;
    run(ctx: AnalyzerContext): Promise<AnalyzerResult>;
    private findSourceFiles;
    private extractExports;
    private extractImports;
    private buildGlobalImportSet;
}
//# sourceMappingURL=UnusedExportAnalyzer.d.ts.map