/**
 * Architecture Basic Analyzer
 * Detects fundamental architectural issues:
 * - Circular imports
 * - API/client duplication
 * - Scattered process.env usage
 * - Business logic inside UI components
 */
import type { Analyzer, AnalyzerContext, AnalyzerResult } from '../Analyzer.js';
import type { ProjectFingerprint } from '../../project/index.js';
export declare class ArchitectureBasicAnalyzer implements Analyzer {
    id: string;
    name: string;
    categories: string[];
    supports(fp: ProjectFingerprint): boolean;
    run(ctx: AnalyzerContext): Promise<AnalyzerResult>;
    private detectCircularImports;
    /** Normalize a relative import path: resolve ../, strip ./, strip .js/.ts/.tsx */
    private normalizeImportPath;
    private extractRelativeImports;
    private detectApiDuplication;
    private detectScatteredEnvUsage;
    private detectBusinessLogicInUI;
    private findSourceFiles;
}
//# sourceMappingURL=ArchitectureBasicAnalyzer.d.ts.map