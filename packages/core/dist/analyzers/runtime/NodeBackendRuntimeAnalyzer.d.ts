/**
 * NodeBackendRuntimeAnalyzer — runtime safety review for Node.js backends (Express, Fastify, NestJS).
 *
 * Applies to: appType === 'node-backend' OR backendFramework in [express, fastify, nestjs]
 *
 * Safety guarantees:
 * - Never runs destructive commands.
 * - Import/startup validation only — does not execute application logic.
 * - Does not call real external APIs.
 */
import type { Analyzer, AnalyzerContext, AnalyzerResult } from '../Analyzer.js';
import type { ProjectFingerprint } from '../../project/index.js';
export declare class NodeBackendRuntimeAnalyzer implements Analyzer {
    id: string;
    name: string;
    categories: string[];
    supports(fp: ProjectFingerprint): boolean;
    run(ctx: AnalyzerContext): Promise<AnalyzerResult>;
    private detectEntrypoint;
    private runStartupCheck;
    private analyzePatterns;
    private checkUnhandledRejections;
    private checkUncaughtExceptions;
    private checkErrorMiddleware;
    private checkSyncCron;
}
//# sourceMappingURL=NodeBackendRuntimeAnalyzer.d.ts.map