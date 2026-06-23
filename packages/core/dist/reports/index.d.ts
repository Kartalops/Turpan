import type { AnalysisResult, Scorecard } from '@turpan/shared';
export declare function ensureDir(dirPath: string): void;
export declare function generateMarkdownReport(result: AnalysisResult): string;
export declare function generateJsonReport(result: AnalysisResult): string;
export declare function generateScorecardReport(scorecard: Scorecard): string;
export declare function writeReports(runPath: string, result: AnalysisResult): void;
export declare function writePlaceholderReports(runPath: string): void;
//# sourceMappingURL=index.d.ts.map