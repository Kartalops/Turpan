/**
 * Diff-scoped stage — runs diff-scoped security, correctness, and test-coverage
 * analyzers against the git diff when diffMode is enabled.
 */
import { createFinding, confidence } from '../../findings/Finding.js';
import { createEvidence } from '../../findings/Evidence.js';
import { DiffScopedSecurityAnalyzers, ChangedSurfaceAnalyzer, TestCoverageAnalyzer, } from '@turpan/diff-analyzers';
/** Map diff-analyzer categories to core Finding categories */
function mapCategory(cat) {
    if (cat === 'security')
        return 'security';
    if (cat === 'test-coverage')
        return 'test';
    // correctness → architecture
    return 'architecture';
}
/** Convert a DiffScopedFinding to a core Finding */
function toFinding(f, _ctx) {
    return createFinding({
        id: `diff-${f.id}`,
        title: f.title,
        severity: f.severity,
        category: mapCategory(f.category),
        explanation: f.explanation,
        file: f.file,
        line: f.line,
        evidence: f.diffLines?.length
            ? [createEvidence('diff', { excerpt: f.diffLines.map((l) => l.content).join('\n') })]
            : [],
        fixable: 'manual',
        confidence: confidence(f.confidence ?? 80),
        tags: [`diff-scoped`, `introduced-by-${f.introducedBy}`, f.pattern],
    });
}
export async function runDiffScopedStage(ctx) {
    const start = Date.now();
    const errors = [];
    const allFindings = [];
    if (!ctx.diffMode || !ctx.diffResult) {
        return {
            stageId: 'diff-scoped',
            status: 'skipped',
            findings: [],
            durationMs: 0,
            artifacts: { findingsCount: 0, errors: [] },
        };
    }
    try {
        const [secResult, correctResult, covResult] = await Promise.all([
            new DiffScopedSecurityAnalyzers().run({ diffResult: ctx.diffResult, projectRoot: ctx.projectRoot }),
            new ChangedSurfaceAnalyzer().run({ diffResult: ctx.diffResult, projectRoot: ctx.projectRoot }),
            new TestCoverageAnalyzer().run({ diffResult: ctx.diffResult, projectRoot: ctx.projectRoot }),
        ]);
        allFindings.push(...secResult.findings.map((f) => toFinding(f, ctx)));
        allFindings.push(...correctResult.findings.map((f) => toFinding(f, ctx)));
        allFindings.push(...covResult.findings.map((f) => toFinding(f, ctx)));
    }
    catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
    }
    return {
        stageId: 'diff-scoped',
        status: errors.length > 0 ? 'failed' : 'completed',
        findings: allFindings,
        durationMs: Date.now() - start,
        artifacts: { findingsCount: allFindings.length, errors },
        error: errors.length > 0 ? errors.join('; ') : undefined,
    };
}
//# sourceMappingURL=diffScopedStage.js.map