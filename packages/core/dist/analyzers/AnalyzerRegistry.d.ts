/**
 * AnalyzerRegistry — tracks and discovers available analyzers
 */
import type { Analyzer, AnalyzerContext, AnalyzerResult } from './Analyzer.js';
import type { ProjectFingerprint } from '../project/index.js';
export declare class AnalyzerRegistry {
    private analyzers;
    register(analyzer: Analyzer): void;
    unregister(id: string): void;
    get(id: string): Analyzer | undefined;
    listAll(): Analyzer[];
    /** Returns all analyzers that support the given fingerprint */
    applicableTo(fingerprint: ProjectFingerprint): Analyzer[];
    /** Run all applicable analyzers for a project */
    runApplicable(fingerprint: ProjectFingerprint, ctx: Omit<AnalyzerContext, 'fingerprint'>): Promise<AnalyzerResult[]>;
    /** Group results by category */
    groupByCategory(results: AnalyzerResult[]): Map<string, AnalyzerResult[]>;
}
export declare const globalRegistry: AnalyzerRegistry;
//# sourceMappingURL=AnalyzerRegistry.d.ts.map