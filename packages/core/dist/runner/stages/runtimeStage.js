/**
 * Runtime Stage — runs all runtime analyzers for Python bots, FastAPI, Node backends,
 * CLI tools, workers, and MCP servers.
 */
import { globalRegistry } from '../../analyzers/index.js';
import { PythonRuntimeAnalyzer, FastApiRuntimeAnalyzer, NodeBackendRuntimeAnalyzer, CliRuntimeAnalyzer, WorkerRuntimeAnalyzer, McpRuntimeAnalyzer, } from '../../analyzers/runtime/index.js';
/** Register all runtime analyzers (idempotent) */
function registerRuntimeAnalyzers() {
    const analyzers = [
        new PythonRuntimeAnalyzer(),
        new FastApiRuntimeAnalyzer(),
        new NodeBackendRuntimeAnalyzer(),
        new CliRuntimeAnalyzer(),
        new WorkerRuntimeAnalyzer(),
        new McpRuntimeAnalyzer(),
    ];
    for (const a of analyzers) {
        if (!globalRegistry.get(a.id)) {
            globalRegistry.register(a);
        }
    }
}
registerRuntimeAnalyzers();
/**
 * Run the runtime analyzers for a project.
 * This stage covers Python bots, FastAPI backends, Node backends,
 * CLI tools, workers, and MCP servers.
 */
export async function runRuntimeStage(ctx) {
    const start = Date.now();
    const errors = [];
    const analyzerCtx = {
        projectRoot: ctx.projectRoot,
        fingerprint: ctx.fingerprint,
        deepAnalysis: ctx.deepAnalysis,
        signal: ctx.signal,
    };
    // Run all applicable runtime analyzers
    const applicableAnalyzers = globalRegistry.applicableTo(ctx.fingerprint)
        .filter(a => a.categories.includes('runtime'));
    const allFindings = [];
    const analyzersRun = [];
    for (const analyzer of applicableAnalyzers) {
        if (ctx.signal?.aborted)
            break;
        try {
            const result = await analyzer.run(analyzerCtx);
            allFindings.push(...result.findings);
            analyzersRun.push(analyzer.id);
            if (result.errors.length > 0) {
                errors.push(...result.errors.map(e => `[${analyzer.id}] ${e}`));
            }
        }
        catch (err) {
            errors.push(`[${analyzer.id}] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return {
        stageId: 'runtime',
        status: errors.length > 0 && allFindings.length === 0 ? 'failed' : 'completed',
        findings: allFindings,
        durationMs: Date.now() - start,
        artifacts: {
            analyzersRun,
            analyzerCount: applicableAnalyzers.length,
            errors,
        },
        error: errors.length > 0 ? errors.join('; ') : undefined,
    };
}
//# sourceMappingURL=runtimeStage.js.map