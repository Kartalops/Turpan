/**
 * Unused File Analyzer
 * Detects likely orphaned files (components/utils) that no other file imports.
 * Skips route files and config files.
 */
import type { Analyzer, AnalyzerContext, AnalyzerResult } from '../Analyzer.js';
import type { ProjectFingerprint } from '../../project/index.js';
export declare class UnusedFileAnalyzer implements Analyzer {
    id: string;
    name: string;
    categories: string[];
    supports(fp: ProjectFingerprint): boolean;
    run(ctx: AnalyzerContext): Promise<AnalyzerResult>;
    private getCandidateDirs;
    private findCandidateFiles;
    private shouldSkip;
    private buildImportGraph;
    private extractImports;
}
//# sourceMappingURL=UnusedFileAnalyzer.d.ts.map