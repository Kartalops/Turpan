/**
 * runAnalyzers — utility to run a set of analyzers and collect findings
 */
import type { AnalyzerContext, AnalyzerResult } from './Analyzer.js';
import { type AnalyzerRegistry } from './AnalyzerRegistry.js';
/**
 * Result of running all static-quality analyzers
 */
export interface StaticQualityRunResult {
    results: AnalyzerResult[];
    totalFindings: number;
    findingsByCategory: Map<string, AnalyzerResult[]>;
    findingsByAnalyzer: Map<string, AnalyzerResult>;
    errors: string[];
    totalDurationMs: number;
}
export declare function runStaticQualityAnalyzers(ctx: AnalyzerContext, registry?: AnalyzerRegistry): Promise<StaticQualityRunResult>;
/**
 * Categorize findings into cleanup safety tiers
 */
export interface CleanupCandidate {
    finding: AnalyzerResult['findings'][number];
    analyzerId: string;
    risk: 'safe' | 'risky' | 'unknown';
    reason: string;
}
export declare function categorizeCleanupCandidates(results: AnalyzerResult[]): {
    safe: CleanupCandidate[];
    risky: CleanupCandidate[];
    unknown: CleanupCandidate[];
};
//# sourceMappingURL=runAnalyzers.d.ts.map