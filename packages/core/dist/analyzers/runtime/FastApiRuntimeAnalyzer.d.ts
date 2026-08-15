/**
 * FastApiRuntimeAnalyzer — runtime safety review for FastAPI backends.
 *
 * Applies to: appType === 'fastapi' OR backendFramework === 'fastapi'
 *
 * Safety guarantees:
 * - Never starts the real server on production ports.
 * - Import checks only.
 * - Health/probe checks on a random high port.
 * - Never calls real external APIs.
 */
import type { Analyzer, AnalyzerContext, AnalyzerResult } from '../Analyzer.js';
import type { ProjectFingerprint } from '../../project/index.js';
export declare class FastApiRuntimeAnalyzer implements Analyzer {
    id: string;
    name: string;
    categories: string[];
    supports(fp: ProjectFingerprint): boolean;
    run(ctx: AnalyzerContext): Promise<AnalyzerResult>;
    private detectAppEntrypoint;
    private runImportCheck;
    private probeEndpoints;
    private httpGet;
    private analyzeFastApiStatic;
    private checkCors;
    private checkUnauthenticatedSensitiveRoutes;
    private checkRateLimiting;
    private checkErrorHandling;
}
//# sourceMappingURL=FastApiRuntimeAnalyzer.d.ts.map