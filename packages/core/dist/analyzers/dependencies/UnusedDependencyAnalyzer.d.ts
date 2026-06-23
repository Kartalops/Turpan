/**
 * Unused Dependency Analyzer
 * Compares package.json dependencies to actual import/require usage in source files.
 * Conservative: only reports dependencies with zero usage references.
 */
import type { Analyzer, AnalyzerContext, AnalyzerResult } from '../Analyzer.js';
import type { ProjectFingerprint } from '../../project/index.js';
export declare class UnusedDependencyAnalyzer implements Analyzer {
    id: string;
    name: string;
    categories: string[];
    supports(fp: ProjectFingerprint): boolean;
    run(ctx: AnalyzerContext): Promise<AnalyzerResult>;
    private findSourceFiles;
    /** Check if a dependency is referenced in file content */
    private isUsedInContent;
}
//# sourceMappingURL=UnusedDependencyAnalyzer.d.ts.map