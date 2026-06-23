/**
 * WorkerRuntimeAnalyzer — runtime safety review for worker/queue systems (Celery, RQ, BullMQ, etc.).
 *
 * Applies to: Python or Node projects with worker patterns (celery, rq, redis, bull, bullmq)
 *
 * Safety guarantees:
 * - Never runs destructive jobs.
 * - Never enqueues real work.
 * - Validates import/startup only.
 */
import type { Analyzer, AnalyzerContext, AnalyzerResult } from '../Analyzer.js';
import type { ProjectFingerprint } from '../../project/index.js';
export declare class WorkerRuntimeAnalyzer implements Analyzer {
    id: string;
    name: string;
    categories: string[];
    supports(fp: ProjectFingerprint): boolean;
    run(ctx: AnalyzerContext): Promise<AnalyzerResult>;
    private detectWorkerPattern;
    private checkRetryAndDLQ;
    private checkIdempotency;
    private checkGracefulShutdown;
    private checkHeartbeat;
}
//# sourceMappingURL=WorkerRuntimeAnalyzer.d.ts.map