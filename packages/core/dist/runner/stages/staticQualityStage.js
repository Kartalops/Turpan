/**
 * Static Quality Stage — runs all static quality analyzers
 * Handles: static-quality, dead-code-basic, security-basic StageIds
 */
import { globalRegistry } from '../../analyzers/index.js';
import { UnusedDependencyAnalyzer, } from '../../analyzers/dependencies/index.js';
import { UnusedFileAnalyzer, UnusedExportAnalyzer, } from '../../analyzers/dead-code/index.js';
import { PlaceholderAnalyzer, DuplicateCodeAnalyzer, } from '../../analyzers/placeholders/index.js';
import { ComplexityHotspotAnalyzer, } from '../../analyzers/static-quality/index.js';
import { ArchitectureBasicAnalyzer, } from '../../analyzers/architecture-basic/index.js';
// Register all analyzers (idempotent — safe to call multiple times)
function registerAnalyzers() {
    const analyzers = [
        new UnusedDependencyAnalyzer(),
        new UnusedFileAnalyzer(),
        new UnusedExportAnalyzer(),
        new PlaceholderAnalyzer(),
        new DuplicateCodeAnalyzer(),
        new ComplexityHotspotAnalyzer(),
        new ArchitectureBasicAnalyzer(),
    ];
    for (const a of analyzers) {
        if (!globalRegistry.get(a.id)) {
            globalRegistry.register(a);
        }
    }
}
registerAnalyzers();
/** Stage IDs this module handles */
const HANDLED_IDS = ['static-quality', 'dead-code-basic', 'security-basic'];
/**
 * Run the static quality / dead-code / security analyzers.
 * Acts as a single stage that fans out to multiple analyzers.
 */
export async function runStaticQualityStage(ctx, stageId = 'static-quality') {
    const start = Date.now();
    const errors = [];
    // Build analyzer context from ReviewContext
    const analyzerCtx = {
        projectRoot: ctx.projectRoot,
        fingerprint: ctx.fingerprint,
        deepAnalysis: ctx.deepAnalysis,
        signal: ctx.signal,
    };
    // Determine which analyzer categories to run based on stageId
    const categoryMap = {
        'static-quality': ['maintainability', 'dependency', 'architecture', 'agent-output'],
        'dead-code-basic': ['dead-code'],
        'security-basic': ['security'],
    };
    const targetCategories = new Set(categoryMap[stageId] ?? Object.values(categoryMap).flat());
    // Run applicable analyzers
    const applicableAnalyzers = globalRegistry.applicableTo(ctx.fingerprint)
        .filter(a => a.categories.some(c => targetCategories.has(c)));
    const allFindings = [];
    for (const analyzer of applicableAnalyzers) {
        if (ctx.signal?.aborted)
            break;
        try {
            const result = await analyzer.run(analyzerCtx);
            allFindings.push(...result.findings);
            if (result.errors.length > 0) {
                errors.push(...result.errors.map(e => `[${analyzer.id}] ${e}`));
            }
        }
        catch (err) {
            errors.push(`[${analyzer.id}] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return {
        stageId,
        status: errors.length > 0 && allFindings.length === 0 ? 'failed' : 'completed',
        findings: allFindings,
        durationMs: Date.now() - start,
        artifacts: {
            analyzersRun: applicableAnalyzers.map(a => a.id),
            analyzerCount: applicableAnalyzers.length,
            errors,
        },
        error: errors.length > 0 ? errors.join('; ') : undefined,
    };
}
//# sourceMappingURL=staticQualityStage.js.map