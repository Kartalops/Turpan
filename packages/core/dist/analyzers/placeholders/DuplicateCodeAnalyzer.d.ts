/**
 * Duplicate Code / Basic Clone Detection Analyzer
 * Detects near-duplicate files and repeated code blocks.
 * Conservative: only flags files with high similarity.
 */
import type { Analyzer, AnalyzerContext, AnalyzerResult } from '../Analyzer.js';
import type { ProjectFingerprint } from '../../project/index.js';
export declare class DuplicateCodeAnalyzer implements Analyzer {
    id: string;
    name: string;
    categories: string[];
    supports(fp: ProjectFingerprint): boolean;
    run(ctx: AnalyzerContext): Promise<AnalyzerResult>;
    private findSourceFiles;
    /**
     * Compute similarity ratio between two strings using a simple line-based approach.
     * Returns 0-1 where 1 = identical.
     */
    private computeSimilarity;
}
//# sourceMappingURL=DuplicateCodeAnalyzer.d.ts.map